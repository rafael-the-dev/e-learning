"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Search } from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Textarea } from "@/shared/components/ui/textarea";
import { Checkbox } from "@/shared/components/ui/checkbox";
import { Card, CardContent } from "@/shared/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import { Skeleton } from "@/shared/components/ui/skeleton";
import { cn } from "@/shared/lib/utils";
import { toast } from "@/shared/hooks/use-toast";
import { ConfirmDialog } from "@/shared/components/feedback/confirm-dialog";
import { ExaminationEmptyState } from "@/modules/examinations/components/examination-states";
import { bulkCodeLabel } from "@/modules/examinations/components/bulk-summary-dialog";
import type {
  TeacherExamCapabilitiesDto,
  TeacherExamResultsViewDto,
  TeacherResultRowDto,
} from "@/modules/teacher-examinations/types";
import {
  AttendanceStatusBadge,
  ResultStatusBadge,
  TeacherExamStatusBadge,
  getTeacherExamStatusLabel,
  getTeacherExamStatusOptions,
} from "./teacher-exam-status-labels";

// =============================================================================
// TeacherResultsSection (Sprint 3 — RESULTS WRITES)
// -----------------------------------------------------------------------------
// Teacher-facing interactive result entry for a single session, mirroring the admin
// `examinations/components/results-tab.tsx` interaction model (inline score entry,
// "Guardar rascunhos", per-selection + whole-session bulk, summary dialog) but calling
// the TEACHER endpoints (teacherId is server-resolved — never sent) and the teacher
// DTOs. The teacher ceiling is SUBMITTED: create → update-draft → submit; NEVER
// review / approve / publish / integrate.
//
// The result CODE is DERIVED from attendance by the engine (never a free choice):
//   PRESENT | LATE → SCORED (numeric score required, 0 ≤ score ≤ maxScore)
//   ABSENT         → ABSENT (code only)
//   EXCUSED        → EXCUSED (code only)
//   DISQUALIFIED   → DISQUALIFIED (code only, requires a reason)
// A candidate with NO attendance cannot get a result (the backend blocks it — the
// row's `capabilities.createBlockReason` explains it). We NEVER derive PASSED/FAILED.
// `maxScore` is the SESSION's exam max, the same for all candidates.
//
// Concurrency (strict, same as Sprint 2): per-row actions disable while a request is
// in flight; state is updated ONLY from the SERVER-RETURNED payload (no irreversible
// optimism); on error the confirmed server data is kept and the server `error` is
// toasted; the roster is refetched after ANY bulk; a state conflict (RESULT_STALE,
// RESULT_NOT_DRAFT, …) keeps the server data. A `beforeunload` guard warns when there
// are dirty (unsaved) score inputs.
// =============================================================================

// Engine result-code vocabulary (English domain values; PT-PT is render-only).
const RESULT_CODE = {
  SCORED: "SCORED",
  ABSENT: "ABSENT",
  EXCUSED: "EXCUSED",
  DISQUALIFIED: "DISQUALIFIED",
} as const;

const RESULT_STATUS_DRAFT = "DRAFT";

const NO_RESULT_FILTER = "NO_RESULT";
const ALL_FILTER = "ALL";

// A per-row score input, keyed by examCandidateId. Only meaningful for SCORED rows.
type ScoreEdits = Record<string, string>;

// ── Command response shapes (from the backend contract) ──────────────────────
interface CreateResponse {
  examResultId: string;
  examCandidateId: string;
  status: string;
  resultCode: string;
  score: number | null;
  maxScore: number;
  normalizedScore: number | null;
  error?: string;
}
interface UpdateResponse {
  examResultId: string;
  status: string;
  resultCode: string;
  score: number | null;
  maxScore: number;
  normalizedScore: number | null;
  error?: string;
}
interface SubmitResponse {
  examResultId: string;
  status: string;
  error?: string;
}

// ── Bulk response shapes ─────────────────────────────────────────────────────
interface BulkCreateItem {
  examCandidateId: string;
  ok: boolean;
  code?: string;
  message?: string;
}
interface BulkCreateResponse {
  total: number;
  succeeded: number;
  failed: number;
  skipped: number;
  items: BulkCreateItem[];
  error?: string;
}
interface BulkSubmitItem {
  examResultId: string;
  ok: boolean;
  code?: string;
  message?: string;
}
interface BulkSubmitResponse {
  total: number;
  succeeded: number;
  failed: number;
  skipped: number;
  items: BulkSubmitItem[];
  error?: string;
}

// A unified per-candidate summary (refs are always resolvable to a candidate name).
interface UnifiedItem {
  ref: string;
  ok: boolean;
  code?: string;
  message?: string;
}
interface UnifiedSummary {
  title: string;
  succeeded: number;
  skipped: number;
  failed: number;
  items: UnifiedItem[];
}

type ConfirmState =
  | { kind: "submit-one"; row: TeacherResultRowDto }
  | { kind: "submit-bulk"; resultIds: string[]; scope: "selected" | "all" };

// ── Small helpers ─────────────────────────────────────────────────────────────

/** A finite score string within [0, maxScore]. */
function isScoreValid(scoreStr: string, maxScore: number | null): boolean {
  if (maxScore == null || !(maxScore > 0)) return false;
  if (scoreStr.trim() === "") return false;
  const n = Number(scoreStr);
  return Number.isFinite(n) && n >= 0 && n <= maxScore;
}

function computeCounters(rows: TeacherResultRowDto[]) {
  let noResult = 0;
  let draft = 0;
  let submitted = 0;
  for (const r of rows) {
    if (!r.result) noResult += 1;
    else if (r.result.status === RESULT_STATUS_DRAFT) draft += 1;
    else if (r.result.status === "SUBMITTED") submitted += 1;
  }
  return { total: rows.length, noResult, draft, submitted };
}

function CounterCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border bg-card px-3 py-2">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-lg font-semibold tabular-nums">{value}</p>
    </div>
  );
}

export function TeacherResultsSection({ sessionId }: { sessionId: string }) {
  const [rows, setRows] = useState<TeacherResultRowDto[]>([]);
  const [capabilities, setCapabilities] = useState<TeacherExamCapabilitiesDto | null>(null);
  const [viewMaxScore, setViewMaxScore] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [maxScoreStr, setMaxScoreStr] = useState("");
  const [edits, setEdits] = useState<ScoreEdits>({});

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>(ALL_FILTER);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const [pendingRows, setPendingRows] = useState<Set<string>>(new Set());
  const [bulkPending, setBulkPending] = useState(false);
  const [summary, setSummary] = useState<UnifiedSummary | null>(null);
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);
  const [disqualifyRow, setDisqualifyRow] = useState<TeacherResultRowDto | null>(null);

  const rosterUrl = `/api/teacher/examinations/sessions/${sessionId}/results`;

  // ── Fetch / reload ───────────────────────────────────────────────────────────
  const fetchRoster = useCallback(async (): Promise<TeacherExamResultsViewDto | null> => {
    try {
      const res = await fetch(rosterUrl);
      if (!res.ok) return null;
      return (await res.json()) as TeacherExamResultsViewDto;
    } catch {
      return null;
    }
  }, [rosterUrl]);

  function applyView(dto: TeacherExamResultsViewDto): void {
    setRows(dto.rows.map((r) => ({ ...r })));
    setCapabilities(dto.capabilities);
    setViewMaxScore(dto.maxScore);
    setSelected(new Set());
    // Seed the session max input from the canonical value when the server has one.
    setMaxScoreStr((prev) => (dto.maxScore != null ? String(dto.maxScore) : prev));
    // Seed per-row score inputs from existing DRAFT SCORED results.
    setEdits(() => {
      const next: ScoreEdits = {};
      for (const r of dto.rows) {
        if (
          r.result &&
          r.result.status === RESULT_STATUS_DRAFT &&
          r.result.resultCode === RESULT_CODE.SCORED
        ) {
          next[r.examCandidateId] = r.result.score != null ? String(r.result.score) : "";
        }
      }
      return next;
    });
  }

  // Initial load — setState only inside the async callback (the roster is an external
  // system we synchronize from), never synchronously in the effect body.
  useEffect(() => {
    let alive = true;
    void (async () => {
      const dto = await fetchRoster();
      if (!alive) return;
      if (dto) {
        applyView(dto);
        setLoadError(null);
      } else {
        setLoadError("Não foi possível carregar os resultados.");
      }
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [fetchRoster]);

  const reloadRoster = useCallback(async (): Promise<boolean> => {
    const dto = await fetchRoster();
    if (dto) {
      applyView(dto);
      return true;
    }
    return false;
  }, [fetchRoster]);

  // ── Derived: the canonical session max ────────────────────────────────────────
  // Locked once the server exposes one OR any persisted result already fixes it.
  const persistedMax = useMemo(() => {
    if (viewMaxScore != null) return viewMaxScore;
    for (const r of rows) if (r.result?.maxScore != null) return r.result.maxScore;
    return null;
  }, [viewMaxScore, rows]);

  const maxScoreLocked = persistedMax != null;
  const effectiveMaxScore = maxScoreLocked
    ? persistedMax
    : maxScoreStr.trim() !== "" && Number.isFinite(Number(maxScoreStr)) && Number(maxScoreStr) > 0
      ? Number(maxScoreStr)
      : null;
  const maxScoreValid = effectiveMaxScore != null && effectiveMaxScore > 0;

  // ── Row classification helpers ─────────────────────────────────────────────────
  const isCreatable = (r: TeacherResultRowDto): boolean => !r.result && r.capabilities.canCreateResult;
  const isDraft = (r: TeacherResultRowDto): boolean => r.result?.status === RESULT_STATUS_DRAFT;
  const isScoreEditable = (r: TeacherResultRowDto): boolean => {
    if (isCreatable(r)) return r.expectedResultCode === RESULT_CODE.SCORED;
    if (isDraft(r) && r.capabilities.canUpdateDraft) return r.result?.resultCode === RESULT_CODE.SCORED;
    return false;
  };

  // A row whose typed score differs from what is persisted (or is a new entry).
  const isDirty = useCallback(
    (r: TeacherResultRowDto): boolean => {
      if (!isScoreEditable(r)) return false;
      const typed = edits[r.examCandidateId] ?? "";
      const current = r.result?.score != null ? String(r.result.score) : "";
      return typed.trim() !== current.trim();
    },
    // isScoreEditable is stable enough for our needs (depends on rows/edits already tracked)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [edits, rows]
  );

  const hasDirty = useMemo(() => rows.some((r) => isDirty(r)), [rows, isDirty]);

  // beforeunload guard while there are unsaved score inputs.
  useEffect(() => {
    if (!hasDirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [hasDirty]);

  // ── State mutators ─────────────────────────────────────────────────────────────
  const setRowResult = useCallback(
    (candidateId: string, next: TeacherResultRowDto["result"], caps?: Partial<TeacherResultRowDto["capabilities"]>): void => {
      setRows((prev) =>
        prev.map((r) =>
          r.examCandidateId === candidateId
            ? { ...r, result: next, capabilities: caps ? { ...r.capabilities, ...caps } : r.capabilities }
            : r
        )
      );
    },
    []
  );

  function markPending(candidateId: string, on: boolean): void {
    setPendingRows((prev) => {
      const nextSet = new Set(prev);
      if (on) nextSet.add(candidateId);
      else nextSet.delete(candidateId);
      return nextSet;
    });
  }

  function setScore(candidateId: string, value: string): void {
    setEdits((prev) => ({ ...prev, [candidateId]: value }));
  }

  // ── Single writes — no optimistic success; row updated from the response ────────
  async function createOne(row: TeacherResultRowDto, extra: { score?: number; reason?: string }): Promise<void> {
    if (!maxScoreValid || pendingRows.has(row.examCandidateId)) return;
    markPending(row.examCandidateId, true);
    try {
      const res = await fetch(`/api/teacher/examinations/candidates/${row.examCandidateId}/results`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ maxScore: effectiveMaxScore, ...extra }),
      });
      const json = (await res.json().catch(() => ({}))) as Partial<CreateResponse>;
      if (res.ok && json.examResultId) {
        setRowResult(
          row.examCandidateId,
          {
            examResultId: json.examResultId,
            score: json.score ?? null,
            maxScore: json.maxScore ?? effectiveMaxScore,
            normalizedScore: json.normalizedScore ?? null,
            resultCode: json.resultCode ?? row.expectedResultCode,
            status: json.status ?? RESULT_STATUS_DRAFT,
          }
        );
        if (json.score != null) setScore(row.examCandidateId, String(json.score));
        toast.success("Resultado introduzido", `${row.studentName ?? "Candidato"} — ${getTeacherExamStatusLabel("resultCode", json.resultCode ?? "")}.`);
      } else {
        toast.error("Não foi possível introduzir", json.error ?? "Tente novamente.");
      }
    } catch {
      toast.error("Erro de rede", "Não foi possível contactar o servidor.");
    } finally {
      markPending(row.examCandidateId, false);
    }
  }

  async function updateOne(row: TeacherResultRowDto): Promise<void> {
    if (!row.result || !maxScoreValid || pendingRows.has(row.examCandidateId)) return;
    const scoreStr = edits[row.examCandidateId] ?? "";
    if (!isScoreValid(scoreStr, effectiveMaxScore)) return;
    markPending(row.examCandidateId, true);
    try {
      const res = await fetch(`/api/teacher/examinations/results/${row.result.examResultId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ maxScore: effectiveMaxScore, score: Number(scoreStr) }),
      });
      const json = (await res.json().catch(() => ({}))) as Partial<UpdateResponse>;
      if (res.ok && json.examResultId) {
        setRowResult(row.examCandidateId, {
          examResultId: json.examResultId,
          score: json.score ?? null,
          maxScore: json.maxScore ?? effectiveMaxScore,
          normalizedScore: json.normalizedScore ?? null,
          resultCode: json.resultCode ?? row.result.resultCode,
          status: json.status ?? RESULT_STATUS_DRAFT,
        });
        if (json.score != null) setScore(row.examCandidateId, String(json.score));
        toast.success("Rascunho guardado", `${row.studentName ?? "Candidato"}.`);
      } else {
        toast.error("Não foi possível guardar", json.error ?? "Tente novamente.");
      }
    } catch {
      toast.error("Erro de rede", "Não foi possível contactar o servidor.");
    } finally {
      markPending(row.examCandidateId, false);
    }
  }

  async function submitOne(row: TeacherResultRowDto): Promise<void> {
    if (!row.result || pendingRows.has(row.examCandidateId)) return;
    markPending(row.examCandidateId, true);
    try {
      const res = await fetch(`/api/teacher/examinations/results/${row.result.examResultId}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const json = (await res.json().catch(() => ({}))) as Partial<SubmitResponse>;
      if (res.ok && json.examResultId) {
        // SUBMITTED is the teacher ceiling — the row locks. Derive read-only caps.
        setRowResult(
          row.examCandidateId,
          { ...row.result, status: json.status ?? "SUBMITTED" },
          { canCreateResult: false, canUpdateDraft: false, canSubmitResult: false }
        );
        toast.success("Resultado submetido", `${row.studentName ?? "Candidato"}.`);
      } else {
        toast.error("Não foi possível submeter", json.error ?? "Tente novamente.");
      }
    } catch {
      toast.error("Erro de rede", "Não foi possível contactar o servidor.");
    } finally {
      markPending(row.examCandidateId, false);
    }
  }

  // ── Bulk: "Guardar rascunhos" — NEW rows via bulk-create, EDITED drafts via PATCH ─
  const nameByCandidate = useMemo(
    () => new Map(rows.map((r) => [r.examCandidateId, r.studentName ?? r.studentNumber ?? r.examCandidateId])),
    [rows]
  );
  const nameByResult = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of rows) {
      if (r.result) m.set(r.result.examResultId, r.studentName ?? r.studentNumber ?? r.examCandidateId);
    }
    return m;
  }, [rows]);

  async function saveDrafts(): Promise<void> {
    if (!maxScoreValid) {
      toast.error("Pontuação máxima em falta", "Defina a pontuação máxima da sessão primeiro.");
      return;
    }
    // NEW eligible SCORED rows with a valid typed score → bulk-create.
    const newItems = rows
      .filter((r) => isCreatable(r) && r.expectedResultCode === RESULT_CODE.SCORED && isScoreValid(edits[r.examCandidateId] ?? "", effectiveMaxScore))
      .map((r) => ({
        examCandidateId: r.examCandidateId,
        maxScore: effectiveMaxScore as number,
        score: Number(edits[r.examCandidateId]),
      }));
    // EDITED existing DRAFT SCORED rows with a valid changed score → sequential PATCH.
    const editRows = rows.filter(
      (r) =>
        isDraft(r) &&
        r.capabilities.canUpdateDraft &&
        r.result?.resultCode === RESULT_CODE.SCORED &&
        isDirty(r) &&
        isScoreValid(edits[r.examCandidateId] ?? "", effectiveMaxScore)
    );

    if (newItems.length === 0 && editRows.length === 0) {
      toast.error("Nada para guardar", "Introduza pontuações antes de guardar.");
      return;
    }

    setBulkPending(true);
    const items: UnifiedItem[] = [];
    let succeeded = 0;
    let skipped = 0;
    let failed = 0;

    try {
      if (newItems.length > 0) {
        const res = await fetch(`/api/teacher/examinations/sessions/${sessionId}/results/bulk`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ items: newItems }),
        });
        const json = (await res.json().catch(() => ({}))) as Partial<BulkCreateResponse>;
        if (res.ok && json.items) {
          for (const it of json.items) {
            items.push({ ref: it.examCandidateId, ok: it.ok, code: it.code, message: it.message });
            if (it.ok) succeeded += 1;
            else if (it.code === "SKIPPED") skipped += 1;
            else failed += 1;
          }
        } else {
          // Whole-request failure — attribute the error to every new item.
          for (const it of newItems) {
            items.push({ ref: it.examCandidateId, ok: false, message: json.error });
            failed += 1;
          }
        }
      }

      // Sequential PATCH — the engine has no bulk-update.
      for (const r of editRows) {
        try {
          const res = await fetch(`/api/teacher/examinations/results/${r.result?.examResultId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ maxScore: effectiveMaxScore, score: Number(edits[r.examCandidateId]) }),
          });
          const json = (await res.json().catch(() => ({}))) as Partial<UpdateResponse>;
          if (res.ok && json.examResultId) {
            items.push({ ref: r.examCandidateId, ok: true });
            succeeded += 1;
          } else {
            items.push({ ref: r.examCandidateId, ok: false, message: json.error });
            failed += 1;
          }
        } catch {
          items.push({ ref: r.examCandidateId, ok: false, message: "Erro de rede" });
          failed += 1;
        }
      }

      setSummary({ title: "Rascunhos guardados", succeeded, skipped, failed, items });
      await reloadRoster();
    } finally {
      setBulkPending(false);
    }
  }

  // ── Bulk: submit ───────────────────────────────────────────────────────────────
  async function runBulkSubmit(resultIds: string[]): Promise<void> {
    setConfirm(null);
    if (resultIds.length === 0) return;
    setBulkPending(true);
    try {
      const res = await fetch(`/api/teacher/examinations/sessions/${sessionId}/results/submit-bulk`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: resultIds.map((id) => ({ examResultId: id })) }),
      });
      const json = (await res.json().catch(() => ({}))) as Partial<BulkSubmitResponse>;
      if (res.ok && json.items) {
        const items: UnifiedItem[] = json.items.map((it) => ({
          ref: it.examResultId,
          ok: it.ok,
          code: it.code,
          message: it.message,
        }));
        setSummary({
          title: "Resultados submetidos",
          succeeded: json.succeeded ?? 0,
          skipped: json.skipped ?? 0,
          failed: json.failed ?? 0,
          items,
        });
        await reloadRoster();
      } else {
        toast.error("Submissão em massa falhou", json.error ?? "Tente novamente.");
      }
    } catch {
      toast.error("Erro de rede", "Não foi possível contactar o servidor.");
    } finally {
      setBulkPending(false);
    }
  }

  // ── Derived view ───────────────────────────────────────────────────────────────
  const counters = useMemo(() => computeCounters(rows), [rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (q) {
        const name = (r.studentName ?? "").toLowerCase();
        const num = (r.studentNumber ?? "").toLowerCase();
        if (!name.includes(q) && !num.includes(q)) return false;
      }
      if (statusFilter === ALL_FILTER) return true;
      if (statusFilter === NO_RESULT_FILTER) return !r.result;
      return r.result?.status === statusFilter;
    });
  }, [rows, search, statusFilter]);

  // Rows selectable for bulk submit = DRAFT results the teacher may submit.
  const submittableRows = useMemo(
    () => rows.filter((r) => isDraft(r) && r.capabilities.canSubmitResult && r.result),
    [rows]
  );
  const filteredSubmittable = filtered.filter((r) => isDraft(r) && r.capabilities.canSubmitResult && r.result);
  const allFilteredSelected =
    filteredSubmittable.length > 0 && filteredSubmittable.every((r) => selected.has(r.result!.examResultId));

  const canBulkEnter = capabilities?.canBulkEnterResults ?? false;
  const canBulkSubmit = capabilities?.canBulkSubmitResults ?? false;

  const dirtyCount = useMemo(() => rows.filter((r) => isDirty(r)).length, [rows, isDirty]);

  function toggleSelect(resultId: string, on: boolean): void {
    setSelected((prev) => {
      const nextSet = new Set(prev);
      if (on) nextSet.add(resultId);
      else nextSet.delete(resultId);
      return nextSet;
    });
  }
  function toggleSelectAll(on: boolean): void {
    setSelected((prev) => {
      const nextSet = new Set(prev);
      for (const r of filteredSubmittable) {
        if (on) nextSet.add(r.result!.examResultId);
        else nextSet.delete(r.result!.examResultId);
      }
      return nextSet;
    });
  }

  // ── Render ───────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (loadError) {
    return (
      <Card>
        <CardContent className="p-6 text-center">
          <p className="text-sm text-destructive">{loadError}</p>
          <Button
            variant="outline"
            size="sm"
            className="mt-3"
            onClick={() =>
              void reloadRoster().then((ok) => {
                if (ok) setLoadError(null);
              })
            }
          >
            Tentar novamente
          </Button>
        </CardContent>
      </Card>
    );
  }

  const filterOptions = [
    { value: ALL_FILTER, label: "Todos" },
    { value: NO_RESULT_FILTER, label: "Sem resultado" },
    ...getTeacherExamStatusOptions("result"),
  ];

  const selCount = selected.size;

  return (
    <div className="space-y-4">
      {/* Session max score + counters */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1">
          <Label htmlFor="session-max-score">Pontuação máxima</Label>
          <Input
            id="session-max-score"
            type="number"
            min={1}
            className="w-40"
            value={maxScoreLocked ? String(persistedMax) : maxScoreStr}
            onChange={(e) => setMaxScoreStr(e.target.value)}
            readOnly={maxScoreLocked}
            aria-label="Pontuação máxima da sessão"
            placeholder="Ex.: 20"
          />
          <p className="text-xs text-muted-foreground">
            {maxScoreLocked
              ? "Pontuação máxima da sessão (fixada pelos resultados existentes)."
              : "Obrigatória antes de introduzir ou guardar resultados."}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <CounterCard label="Total" value={counters.total} />
        <CounterCard label="Sem resultado" value={counters.noResult} />
        <CounterCard label="Rascunho" value={counters.draft} />
        <CounterCard label="Submetido" value={counters.submitted} />
      </div>

      {/* Search + filter */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-56 flex-1">
          <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Procurar por nome ou nº"
            aria-label="Procurar candidato por nome ou número"
            className="pl-8"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {filterOptions.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Bulk toolbar */}
      {(canBulkEnter || canBulkSubmit) && (
        <div className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/30 px-3 py-2">
          <span className="text-sm text-muted-foreground">
            {selCount > 0 ? `${selCount} selecionado(s)` : "Ações em massa"}
          </span>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            {canBulkEnter && (
              <Button
                size="sm"
                variant="outline"
                disabled={bulkPending || dirtyCount === 0 || !maxScoreValid}
                onClick={() => void saveDrafts()}
              >
                {bulkPending ? "A guardar…" : `Guardar rascunhos${dirtyCount > 0 ? ` (${dirtyCount})` : ""}`}
              </Button>
            )}
            {canBulkSubmit && (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={bulkPending || selCount === 0}
                  onClick={() => setConfirm({ kind: "submit-bulk", resultIds: [...selected], scope: "selected" })}
                >
                  Submeter selecionados{selCount > 0 ? ` (${selCount})` : ""}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={bulkPending || submittableRows.length === 0}
                  onClick={() =>
                    setConfirm({
                      kind: "submit-bulk",
                      resultIds: submittableRows.map((r) => r.result!.examResultId),
                      scope: "all",
                    })
                  }
                >
                  Submeter todos os elegíveis{submittableRows.length > 0 ? ` (${submittableRows.length})` : ""}
                </Button>
                {selCount > 0 && (
                  <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
                    Limpar seleção
                  </Button>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {capabilities?.resultsBlockReason && (
        <p className="rounded-md border border-dashed px-3 py-2 text-xs text-muted-foreground">
          {capabilities.resultsBlockReason}
        </p>
      )}

      {/* Results grid */}
      {rows.length === 0 ? (
        <ExaminationEmptyState title="Sem candidatos." description="Ainda não há candidatos nesta sessão." />
      ) : filtered.length === 0 ? (
        <ExaminationEmptyState title="Nenhum resultado encontrado." description="Ajuste a procura ou o filtro." />
      ) : (
        <div className="max-h-128 overflow-auto rounded-md border">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 bg-muted">
              <tr className="border-b text-left text-xs text-muted-foreground">
                {canBulkSubmit && (
                  <th className="w-10 px-3 py-2">
                    <Checkbox
                      checked={allFilteredSelected}
                      onCheckedChange={(v) => toggleSelectAll(v === true)}
                      aria-label="Selecionar submetíveis"
                    />
                  </th>
                )}
                <th className="px-3 py-2 font-medium">Aluno</th>
                <th className="px-3 py-2 font-medium">Nº</th>
                <th className="px-3 py-2 font-medium">Presença</th>
                <th className="px-3 py-2 font-medium">Pontuação</th>
                <th className="px-3 py-2 font-medium">Máximo</th>
                <th className="px-3 py-2 font-medium">Percentagem</th>
                <th className="px-3 py-2 font-medium">Código</th>
                <th className="px-3 py-2 font-medium">Estado</th>
                <th className="px-3 py-2 text-right font-medium">Ação</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const rowPending = pendingRows.has(r.examCandidateId);
                const scoreEditable = isScoreEditable(r);
                const scoreStr = edits[r.examCandidateId] ?? "";
                const scoreOk = isScoreValid(scoreStr, effectiveMaxScore);
                const resultCode = r.result?.resultCode ?? r.expectedResultCode;
                const selectable = isDraft(r) && r.capabilities.canSubmitResult && r.result != null;

                return (
                  <tr key={r.examCandidateId} className={cn("border-b last:border-0 align-top", rowPending && "opacity-60")}>
                    {canBulkSubmit && (
                      <td className="px-3 py-2">
                        {selectable ? (
                          <Checkbox
                            checked={selected.has(r.result!.examResultId)}
                            onCheckedChange={(v) => toggleSelect(r.result!.examResultId, v === true)}
                            aria-label={`Selecionar ${r.studentName ?? r.examCandidateId}`}
                          />
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                    )}
                    <td className="px-3 py-2 font-medium">{r.studentName ?? "—"}</td>
                    <td className="px-3 py-2 tabular-nums text-muted-foreground">{r.studentNumber ?? "—"}</td>
                    <td className="px-3 py-2">
                      {r.attendanceStatus ? <AttendanceStatusBadge status={r.attendanceStatus} /> : <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="px-3 py-2">
                      {scoreEditable ? (
                        <Input
                          type="number"
                          min={0}
                          max={effectiveMaxScore ?? undefined}
                          className="h-8 w-20"
                          value={scoreStr}
                          disabled={rowPending}
                          onChange={(e) => setScore(r.examCandidateId, e.target.value)}
                          aria-label="Pontuação"
                        />
                      ) : r.result?.resultCode === RESULT_CODE.SCORED && r.result.score != null ? (
                        <span className="tabular-nums">{r.result.score}</span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2 tabular-nums">{r.result?.maxScore ?? (maxScoreValid ? effectiveMaxScore : "—")}</td>
                    <td className="px-3 py-2 tabular-nums">
                      {r.result?.normalizedScore != null ? `${r.result.normalizedScore}%` : "—"}
                    </td>
                    <td className="px-3 py-2">
                      {r.result ? (
                        <TeacherExamStatusBadge kind="resultCode" status={r.result.resultCode} />
                      ) : resultCode ? (
                        <span className="text-xs text-muted-foreground">{getTeacherExamStatusLabel("resultCode", resultCode)}</span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {r.result ? <ResultStatusBadge status={r.result.status} /> : <span className="text-muted-foreground">Sem resultado</span>}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center justify-end gap-1.5">
                        <RowActions
                          row={r}
                          rowPending={rowPending}
                          maxScoreValid={maxScoreValid}
                          scoreOk={scoreOk}
                          isDirty={isDirty(r)}
                          onCreateScored={() => void createOne(r, { score: Number(scoreStr) })}
                          onCreateCodeOnly={() => void createOne(r, {})}
                          onCreateDisqualified={() => setDisqualifyRow(r)}
                          onSave={() => void updateOne(r)}
                          onSubmit={() => setConfirm({ kind: "submit-one", row: r })}
                        />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        A mostrar {filtered.length} de {rows.length} candidato(s).
      </p>

      {/* Disqualified reason dialog (create requires a reason) */}
      {disqualifyRow && (
        <DisqualifyReasonDialog
          row={disqualifyRow}
          onClose={() => setDisqualifyRow(null)}
          onSubmit={(reason) => {
            const row = disqualifyRow;
            setDisqualifyRow(null);
            void createOne(row, { reason });
          }}
        />
      )}

      {/* Submit confirmation (single or bulk) */}
      <ConfirmDialog
        open={confirm !== null}
        onOpenChange={(o) => {
          if (!o) setConfirm(null);
        }}
        title="Submeter resultados?"
        description={
          confirm?.kind === "submit-one"
            ? "A submissão é o limite do docente: depois de submetido, o resultado deixa de poder ser editado. Continuar?"
            : `Vão ser submetidos ${confirm?.kind === "submit-bulk" ? confirm.resultIds.length : 0} resultado(s) em rascunho. A submissão é irreversível para o docente — depois disso os resultados não podem ser editados. Continuar?`
        }
        confirmLabel="Submeter"
        onConfirm={() => {
          if (!confirm) return;
          if (confirm.kind === "submit-one") {
            const row = confirm.row;
            setConfirm(null);
            void submitOne(row);
          } else {
            void runBulkSubmit(confirm.resultIds);
          }
        }}
      />

      {/* Bulk summary */}
      <BulkSummary
        summary={summary}
        onClose={() => setSummary(null)}
        nameOf={(ref) => nameByCandidate.get(ref) ?? nameByResult.get(ref) ?? ref}
      />
    </div>
  );
}

// ── Per-row action cluster ─────────────────────────────────────────────────────
function RowActions({
  row,
  rowPending,
  maxScoreValid,
  scoreOk,
  isDirty,
  onCreateScored,
  onCreateCodeOnly,
  onCreateDisqualified,
  onSave,
  onSubmit,
}: {
  row: TeacherResultRowDto;
  rowPending: boolean;
  maxScoreValid: boolean;
  scoreOk: boolean;
  isDirty: boolean;
  onCreateScored: () => void;
  onCreateCodeOnly: () => void;
  onCreateDisqualified: () => void;
  onSave: () => void;
  onSubmit: () => void;
}) {
  const caps = row.capabilities;
  const hasResult = row.result != null;

  // No result yet — creation path (gated by capability + attendance-derived code).
  if (!hasResult) {
    if (!caps.canCreateResult) {
      return <span className="text-xs text-muted-foreground">{caps.createBlockReason ?? "Sem ações disponíveis"}</span>;
    }
    if (row.expectedResultCode === "SCORED") {
      return (
        <Button size="sm" className="h-8" disabled={rowPending || !maxScoreValid || !scoreOk} onClick={onCreateScored}>
          Introduzir resultado
        </Button>
      );
    }
    if (row.expectedResultCode === "DISQUALIFIED") {
      return (
        <Button size="sm" variant="outline" className="h-8" disabled={rowPending || !maxScoreValid} onClick={onCreateDisqualified}>
          Introduzir resultado
        </Button>
      );
    }
    // ABSENT / EXCUSED — one-click, code only.
    return (
      <Button size="sm" variant="outline" className="h-8" disabled={rowPending || !maxScoreValid} onClick={onCreateCodeOnly}>
        Introduzir resultado
      </Button>
    );
  }

  // DRAFT — save (SCORED only) and/or submit.
  const isDraftRow = row.result?.status === "DRAFT";
  if (isDraftRow) {
    const canSaveScore = caps.canUpdateDraft && row.result?.resultCode === "SCORED";
    const actions: ReactNode[] = [];
    if (canSaveScore) {
      actions.push(
        <Button key="save" size="sm" variant="outline" className="h-8" disabled={rowPending || !isDirty || !scoreOk || !maxScoreValid} onClick={onSave}>
          Guardar
        </Button>
      );
    }
    if (caps.canSubmitResult) {
      actions.push(
        <Button key="submit" size="sm" className="h-8" disabled={rowPending} onClick={onSubmit}>
          Submeter
        </Button>
      );
    }
    if (actions.length === 0) {
      return (
        <span className="text-xs text-muted-foreground">
          {caps.updateBlockReason ?? caps.submitBlockReason ?? "Sem ações disponíveis"}
        </span>
      );
    }
    return <>{actions}</>;
  }

  // SUBMITTED or later — read-only (teacher ceiling reached).
  return <span className="text-xs text-muted-foreground">—</span>;
}

// ── Disqualified reason dialog ──────────────────────────────────────────────────
function DisqualifyReasonDialog({
  row,
  onClose,
  onSubmit,
}: {
  row: TeacherResultRowDto;
  onClose: () => void;
  onSubmit: (reason: string) => void;
}) {
  const [reason, setReason] = useState("");
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Introduzir resultado — {row.studentName ?? row.studentNumber ?? "candidato"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Este candidato está desqualificado. É obrigatório indicar o motivo para registar o resultado.
          </p>
          <div className="space-y-1">
            <Label htmlFor="dq-reason">Motivo</Label>
            <Textarea id="dq-reason" value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button disabled={!reason.trim()} onClick={() => onSubmit(reason.trim())}>
            Registar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Bulk summary dialog (teacher unified shape) ─────────────────────────────────
function BulkSummary({
  summary,
  onClose,
  nameOf,
}: {
  summary: UnifiedSummary | null;
  onClose: () => void;
  nameOf: (ref: string) => string;
}) {
  const [showDetails, setShowDetails] = useState(false);
  const problems = summary ? summary.items.filter((i) => !i.ok) : [];

  return (
    <Dialog
      open={summary !== null}
      onOpenChange={(o) => {
        if (!o) {
          setShowDetails(false);
          onClose();
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{summary?.title ?? "Resumo"}</DialogTitle>
        </DialogHeader>
        {summary && (
          <div className="space-y-3 text-sm">
            <p className="text-base">
              <strong className="tabular-nums">{summary.succeeded}</strong> submetidos ·{" "}
              <strong className="tabular-nums">{summary.skipped}</strong> ignorados ·{" "}
              <strong className={cn("tabular-nums", summary.failed > 0 && "text-destructive")}>{summary.failed}</strong>{" "}
              falharam
            </p>
            {problems.length > 0 && (
              <button
                type="button"
                className="text-xs text-accent underline-offset-2 hover:underline"
                onClick={() => setShowDetails((v) => !v)}
              >
                {showDetails ? "Ocultar por candidato" : "Ver por candidato"}
              </button>
            )}
            {showDetails && (
              <div className="max-h-56 overflow-y-auto rounded-md border p-2 text-xs">
                {problems.map((p) => (
                  <div key={p.ref} className="flex justify-between gap-3 border-b py-1 last:border-0">
                    <span className="truncate">{nameOf(p.ref)}</span>
                    <span className="shrink-0 text-muted-foreground">{bulkCodeLabel(p.code, p.message)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
        <DialogFooter>
          <Button
            onClick={() => {
              setShowDetails(false);
              onClose();
            }}
          >
            Fechar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
