"use client";

import { useEffect, useState } from "react";
import { Button } from "@/shared/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/components/ui/dialog";
import { Label } from "@/shared/components/ui/label";
import { Textarea } from "@/shared/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import { cn } from "@/shared/lib/utils";
import { ExamAttendanceStatus } from "@/modules/examinations/constants";
import type {
  ExamAttendanceRosterDto,
  ExamAttendanceRosterItemDto,
  ExamAttendanceSummaryDto,
} from "@/modules/examinations/types/portal";
import type { BulkSummary } from "@/modules/examinations/lib/bulk-runner";
import { ExaminationStatusBadge } from "./status-badges";
import { ExaminationKpiCard } from "./examination-cards";
import { ExaminationEmptyState } from "./examination-states";

// =============================================================================
// AttendanceTab (Sprint UX 2.1) — inline optimistic marking that SCALES.
// -----------------------------------------------------------------------------
// • P/A/L one-tap; EXCUSED/DISQUALIFIED + corrections keep the reason dialog.
// • Per-row optimistic state with rollback + inline typed error; no reload.
// • KPIs reflect the WHOLE session (server summary), kept live on each mark.
// • "Marcar todos presentes" hits the server-side mark-all endpoint over EVERY
//   registered candidate (not the loaded page), with an explicit confirmation and
//   a succeeded/skipped/failed summary.
// • Load-more reaches candidates beyond the first page (no 100-row ceiling).
// =============================================================================

const ATTENDANCE_LABELS: Record<string, string> = {
  PRESENT: "Presente",
  ABSENT: "Ausente",
  LATE: "Atrasado",
  EXCUSED: "Justificado",
  DISQUALIFIED: "Desqualificado",
};
const QUICK: Array<{ value: string; short: string }> = [
  { value: ExamAttendanceStatus.PRESENT, short: "P" },
  { value: ExamAttendanceStatus.ABSENT, short: "A" },
  { value: ExamAttendanceStatus.LATE, short: "L" },
];
const REASON_STATUSES = [ExamAttendanceStatus.EXCUSED, ExamAttendanceStatus.DISQUALIFIED];
const BUCKET: Record<string, keyof ExamAttendanceSummaryDto> = {
  PRESENT: "present",
  ABSENT: "absent",
  LATE: "late",
  EXCUSED: "excused",
  DISQUALIFIED: "disqualified",
};

type Row = ExamAttendanceRosterItemDto & { pending?: boolean; error?: string | null };

// Adjust the whole-session summary for one status change (from=null => was unmarked).
function withStatusDelta(s: ExamAttendanceSummaryDto, from: string | null, to: string): ExamAttendanceSummaryDto {
  const n: ExamAttendanceSummaryDto = { ...s };
  if (from === null) {
    n.marked += 1;
    n.unmarked -= 1;
  } else {
    const k = BUCKET[from];
    if (k) n[k] = n[k] - 1;
  }
  const tk = BUCKET[to];
  if (tk) n[tk] = n[tk] + 1;
  n.completionPercentage = n.totalRegistered ? Math.round((n.marked / n.totalRegistered) * 100) : 0;
  return n;
}

export function AttendanceTab({ sessionId, roster }: { sessionId: string; roster: ExamAttendanceRosterDto }) {
  const [rows, setRows] = useState<Row[]>(() => roster.items.map((r) => ({ ...r })));
  const [summary, setSummary] = useState<ExamAttendanceSummaryDto>(roster.summary);
  const [page, setPage] = useState(roster.page);
  const [total, setTotal] = useState(roster.total);
  const [loadingMore, setLoadingMore] = useState(false);
  const [dialog, setDialog] = useState<{ row: Row; mode: "mark" | "correct" } | null>(null);
  const [confirmMarkAll, setConfirmMarkAll] = useState(false);
  const [bulkPending, setBulkPending] = useState(false);
  const [markAllResult, setMarkAllResult] = useState<BulkSummary | null>(null);
  const [showDetails, setShowDetails] = useState(false);

  const bulkUrl = `/api/examinations/sessions/${sessionId}/attendance/bulk`;

  function patch(id: string, next: Partial<Row>): void {
    setRows((prev) => prev.map((r) => (r.examCandidateId === id ? { ...r, ...next } : r)));
  }

  async function fetchRosterPage(p: number): Promise<ExamAttendanceRosterDto | null> {
    try {
      const res = await fetch(`/api/examinations/sessions/${sessionId}/attendance?page=${p}&pageSize=100`);
      if (!res.ok) return null;
      return (await res.json()) as ExamAttendanceRosterDto;
    } catch {
      return null;
    }
  }

  // ── Single mark via the bulk endpoint (one item) ──────────────────────────
  async function markOne(row: Row, status: string, remarks?: string, reason?: string): Promise<void> {
    if (row.pending) return;
    const prevRow = { attendanceStatus: row.attendanceStatus, hasAttendance: row.hasAttendance };
    const prevSummary = summary;
    patch(row.examCandidateId, { attendanceStatus: status, hasAttendance: true, pending: true, error: null });
    setSummary((s) => withStatusDelta(s, null, status));
    try {
      const res = await fetch(bulkUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: [{ examCandidateId: row.examCandidateId, status, remarks, reason }] }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string; items?: Array<{ ok: boolean; message?: string }> };
      const item = json.items?.[0];
      if (res.ok && item?.ok) {
        patch(row.examCandidateId, { pending: false, error: null });
      } else {
        patch(row.examCandidateId, { ...prevRow, pending: false, error: item?.message ?? json.error ?? "Falhou." });
        setSummary(prevSummary);
      }
    } catch {
      patch(row.examCandidateId, { ...prevRow, pending: false, error: "Erro de rede." });
      setSummary(prevSummary);
    }
  }

  // ── Correct an existing attendance (reason mandatory) ──────────────────────
  async function correctOne(row: Row, status: string, remarks: string | undefined, reason: string): Promise<void> {
    if (row.pending) return;
    const prevRow = { attendanceStatus: row.attendanceStatus, hasAttendance: row.hasAttendance };
    const prevSummary = summary;
    patch(row.examCandidateId, { attendanceStatus: status, pending: true, error: null });
    setSummary((s) => withStatusDelta(s, prevRow.attendanceStatus, status));
    try {
      const res = await fetch(`/api/examinations/attendance/${row.examCandidateId}/correct`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, remarks, reason }),
      });
      if (res.ok) {
        patch(row.examCandidateId, { pending: false, error: null });
      } else {
        const p = (await res.json().catch(() => ({}))) as { error?: string };
        patch(row.examCandidateId, { ...prevRow, pending: false, error: p.error ?? "Não foi possível corrigir." });
        setSummary(prevSummary);
      }
    } catch {
      patch(row.examCandidateId, { ...prevRow, pending: false, error: "Erro de rede." });
      setSummary(prevSummary);
    }
  }

  // ── Mark ALL registered present (server-side, whole session) ───────────────
  async function runMarkAll(): Promise<void> {
    setConfirmMarkAll(false);
    setBulkPending(true);
    try {
      const res = await fetch(`/api/examinations/sessions/${sessionId}/attendance/mark-all`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: ExamAttendanceStatus.PRESENT }),
      });
      const json = (await res.json().catch(() => ({}))) as BulkSummary & { error?: string };
      if (!res.ok) {
        setMarkAllResult({ total: 0, processed: 0, succeeded: 0, skipped: 0, failed: 0, durationMs: 0, results: [] });
        return;
      }
      setMarkAllResult(json);
      // Reconcile with the server: reload the first page + true summary.
      const fresh = await fetchRosterPage(1);
      if (fresh) {
        setRows(fresh.items.map((r) => ({ ...r })));
        setSummary(fresh.summary);
        setPage(1);
        setTotal(fresh.total);
      }
    } finally {
      setBulkPending(false);
    }
  }

  async function loadMore(): Promise<void> {
    setLoadingMore(true);
    const dto = await fetchRosterPage(page + 1);
    if (dto) {
      setRows((prev) => {
        const seen = new Set(prev.map((r) => r.examCandidateId));
        return [...prev, ...dto.items.filter((r) => !seen.has(r.examCandidateId)).map((r) => ({ ...r }))];
      });
      setPage(dto.page);
      setTotal(dto.total);
    }
    setLoadingMore(false);
  }

  // Refetch on tab-enter (Radix remounts): reflects registrations/marks made elsewhere.
  useEffect(() => {
    let alive = true;
    void (async () => {
      const dto = await fetchRosterPage(1);
      if (alive && dto) {
        setRows(dto.items.map((r) => ({ ...r })));
        setSummary(dto.summary);
        setPage(1);
        setTotal(dto.total);
      }
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const nameByCandidate = new Map(rows.map((r) => [r.examCandidateId, r.studentName ?? r.studentNumber ?? r.examCandidateId]));
  const problems = markAllResult ? markAllResult.results.filter((r) => r.status !== "succeeded") : [];
  const hasMore = rows.length < total;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <ExaminationKpiCard label="Registados" value={summary.totalRegistered} />
        <ExaminationKpiCard label="Marcados" value={summary.marked} hint={`${summary.completionPercentage}% concluído`} />
        <ExaminationKpiCard label="Por marcar" value={summary.unmarked} />
        <ExaminationKpiCard label="Presentes" value={summary.present} hint={`${summary.absent} ausentes`} />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">Toque em P / A / L para marcar. Justificado e desqualificado pedem um motivo.</p>
        <Button size="sm" onClick={() => setConfirmMarkAll(true)} disabled={summary.unmarked === 0 || bulkPending}>
          {bulkPending ? "A marcar…" : "Marcar todos presentes"}
        </Button>
      </div>

      {rows.length === 0 ? (
        <ExaminationEmptyState title="Sem candidatos registados para assiduidade." />
      ) : (
        <>
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
                  <th className="px-3 py-2 font-medium">Aluno</th>
                  <th className="px-3 py-2 font-medium">Assiduidade</th>
                  <th className="px-3 py-2 text-right font-medium">Ações</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.examCandidateId} className={cn("border-b last:border-0", r.pending && "opacity-60")}>
                    <td className="px-3 py-2">
                      <div className="font-medium">{r.studentName ?? "—"}</div>
                      <div className="text-xs text-muted-foreground">{r.studentNumber ?? r.examCandidateId}</div>
                      {r.error && <div className="mt-1 text-xs text-destructive">{r.error}</div>}
                    </td>
                    <td className="px-3 py-2">
                      {r.attendanceStatus ? <ExaminationStatusBadge kind="attendance" status={r.attendanceStatus} /> : <span className="text-muted-foreground">Por marcar</span>}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center justify-end gap-1.5">
                        {!r.hasAttendance && r.allowedActions.canMark && (
                          <>
                            {QUICK.map((q) => (
                              <Button
                                key={q.value}
                                size="sm"
                                variant={r.attendanceStatus === q.value ? "default" : "outline"}
                                className="h-8 w-9 px-0 tabular-nums"
                                disabled={r.pending}
                                title={ATTENDANCE_LABELS[q.value]}
                                onClick={() => markOne(r, q.value)}
                              >
                                {q.short}
                              </Button>
                            ))}
                            <Button size="sm" variant="ghost" className="h-8" disabled={r.pending} onClick={() => setDialog({ row: r, mode: "mark" })}>
                              Mais…
                            </Button>
                          </>
                        )}
                        {r.hasAttendance && r.allowedActions.canCorrect && (
                          <Button size="sm" variant="outline" className="h-8" disabled={r.pending} onClick={() => setDialog({ row: r, mode: "correct" })}>
                            Corrigir
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>A mostrar {rows.length} de {total} candidatos.</span>
            {hasMore && (
              <Button variant="outline" size="sm" onClick={loadMore} disabled={loadingMore}>
                {loadingMore ? "A carregar…" : "Carregar mais"}
              </Button>
            )}
          </div>
        </>
      )}

      {/* Confirm mark-all */}
      <Dialog open={confirmMarkAll} onOpenChange={setConfirmMarkAll}>
        <DialogContent>
          <DialogHeader><DialogTitle>Marcar presença</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">
            {summary.unmarked} candidato(s) por marcar serão registados como <strong>Presente</strong>. Quem já tem presença é ignorado. Continuar?
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmMarkAll(false)}>Cancelar</Button>
            <Button onClick={runMarkAll}>Marcar todos presentes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Mark-all result summary */}
      <Dialog open={markAllResult !== null} onOpenChange={(o) => { if (!o) { setMarkAllResult(null); setShowDetails(false); } }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Presença marcada</DialogTitle></DialogHeader>
          {markAllResult && (
            <div className="space-y-3 text-sm">
              <ul className="space-y-1">
                <li><strong>{markAllResult.succeeded}</strong> atualizados</li>
                <li><strong>{markAllResult.skipped}</strong> já tinham presença</li>
                <li className={markAllResult.failed > 0 ? "text-destructive" : undefined}><strong>{markAllResult.failed}</strong> falharam</li>
              </ul>
              {problems.length > 0 && (
                <button type="button" className="text-xs text-accent underline-offset-2 hover:underline" onClick={() => setShowDetails((v) => !v)}>
                  {showDetails ? "Ocultar detalhes" : "Ver detalhes"}
                </button>
              )}
              {showDetails && (
                <div className="max-h-56 overflow-y-auto rounded-md border p-2 text-xs">
                  {problems.map((p) => (
                    <div key={p.ref} className="flex justify-between gap-3 border-b py-1 last:border-0">
                      <span className="truncate">{nameByCandidate.get(p.ref) ?? p.ref}</span>
                      <span className="shrink-0 text-muted-foreground">{p.message ?? p.code}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button onClick={() => { setMarkAllResult(null); setShowDetails(false); }}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {dialog && (
        <ReasonDialog
          key={dialog.row.examCandidateId + dialog.mode}
          row={dialog.row}
          mode={dialog.mode}
          onClose={() => setDialog(null)}
          onSubmit={async (status, remarks, reason) => {
            setDialog(null);
            if (dialog.mode === "mark") await markOne(dialog.row, status, remarks, reason);
            else await correctOne(dialog.row, status, remarks, reason ?? "");
          }}
        />
      )}
    </div>
  );
}

// ── Reason dialog: EXCUSED/DISQUALIFIED marking, or any correction ────────────
function ReasonDialog({
  row,
  mode,
  onClose,
  onSubmit,
}: {
  row: ExamAttendanceRosterItemDto;
  mode: "mark" | "correct";
  onClose: () => void;
  onSubmit: (status: string, remarks: string | undefined, reason: string | undefined) => void;
}) {
  const statuses = mode === "mark" ? REASON_STATUSES : Object.values(ExamAttendanceStatus);
  const [status, setStatus] = useState(mode === "mark" ? ExamAttendanceStatus.EXCUSED : row.attendanceStatus ?? ExamAttendanceStatus.PRESENT);
  const [remarks, setRemarks] = useState("");
  const [reason, setReason] = useState("");

  const reasonRequired = mode === "correct" || status === ExamAttendanceStatus.DISQUALIFIED;
  const excusedNeedsJustification = status === ExamAttendanceStatus.EXCUSED && !remarks && !reason;
  const blocked = (reasonRequired && !reason.trim()) || excusedNeedsJustification;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {mode === "mark" ? "Marcar assiduidade" : "Corrigir assiduidade"} — {row.studentName ?? row.examCandidateId}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>Estado</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {statuses.map((s) => (
                  <SelectItem key={s} value={s}>{ATTENDANCE_LABELS[s]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="att-remarks">Observações{status === ExamAttendanceStatus.EXCUSED ? "" : " (opcional)"}</Label>
            <Textarea id="att-remarks" value={remarks} onChange={(e) => setRemarks(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="att-reason">Motivo{reasonRequired ? "" : " (opcional)"}</Label>
            <Textarea id="att-reason" value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button disabled={blocked} onClick={() => onSubmit(status, remarks || undefined, reason || undefined)}>Guardar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
