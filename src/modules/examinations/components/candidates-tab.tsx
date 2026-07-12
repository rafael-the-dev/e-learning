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
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Textarea } from "@/shared/components/ui/textarea";
import { toast } from "@/shared/hooks/use-toast";
import type { ExamCandidateListItemDto } from "@/modules/examinations/types/portal";
import { CandidateStatusBadge, ExaminationStatusBadge } from "./status-badges";
import { ExaminationDataTable, type ExaminationColumn } from "./examination-data-table";
import { AllowedActionButton } from "./allowed-action-button";
import { StudentLookup, EnrollmentLookup } from "./entity-lookups";
import { BulkRegisterDialog } from "./bulk-register-dialog";

// Register / register-with-override. Override records the acting user + reason and NEVER
// hides that the candidate was originally ineligible (the eligibility verdict is stored
// server-side; the detail view shows the provenance). Student/enrollment ids are entered
// directly here (picker is a future enhancement).
function RegisterDialog({ sessionId, levelSubjectId, override }: { sessionId: string; levelSubjectId: string; override: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [studentId, setStudentId] = useState("");
  const [studentLabel, setStudentLabel] = useState<string | null>(null);
  const [enrollmentId, setEnrollmentId] = useState("");
  const [enrollmentLabel, setEnrollmentLabel] = useState<string | null>(null);
  const [assignedSeat, setAssignedSeat] = useState("");
  const [reason, setReason] = useState("");

  function reset(): void {
    setStudentId("");
    setStudentLabel(null);
    setEnrollmentId("");
    setEnrollmentLabel(null);
    setAssignedSeat("");
    setReason("");
  }

  async function submit(): Promise<void> {
    setLoading(true);
    try {
      const url = `/api/examinations/sessions/${sessionId}/candidates/${override ? "override" : "register"}`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ studentId, enrollmentId, levelSubjectId, assignedSeat: assignedSeat || undefined, reason: reason || undefined }),
      });
      if (!res.ok) {
        const p = (await res.json().catch(() => ({}))) as { error?: string };
        toast({ title: "Ação recusada", description: p.error ?? "Não foi possível inscrever.", variant: "destructive" });
        return;
      }
      toast({ title: override ? "Candidato inscrito (override)" : "Candidato inscrito" });
      reset();
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
      <Button variant={override ? "secondary" : "default"} size="sm" onClick={() => setOpen(true)}>
        {override ? "Inscrever com override" : "Inscrever candidato"}
      </Button>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{override ? "Inscrição com override de elegibilidade" : "Inscrever candidato"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          {override && (
            <p className="rounded-md bg-amber-50 p-2 text-xs text-amber-800">
              O override ignora apenas a elegibilidade académica. O veredito real é preservado e auditado.
            </p>
          )}
          <div className="space-y-1">
            <Label>Aluno</Label>
            <StudentLookup
              value={studentId || null}
              selectedLabel={studentLabel}
              onChange={(v, item) => {
                setStudentId(v ?? "");
                setStudentLabel(item?.label ?? null);
                setEnrollmentId("");
                setEnrollmentLabel(null);
              }}
            />
          </div>
          <div className="space-y-1">
            <Label>Matrícula</Label>
            <EnrollmentLookup
              studentId={studentId || null}
              value={enrollmentId || null}
              selectedLabel={enrollmentLabel}
              onChange={(v, item) => {
                setEnrollmentId(v ?? "");
                setEnrollmentLabel(item?.label ?? null);
              }}
            />
          </div>
          <div className="space-y-1"><Label htmlFor="c-seat">Lugar (opcional)</Label><Input id="c-seat" value={assignedSeat} onChange={(e) => setAssignedSeat(e.target.value)} /></div>
          {override && (
            <div className="space-y-1"><Label htmlFor="c-reason">Motivo do override</Label><Textarea id="c-reason" value={reason} onChange={(e) => setReason(e.target.value)} /></div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={loading}>Cancelar</Button>
          <Button onClick={submit} disabled={loading || !studentId || !enrollmentId || (override && !reason)}>Inscrever</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function CandidatesTab({
  sessionId,
  levelSubjectId,
  items,
  page,
  pageSize,
  total,
}: {
  sessionId: string;
  levelSubjectId: string;
  items: ExamCandidateListItemDto[];
  page: number;
  pageSize: number;
  total: number;
}) {
  const columns: ExaminationColumn<ExamCandidateListItemDto>[] = [
    { key: "student", header: "Aluno", render: (c) => (
      <div><div className="font-medium">{c.studentName ?? "—"}</div><div className="text-xs text-muted-foreground">{c.studentNumber ?? c.studentId}</div></div>
    ) },
    { key: "attempt", header: "Tentativa", render: (c) => c.attemptNumber ?? "—" },
    { key: "eligibility", header: "Elegibilidade", render: (c) => <ExaminationStatusBadge kind="candidate" status={c.eligibilityStatus} /> },
    { key: "status", header: "Estado", render: (c) => <CandidateStatusBadge status={c.candidateStatus} /> },
    { key: "seat", header: "Lugar", render: (c) => c.assignedSeat ?? "—" },
    { key: "attendance", header: "Assiduidade", render: (c) => c.attendanceStatus ? <ExaminationStatusBadge kind="attendance" status={c.attendanceStatus} /> : "—" },
    { key: "result", header: "Resultado", render: (c) => c.resultStatus ? <ExaminationStatusBadge kind="result" status={c.resultStatus} /> : "—" },
    { key: "override", header: "Override", render: (c) => (c.overridden ? "Sim" : "—") },
    {
      key: "actions",
      header: "Ações",
      className: "text-right",
      render: (c) => (
        <div className="flex justify-end gap-2">
          <AllowedActionButton allowed={c.allowedActions.canWithdraw} url={`/api/examinations/candidates/${c.examCandidateId}/withdraw`} label="Retirar" variant="outline" hideWhenDisallowed reasonRequired reasonLabel="Motivo" confirmTitle="Retirar candidato" successMessage="Candidato retirado" />
          <AllowedActionButton allowed={c.allowedActions.canDisqualify} url={`/api/examinations/candidates/${c.examCandidateId}/disqualify`} label="Desqualificar" variant="destructive" hideWhenDisallowed reasonRequired reasonLabel="Motivo da desqualificação" confirmTitle="Desqualificar candidato" successMessage="Candidato desqualificado" />
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-3">
      <div className="flex justify-end gap-2">
        <BulkRegisterDialog sessionId={sessionId} levelSubjectId={levelSubjectId} />
        <RegisterDialog sessionId={sessionId} levelSubjectId={levelSubjectId} override={false} />
        <RegisterDialog sessionId={sessionId} levelSubjectId={levelSubjectId} override />
      </div>
      <ExaminationDataTable columns={columns} rows={items} rowKey={(c) => c.examCandidateId} page={page} pageSize={pageSize} total={total} emptyTitle="Sem candidatos inscritos." />
    </div>
  );
}
