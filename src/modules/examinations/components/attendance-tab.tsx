"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
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
import { ExamAttendanceStatus } from "@/modules/examinations/constants";
import type {
  ExamAttendanceRosterDto,
  ExamAttendanceRosterItemDto,
} from "@/modules/examinations/types/portal";
import { ExaminationStatusBadge } from "./status-badges";
import { ExaminationKpiCard } from "./examination-cards";
import { ExaminationDataTable, type ExaminationColumn } from "./examination-data-table";

const ATTENDANCE_LABELS: Record<string, string> = {
  PRESENT: "Presente",
  ABSENT: "Ausente",
  LATE: "Atrasado",
  EXCUSED: "Justificado",
  DISQUALIFIED: "Desqualificado",
};

// Mark (unmarked candidate) or correct (already recorded). The server owns which is
// permitted — the row only shows the button its allowedActions flag enables. Marking a
// single candidate reuses the bulk endpoint with one item; a correction always carries a
// reason (audit of who changed the recorded attendance and why).
function AttendanceDialog({
  sessionId,
  item,
  mode,
}: {
  sessionId: string;
  item: ExamAttendanceRosterItemDto;
  mode: "mark" | "correct";
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState(item.attendanceStatus ?? ExamAttendanceStatus.PRESENT);
  const [remarks, setRemarks] = useState("");
  const [reason, setReason] = useState("");

  const reasonRequired = mode === "correct" || status === ExamAttendanceStatus.DISQUALIFIED;
  const justificationMissing =
    status === ExamAttendanceStatus.EXCUSED && !remarks && !reason;

  async function submit(): Promise<void> {
    setLoading(true);
    try {
      const url =
        mode === "mark"
          ? `/api/examinations/sessions/${sessionId}/attendance/bulk`
          : `/api/examinations/attendance/${item.examCandidateId}/correct`;
      const body =
        mode === "mark"
          ? { items: [{ examCandidateId: item.examCandidateId, status, remarks: remarks || undefined, reason: reason || undefined }] }
          : { status, remarks: remarks || undefined, reason };
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const p = (await res.json().catch(() => ({}))) as { error?: string };
        toast({ title: "Ação recusada", description: p.error ?? "Não foi possível registar.", variant: "destructive" });
        return;
      }
      toast({ title: mode === "mark" ? "Assiduidade registada" : "Assiduidade corrigida" });
      setOpen(false);
      router.refresh();
    } catch {
      toast({ title: "Erro de rede", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button variant={mode === "mark" ? "default" : "outline"} size="sm" onClick={() => setOpen(true)}>
        {mode === "mark" ? "Marcar" : "Corrigir"}
      </Button>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{mode === "mark" ? "Marcar assiduidade" : "Corrigir assiduidade"} — {item.studentName ?? item.examCandidateId}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>Estado</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.values(ExamAttendanceStatus).map((s) => (
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
          <Button variant="outline" onClick={() => setOpen(false)} disabled={loading}>Cancelar</Button>
          <Button onClick={submit} disabled={loading || (reasonRequired && !reason) || justificationMissing}>
            Guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function AttendanceTab({ sessionId, roster }: { sessionId: string; roster: ExamAttendanceRosterDto }) {
  const { summary } = roster;
  const columns: ExaminationColumn<ExamAttendanceRosterItemDto>[] = [
    { key: "student", header: "Aluno", render: (r) => (
      <div><div className="font-medium">{r.studentName ?? "—"}</div><div className="text-xs text-muted-foreground">{r.studentNumber ?? r.examCandidateId}</div></div>
    ) },
    { key: "candidateStatus", header: "Candidato", render: (r) => <ExaminationStatusBadge kind="candidate" status={r.candidateStatus} /> },
    { key: "attendance", header: "Assiduidade", render: (r) => (r.attendanceStatus ? <ExaminationStatusBadge kind="attendance" status={r.attendanceStatus} /> : "Por marcar") },
    { key: "remarks", header: "Observações", render: (r) => r.remarks ?? "—" },
    {
      key: "actions",
      header: "Ações",
      className: "text-right",
      render: (r) => (
        <div className="flex justify-end gap-2">
          {!r.hasAttendance && r.allowedActions.canMark && <AttendanceDialog sessionId={sessionId} item={r} mode="mark" />}
          {r.hasAttendance && r.allowedActions.canCorrect && <AttendanceDialog sessionId={sessionId} item={r} mode="correct" />}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <ExaminationKpiCard label="Registados" value={summary.totalRegistered} />
        <ExaminationKpiCard label="Marcados" value={summary.marked} hint={`${summary.completionPercentage}% concluído`} />
        <ExaminationKpiCard label="Por marcar" value={summary.unmarked} />
        <ExaminationKpiCard label="Presentes" value={summary.present} hint={`${summary.absent} ausentes`} />
      </div>
      <ExaminationDataTable
        columns={columns}
        rows={roster.items}
        rowKey={(r) => r.examCandidateId}
        page={roster.page}
        pageSize={roster.pageSize}
        total={roster.total}
        emptyTitle="Sem candidatos registados para assiduidade."
      />
    </div>
  );
}
