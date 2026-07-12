"use client";

import { useState } from "react";
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
import { toast } from "@/shared/hooks/use-toast";
import { cn } from "@/shared/lib/utils";
import { ExamAttendanceStatus } from "@/modules/examinations/constants";
import type { ExamAttendanceRosterDto, ExamAttendanceRosterItemDto } from "@/modules/examinations/types/portal";
import { ExaminationStatusBadge } from "./status-badges";
import { ExaminationKpiCard } from "./examination-cards";
import { ExaminationEmptyState } from "./examination-states";

// =============================================================================
// AttendanceTab — inline, optimistic, no-reload marking (Critical #4 + #6)
// -----------------------------------------------------------------------------
// P / A / L are one-tap quick actions; EXCUSED / DISQUALIFIED (and every
// correction) require a reason dialog. State is optimistic PER ROW: the row flips
// immediately, is locked against double-submit while pending, rolls back with a
// typed inline error on failure, and NEVER triggers a full-page reload. "Marcar
// todos presentes" uses the real bulk endpoint (one call). The UI shows a button
// only when the row's server-computed allowedActions permit it.
// =============================================================================

const ATTENDANCE_LABELS: Record<string, string> = {
  PRESENT: "Presente",
  ABSENT: "Ausente",
  LATE: "Atrasado",
  EXCUSED: "Justificado",
  DISQUALIFIED: "Desqualificado",
};

// Quick, reason-free statuses (one tap). EXCUSED/DISQUALIFIED are handled by dialog.
const QUICK: Array<{ value: string; short: string }> = [
  { value: ExamAttendanceStatus.PRESENT, short: "P" },
  { value: ExamAttendanceStatus.ABSENT, short: "A" },
  { value: ExamAttendanceStatus.LATE, short: "L" },
];
const REASON_STATUSES = [ExamAttendanceStatus.EXCUSED, ExamAttendanceStatus.DISQUALIFIED];

type Row = ExamAttendanceRosterItemDto & { pending?: boolean; error?: string | null };

interface Snapshot {
  attendanceStatus: string | null;
  hasAttendance: boolean;
}

export function AttendanceTab({ sessionId, roster }: { sessionId: string; roster: ExamAttendanceRosterDto }) {
  const [rows, setRows] = useState<Row[]>(() => roster.items.map((r) => ({ ...r })));
  const [bulkPending, setBulkPending] = useState(false);
  const [dialog, setDialog] = useState<{ row: Row; mode: "mark" | "correct" } | null>(null);

  const bulkUrl = `/api/examinations/sessions/${sessionId}/attendance/bulk`;

  function patch(id: string, next: Partial<Row>): void {
    setRows((prev) => prev.map((r) => (r.examCandidateId === id ? { ...r, ...next } : r)));
  }

  // Derived, live summary (updates optimistically from local rows).
  const marked = rows.filter((r) => r.hasAttendance).length;
  const present = rows.filter((r) => r.attendanceStatus === ExamAttendanceStatus.PRESENT).length;
  const absent = rows.filter((r) => r.attendanceStatus === ExamAttendanceStatus.ABSENT).length;
  const unmarked = rows.length - marked;
  const pct = rows.length ? Math.round((marked / rows.length) * 100) : 0;

  // ── Single mark via the bulk endpoint (one item) ──────────────────────────
  async function markOne(row: Row, status: string, remarks?: string, reason?: string): Promise<void> {
    if (row.pending) return; // block double-submit
    const snap: Snapshot = { attendanceStatus: row.attendanceStatus, hasAttendance: row.hasAttendance };
    patch(row.examCandidateId, { attendanceStatus: status, hasAttendance: true, pending: true, error: null });
    try {
      const res = await fetch(bulkUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: [{ examCandidateId: row.examCandidateId, status, remarks, reason }] }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        error?: string;
        items?: Array<{ ok: boolean; message?: string }>;
      };
      const item = json.items?.[0];
      if (res.ok && item?.ok) {
        patch(row.examCandidateId, { pending: false, error: null });
      } else {
        patch(row.examCandidateId, { ...snap, pending: false, error: item?.message ?? json.error ?? "Falhou." });
      }
    } catch {
      patch(row.examCandidateId, { ...snap, pending: false, error: "Erro de rede." });
    }
  }

  // ── Correct an existing attendance (reason mandatory) ──────────────────────
  async function correctOne(row: Row, status: string, remarks: string | undefined, reason: string): Promise<void> {
    if (row.pending) return;
    const snap: Snapshot = { attendanceStatus: row.attendanceStatus, hasAttendance: row.hasAttendance };
    patch(row.examCandidateId, { attendanceStatus: status, pending: true, error: null });
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
        patch(row.examCandidateId, { ...snap, pending: false, error: p.error ?? "Não foi possível corrigir." });
      }
    } catch {
      patch(row.examCandidateId, { ...snap, pending: false, error: "Erro de rede." });
    }
  }

  // ── Mark all unmarked candidates present (one bulk call) ───────────────────
  async function markAllPresent(): Promise<void> {
    const targets = rows.filter((r) => !r.hasAttendance && r.allowedActions.canMark && !r.pending);
    if (targets.length === 0) return;
    setBulkPending(true);
    const ids = new Set(targets.map((t) => t.examCandidateId));
    setRows((prev) =>
      prev.map((r) =>
        ids.has(r.examCandidateId)
          ? { ...r, attendanceStatus: ExamAttendanceStatus.PRESENT, hasAttendance: true, pending: true, error: null }
          : r
      )
    );
    try {
      const res = await fetch(bulkUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: targets.map((t) => ({ examCandidateId: t.examCandidateId, status: ExamAttendanceStatus.PRESENT })) }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        error?: string;
        succeeded?: number;
        failed?: number;
        items?: Array<{ examCandidateId: string; ok: boolean; message?: string }>;
      };
      if (!res.ok || !json.items) {
        // Whole call failed — roll every optimistic row back.
        setRows((prev) => prev.map((r) => (ids.has(r.examCandidateId) ? { ...r, attendanceStatus: null, hasAttendance: false, pending: false, error: json.error ?? "Falhou." } : r)));
        toast({ title: "Ação recusada", description: json.error ?? "Não foi possível marcar.", variant: "destructive" });
        return;
      }
      const byId = new Map(json.items.map((i) => [i.examCandidateId, i]));
      setRows((prev) =>
        prev.map((r) => {
          if (!ids.has(r.examCandidateId)) return r;
          const item = byId.get(r.examCandidateId);
          if (item?.ok) return { ...r, pending: false, error: null };
          return { ...r, attendanceStatus: null, hasAttendance: false, pending: false, error: item?.message ?? "Falhou." };
        })
      );
      toast({ title: `${json.succeeded ?? 0} marcados presentes`, description: json.failed ? `${json.failed} falharam.` : undefined });
    } catch {
      setRows((prev) => prev.map((r) => (ids.has(r.examCandidateId) ? { ...r, attendanceStatus: null, hasAttendance: false, pending: false, error: "Erro de rede." } : r)));
      toast({ title: "Erro de rede", variant: "destructive" });
    } finally {
      setBulkPending(false);
    }
  }

  const anyUnmarked = rows.some((r) => !r.hasAttendance && r.allowedActions.canMark);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <ExaminationKpiCard label="Registados" value={rows.length} />
        <ExaminationKpiCard label="Marcados" value={marked} hint={`${pct}% concluído`} />
        <ExaminationKpiCard label="Por marcar" value={unmarked} />
        <ExaminationKpiCard label="Presentes" value={present} hint={`${absent} ausentes`} />
      </div>

      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">Toque em P / A / L para marcar. Justificado e desqualificado pedem um motivo.</p>
        <Button size="sm" onClick={markAllPresent} disabled={!anyUnmarked || bulkPending}>
          {bulkPending ? "A marcar…" : "Marcar todos presentes"}
        </Button>
      </div>

      {rows.length === 0 ? (
        <ExaminationEmptyState title="Sem candidatos registados para assiduidade." />
      ) : (
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
      )}

      {roster.total > rows.length && (
        <p className="text-xs text-muted-foreground">A mostrar {rows.length} de {roster.total} candidatos.</p>
      )}

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
