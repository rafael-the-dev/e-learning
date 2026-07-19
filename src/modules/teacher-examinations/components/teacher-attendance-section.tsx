"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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
import { ExaminationEmptyState } from "@/modules/examinations/components/examination-states";
import { bulkCodeLabel } from "@/modules/examinations/components/bulk-summary-dialog";
import type {
  TeacherExamAttendanceViewDto,
  TeacherExamCapabilitiesDto,
  TeacherExamCandidateRowDto,
} from "@/modules/teacher-examinations/types";
import {
  AttendanceStatusBadge,
  getTeacherExamStatusLabel,
  getTeacherExamStatusOptions,
} from "./teacher-exam-status-labels";

// =============================================================================
// TeacherAttendanceSection (Sprint 2 — ATTENDANCE WRITES)
// -----------------------------------------------------------------------------
// Teacher-facing interactive attendance for a single session, mirroring the admin
// `examinations/components/attendance-tab.tsx` interaction model but calling the
// TEACHER endpoints (teacherId is server-resolved — never sent) and the teacher
// DTOs. Attendance ONLY: no results / submission / publication (Sprint 3).
//
// Concurrency (strict): per-row buttons disable while a request is in flight; the
// row is updated from the SERVER-RETURNED state on success (never an irreversible
// optimistic write). On error we keep the confirmed server data and toast the
// server `error`. Bulk refetches the whole roster to revalidate.
// =============================================================================

// Engine-supported attendance vocabulary (English domain values; PT-PT is render-only).
const ATTENDANCE_STATUS = {
  PRESENT: "PRESENT",
  ABSENT: "ABSENT",
  LATE: "LATE",
  EXCUSED: "EXCUSED",
  DISQUALIFIED: "DISQUALIFIED",
} as const;

// One-click marks (no reason required).
const QUICK: Array<{ value: string; short: string }> = [
  { value: ATTENDANCE_STATUS.PRESENT, short: "P" },
  { value: ATTENDANCE_STATUS.ABSENT, short: "A" },
  { value: ATTENDANCE_STATUS.LATE, short: "L" },
];
// Statuses that require a reason/justification when first marked.
const REASON_STATUSES = [ATTENDANCE_STATUS.EXCUSED, ATTENDANCE_STATUS.DISQUALIFIED];
const ALL_STATUSES = Object.values(ATTENDANCE_STATUS);

const PENDING_FILTER = "PENDING";
const ALL_FILTER = "ALL";

type Row = TeacherExamCandidateRowDto & { pending?: boolean };

// ── Server response shapes (from the backend contract) ───────────────────────
interface MarkResponse {
  attendanceId: string;
  examCandidateId: string;
  examSessionId: string;
  status: string;
  checkedInAt: string | null;
  markedAt: string;
}
interface CorrectResponse {
  attendanceId: string;
  examCandidateId: string;
  previousStatus: string | null;
  status: string;
  markedAt: string;
}
interface BulkItemResult {
  examCandidateId: string;
  ok: boolean;
  code?: string;
  message?: string;
}
interface BulkResponse {
  total: number;
  succeeded: number;
  failed: number;
  skipped: number;
  items: BulkItemResult[];
}
interface BulkItemInput {
  examCandidateId: string;
  status: string;
}

// ── Counters derived from the loaded roster ──────────────────────────────────
function computeCounters(rows: Row[]) {
  let present = 0;
  let absent = 0;
  let excused = 0;
  let pending = 0;
  for (const r of rows) {
    if (r.attendanceStatus === ATTENDANCE_STATUS.PRESENT) present += 1;
    else if (r.attendanceStatus === ATTENDANCE_STATUS.ABSENT) absent += 1;
    else if (r.attendanceStatus === ATTENDANCE_STATUS.EXCUSED) excused += 1;
    if (!r.attendanceStatus) pending += 1;
  }
  return { total: rows.length, present, absent, excused, pending };
}

function CounterCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border bg-card px-3 py-2">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-lg font-semibold tabular-nums">{value}</p>
    </div>
  );
}

export function TeacherAttendanceSection({ sessionId }: { sessionId: string }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [capabilities, setCapabilities] = useState<TeacherExamCapabilitiesDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>(ALL_FILTER);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const [dialog, setDialog] = useState<{ row: Row; mode: "mark" | "correct" } | null>(null);
  const [bulkConfirm, setBulkConfirm] = useState<{ items: BulkItemInput[]; message: string } | null>(null);
  const [bulkPending, setBulkPending] = useState(false);
  const [bulkResult, setBulkResult] = useState<BulkResponse | null>(null);

  const rosterUrl = `/api/teacher/examinations/sessions/${sessionId}/candidates`;

  const patch = useCallback((id: string, next: Partial<Row>): void => {
    setRows((prev) => prev.map((r) => (r.examCandidateId === id ? { ...r, ...next } : r)));
  }, []);

  const fetchRoster = useCallback(async (): Promise<TeacherExamAttendanceViewDto | null> => {
    try {
      const res = await fetch(rosterUrl);
      if (!res.ok) return null;
      return (await res.json()) as TeacherExamAttendanceViewDto;
    } catch {
      return null;
    }
  }, [rosterUrl]);

  // Initial load. setState happens inside the async callback (never synchronously
  // in the effect body) — the roster is an external system we synchronize from.
  useEffect(() => {
    let alive = true;
    void (async () => {
      const dto = await fetchRoster();
      if (!alive) return;
      if (dto) {
        setRows(dto.candidates.map((c) => ({ ...c })));
        setCapabilities(dto.capabilities);
        setLoadError(null);
      } else {
        setLoadError("Não foi possível carregar a lista de candidatos.");
      }
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [fetchRoster]);

  async function reloadRoster(): Promise<boolean> {
    const dto = await fetchRoster();
    if (dto) {
      setRows(dto.candidates.map((c) => ({ ...c })));
      setCapabilities(dto.capabilities);
      return true;
    }
    return false;
  }

  // ── Single mark (POST) — no optimistic write; row updated from the response ──
  async function markOne(row: Row, status: string, remarks?: string, reason?: string): Promise<void> {
    if (row.pending) return;
    patch(row.examCandidateId, { pending: true });
    try {
      const res = await fetch(`/api/teacher/examinations/candidates/${row.examCandidateId}/attendance`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, remarks, reason }),
      });
      const json = (await res.json().catch(() => ({}))) as Partial<MarkResponse> & { error?: string };
      if (res.ok && json.status) {
        patch(row.examCandidateId, { attendanceStatus: json.status, pending: false });
        toast.success("Assiduidade registada", `${row.studentName ?? "Candidato"} — ${getTeacherExamStatusLabel("attendance", json.status)}.`);
      } else {
        patch(row.examCandidateId, { pending: false });
        toast.error("Não foi possível registar", json.error ?? "Tente novamente.");
      }
    } catch {
      patch(row.examCandidateId, { pending: false });
      toast.error("Erro de rede", "Não foi possível contactar o servidor.");
    }
  }

  // ── Correct an existing attendance (PATCH) — reason mandatory ─────────────────
  async function correctOne(row: Row, status: string, remarks: string | undefined, reason: string): Promise<void> {
    if (row.pending) return;
    patch(row.examCandidateId, { pending: true });
    try {
      const res = await fetch(`/api/teacher/examinations/candidates/${row.examCandidateId}/attendance`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, reason, remarks }),
      });
      const json = (await res.json().catch(() => ({}))) as Partial<CorrectResponse> & { error?: string };
      if (res.ok && json.status) {
        patch(row.examCandidateId, { attendanceStatus: json.status, pending: false });
        toast.success("Assiduidade corrigida", `${row.studentName ?? "Candidato"} — ${getTeacherExamStatusLabel("attendance", json.status)}.`);
      } else {
        patch(row.examCandidateId, { pending: false });
        toast.error("Não foi possível corrigir", json.error ?? "Tente novamente.");
      }
    } catch {
      patch(row.examCandidateId, { pending: false });
      toast.error("Erro de rede", "Não foi possível contactar o servidor.");
    }
  }

  // ── Bulk mark present (POST) — then refetch the whole roster ─────────────────
  async function runBulk(items: BulkItemInput[]): Promise<void> {
    setBulkConfirm(null);
    if (items.length === 0) return;
    setBulkPending(true);
    try {
      const res = await fetch(`/api/teacher/examinations/sessions/${sessionId}/attendance/bulk`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items }),
      });
      const json = (await res.json().catch(() => ({}))) as Partial<BulkResponse> & { error?: string };
      if (res.ok && json.items) {
        setBulkResult(json as BulkResponse);
        setSelected(new Set());
        await reloadRoster();
      } else {
        toast.error("Marcação em massa falhou", json.error ?? "Tente novamente.");
      }
    } catch {
      toast.error("Erro de rede", "Não foi possível contactar o servidor.");
    } finally {
      setBulkPending(false);
    }
  }

  // ── Derived view ─────────────────────────────────────────────────────────────
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
      if (statusFilter === PENDING_FILTER) return !r.attendanceStatus;
      return r.attendanceStatus === statusFilter;
    });
  }, [rows, search, statusFilter]);

  const nameByCandidate = useMemo(
    () => new Map(rows.map((r) => [r.examCandidateId, r.studentName ?? r.studentNumber ?? r.examCandidateId])),
    [rows]
  );

  const canBulk = capabilities?.canBulkMarkAttendance ?? false;
  const pendingCount = counters.pending;

  // Selected candidates present within the current filter.
  const selectableIds = filtered.map((r) => r.examCandidateId);
  const allFilteredSelected = selectableIds.length > 0 && selectableIds.every((id) => selected.has(id));

  function toggleSelect(id: string, on: boolean): void {
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  }
  function toggleSelectAll(on: boolean): void {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const id of selectableIds) {
        if (on) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  }

  function bulkMarkSelectedPresent(): void {
    const items: BulkItemInput[] = rows
      .filter((r) => selected.has(r.examCandidateId))
      .map((r) => ({ examCandidateId: r.examCandidateId, status: ATTENDANCE_STATUS.PRESENT }));
    if (items.length === 0) {
      toast.error("Nada selecionado", "Selecione candidatos primeiro.");
      return;
    }
    setBulkConfirm({
      items,
      message: `${items.length} candidato(s) selecionado(s) serão marcados como Presente. Quem já tem assiduidade é ignorado. Continuar?`,
    });
  }

  function bulkMarkAllPendingPresent(): void {
    // Build items ONLY for candidates without a recorded attendance — never overwrites.
    const items: BulkItemInput[] = rows
      .filter((r) => !r.attendanceStatus)
      .map((r) => ({ examCandidateId: r.examCandidateId, status: ATTENDANCE_STATUS.PRESENT }));
    if (items.length === 0) return;
    setBulkConfirm({
      items,
      message: `${items.length} candidato(s) por marcar serão registados como Presente. Continuar?`,
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
    ...getTeacherExamStatusOptions("attendance"),
    { value: PENDING_FILTER, label: "Pendente" },
  ];

  return (
    <div className="space-y-4">
      {/* Counters */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <CounterCard label="Total" value={counters.total} />
        <CounterCard label="Presentes" value={counters.present} />
        <CounterCard label="Ausentes" value={counters.absent} />
        <CounterCard label="Justificados" value={counters.excused} />
        <CounterCard label="Pendentes" value={counters.pending} />
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
      {canBulk && (
        <div className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/30 px-3 py-2">
          <span className="text-sm text-muted-foreground">
            {selected.size > 0 ? `${selected.size} selecionado(s)` : "Ações em massa"}
          </span>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <Button size="sm" variant="outline" disabled={selected.size === 0 || bulkPending} onClick={bulkMarkSelectedPresent}>
              Marcar selecionados como presentes
            </Button>
            <Button size="sm" variant="outline" disabled={pendingCount === 0 || bulkPending} onClick={bulkMarkAllPendingPresent}>
              {bulkPending ? "A marcar…" : "Marcar todos os pendentes como presentes"}
            </Button>
            <Button size="sm" variant="ghost" disabled={selected.size === 0} onClick={() => setSelected(new Set())}>
              Limpar seleção
            </Button>
          </div>
        </div>
      )}

      {/* Roster table */}
      {rows.length === 0 ? (
        <ExaminationEmptyState title="Sem candidatos." description="Ainda não há candidatos inscritos nesta sessão." />
      ) : filtered.length === 0 ? (
        <ExaminationEmptyState title="Nenhum resultado encontrado." description="Ajuste a procura ou o filtro." />
      ) : (
        <div className="max-h-128 overflow-auto rounded-md border">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 bg-muted">
              <tr className="border-b text-left text-xs text-muted-foreground">
                {canBulk && (
                  <th className="w-10 px-3 py-2">
                    <Checkbox
                      checked={allFilteredSelected}
                      onCheckedChange={(v) => toggleSelectAll(v === true)}
                      aria-label="Selecionar todos"
                    />
                  </th>
                )}
                <th className="px-3 py-2 font-medium">Nº</th>
                <th className="px-3 py-2 font-medium">Nome</th>
                <th className="px-3 py-2 font-medium">Estado atual</th>
                <th className="px-3 py-2 text-right font-medium">Ações</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const hasAttendance = r.attendanceStatus != null;
                const canMark = capabilities?.canMarkAttendance ?? false;
                const canCorrect = capabilities?.canCorrectAttendance ?? false;
                const showQuick = !hasAttendance && canMark;
                const showCorrect = hasAttendance && canCorrect;
                const noActions = !showQuick && !showCorrect;
                return (
                  <tr key={r.examCandidateId} className={cn("border-b last:border-0", r.pending && "opacity-60")}>
                    {canBulk && (
                      <td className="px-3 py-2 align-top">
                        <Checkbox
                          checked={selected.has(r.examCandidateId)}
                          onCheckedChange={(v) => toggleSelect(r.examCandidateId, v === true)}
                          aria-label={`Selecionar ${r.studentName ?? r.examCandidateId}`}
                        />
                      </td>
                    )}
                    <td className="px-3 py-2 align-top tabular-nums text-muted-foreground">{r.studentNumber ?? "—"}</td>
                    <td className="px-3 py-2 align-top font-medium">{r.studentName ?? "—"}</td>
                    <td className="px-3 py-2 align-top">
                      {r.attendanceStatus ? (
                        <AttendanceStatusBadge status={r.attendanceStatus} />
                      ) : (
                        <span className="text-muted-foreground">Pendente</span>
                      )}
                    </td>
                    <td className="px-3 py-2 align-top">
                      <div className="flex items-center justify-end gap-1.5">
                        {showQuick && (
                          <>
                            {QUICK.map((q) => (
                              <Button
                                key={q.value}
                                size="sm"
                                variant="outline"
                                className="h-8 w-9 px-0 tabular-nums"
                                disabled={r.pending}
                                title={getTeacherExamStatusLabel("attendance", q.value)}
                                onClick={() => void markOne(r, q.value)}
                              >
                                {q.short}
                              </Button>
                            ))}
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-8"
                              disabled={r.pending}
                              onClick={() => setDialog({ row: r, mode: "mark" })}
                            >
                              Mais…
                            </Button>
                          </>
                        )}
                        {showCorrect && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8"
                            disabled={r.pending}
                            onClick={() => setDialog({ row: r, mode: "correct" })}
                          >
                            Corrigir
                          </Button>
                        )}
                        {noActions && (
                          <span className="text-xs text-muted-foreground">
                            {capabilities?.attendanceBlockReason ?? "Sem ações disponíveis"}
                          </span>
                        )}
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

      {/* Reason dialog (EXCUSED/DISQUALIFIED marking, or any correction) */}
      {dialog && (
        <ReasonDialog
          key={dialog.row.examCandidateId + dialog.mode}
          row={dialog.row}
          mode={dialog.mode}
          onClose={() => setDialog(null)}
          onSubmit={(status, remarks, reason) => {
            const current = dialog;
            setDialog(null);
            if (current.mode === "mark") void markOne(current.row, status, remarks, reason);
            else void correctOne(current.row, status, remarks, reason ?? "");
          }}
        />
      )}

      {/* Bulk confirmation */}
      <Dialog open={bulkConfirm !== null} onOpenChange={(o) => !o && setBulkConfirm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Marcar presença</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">{bulkConfirm?.message}</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkConfirm(null)}>
              Cancelar
            </Button>
            <Button onClick={() => bulkConfirm && void runBulk(bulkConfirm.items)}>Marcar presentes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk result summary */}
      <BulkResultDialog
        result={bulkResult}
        onClose={() => setBulkResult(null)}
        nameOf={(id) => nameByCandidate.get(id) ?? id}
      />
    </div>
  );
}

// ── Reason dialog ─────────────────────────────────────────────────────────────
function ReasonDialog({
  row,
  mode,
  onClose,
  onSubmit,
}: {
  row: TeacherExamCandidateRowDto;
  mode: "mark" | "correct";
  onClose: () => void;
  onSubmit: (status: string, remarks: string | undefined, reason: string | undefined) => void;
}) {
  const statuses = mode === "mark" ? REASON_STATUSES : ALL_STATUSES;
  const [status, setStatus] = useState<string>(
    mode === "mark" ? ATTENDANCE_STATUS.EXCUSED : row.attendanceStatus ?? ATTENDANCE_STATUS.PRESENT
  );
  const [remarks, setRemarks] = useState("");
  const [reason, setReason] = useState("");

  // Correction ALWAYS needs a reason. DISQUALIFIED needs a reason. EXCUSED needs
  // a reason OR remarks (a justification).
  const reasonRequired = mode === "correct" || status === ATTENDANCE_STATUS.DISQUALIFIED;
  const excusedNeedsJustification = status === ATTENDANCE_STATUS.EXCUSED && !remarks.trim() && !reason.trim();
  const blocked = (reasonRequired && !reason.trim()) || excusedNeedsJustification;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {mode === "mark" ? "Marcar assiduidade" : "Corrigir assiduidade"} — {row.studentName ?? row.studentNumber ?? "candidato"}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>Estado</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {statuses.map((s) => (
                  <SelectItem key={s} value={s}>
                    {getTeacherExamStatusLabel("attendance", s)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="att-remarks">
              Observações{status === ATTENDANCE_STATUS.EXCUSED ? "" : " (opcional)"}
            </Label>
            <Textarea id="att-remarks" value={remarks} onChange={(e) => setRemarks(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="att-reason">Motivo{reasonRequired ? "" : " (opcional)"}</Label>
            <Textarea id="att-reason" value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button disabled={blocked} onClick={() => onSubmit(status, remarks.trim() || undefined, reason.trim() || undefined)}>
            Guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Bulk result summary dialog (teacher bulk shape) ──────────────────────────
function BulkResultDialog({
  result,
  onClose,
  nameOf,
}: {
  result: BulkResponse | null;
  onClose: () => void;
  nameOf: (id: string) => string;
}) {
  const [showDetails, setShowDetails] = useState(false);
  const problems = result ? result.items.filter((i) => !i.ok) : [];

  return (
    <Dialog
      open={result !== null}
      onOpenChange={(o) => {
        if (!o) {
          setShowDetails(false);
          onClose();
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Presença marcada</DialogTitle>
        </DialogHeader>
        {result && (
          <div className="space-y-3 text-sm">
            <p className="text-base">
              <strong className="tabular-nums">{result.succeeded}</strong> atualizados ·{" "}
              <strong className="tabular-nums">{result.skipped}</strong> ignorados ·{" "}
              <strong className={cn("tabular-nums", result.failed > 0 && "text-destructive")}>{result.failed}</strong>{" "}
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
                  <div key={p.examCandidateId} className="flex justify-between gap-3 border-b py-1 last:border-0">
                    <span className="truncate">{nameOf(p.examCandidateId)}</span>
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
