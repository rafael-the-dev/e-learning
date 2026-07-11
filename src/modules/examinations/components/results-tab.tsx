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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import { toast } from "@/shared/hooks/use-toast";
import { ExamResultCode } from "@/modules/examinations/constants";
import type { ExamResultListItemDto } from "@/modules/examinations/types/portal";
import { ResultStatusBadge, ExaminationStatusBadge } from "./status-badges";
import { ExaminationDataTable, type ExaminationColumn } from "./examination-data-table";
import { AllowedActionButton } from "./allowed-action-button";

const RESULT_CODE_LABELS: Record<string, string> = {
  SCORED: "Pontuado",
  ABSENT: "Ausente",
  EXCUSED: "Justificado",
  DISQUALIFIED: "Desqualificado",
};

// Create a DRAFT result (no examResultId yet) or edit an existing DRAFT. SCORED requires a
// numeric score; the other codes require score = null (the command enforces this — the UI
// only guides). Editing an existing result records a reason (audit).
function ResultEntryDialog({ row, mode }: { row: ExamResultListItemDto; mode: "create" | "edit" }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [resultCode, setResultCode] = useState(row.resultCode ?? ExamResultCode.SCORED);
  const [score, setScore] = useState(row.score != null ? String(row.score) : "");
  const [maxScore, setMaxScore] = useState(row.maxScore != null ? String(row.maxScore) : "");
  const [reason, setReason] = useState("");

  const scored = resultCode === ExamResultCode.SCORED;

  async function submit(): Promise<void> {
    setLoading(true);
    try {
      const url = mode === "create" ? "/api/examinations/results" : `/api/examinations/results/${row.examResultId}`;
      const method = mode === "create" ? "POST" : "PATCH";
      const body: Record<string, unknown> = {
        resultCode,
        score: scored && score !== "" ? Number(score) : undefined,
        maxScore: maxScore !== "" ? Number(maxScore) : undefined,
        reason: reason || undefined,
      };
      if (mode === "create") body.examCandidateId = row.examCandidateId;
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const p = (await res.json().catch(() => ({}))) as { error?: string };
        toast({ title: "Ação recusada", description: p.error ?? "Não foi possível guardar o resultado.", variant: "destructive" });
        return;
      }
      toast({ title: mode === "create" ? "Resultado lançado" : "Resultado atualizado" });
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
      <Button variant={mode === "create" ? "default" : "outline"} size="sm" onClick={() => setOpen(true)}>
        {mode === "create" ? "Lançar" : "Editar"}
      </Button>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{mode === "create" ? "Lançar resultado" : "Editar resultado"} — {row.studentName ?? row.examCandidateId}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>Código do resultado</Label>
            <Select value={resultCode} onValueChange={setResultCode}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.values(ExamResultCode).map((c) => (
                  <SelectItem key={c} value={c}>{RESULT_CODE_LABELS[c]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="r-score">Pontuação{scored ? "" : " (n/a)"}</Label>
              <Input id="r-score" type="number" value={score} onChange={(e) => setScore(e.target.value)} disabled={!scored} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="r-max">Pontuação máxima</Label>
              <Input id="r-max" type="number" value={maxScore} onChange={(e) => setMaxScore(e.target.value)} />
            </div>
          </div>
          {mode === "edit" && (
            <div className="space-y-1"><Label htmlFor="r-reason">Motivo (opcional)</Label><Textarea id="r-reason" value={reason} onChange={(e) => setReason(e.target.value)} /></div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={loading}>Cancelar</Button>
          <Button onClick={submit} disabled={loading || maxScore === "" || (scored && score === "")}>Guardar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ResultsTab({
  items,
  page,
  pageSize,
  total,
}: {
  items: ExamResultListItemDto[];
  page: number;
  pageSize: number;
  total: number;
}) {
  const columns: ExaminationColumn<ExamResultListItemDto>[] = [
    { key: "student", header: "Aluno", render: (r) => (
      <div><div className="font-medium">{r.studentName ?? "—"}</div><div className="text-xs text-muted-foreground">{r.studentNumber ?? r.examCandidateId}</div></div>
    ) },
    { key: "attendance", header: "Assiduidade", render: (r) => (r.attendanceStatus ? <ExaminationStatusBadge kind="attendance" status={r.attendanceStatus} /> : "—") },
    { key: "status", header: "Estado", render: (r) => (r.resultStatus ? <ResultStatusBadge status={r.resultStatus} /> : "Sem resultado") },
    { key: "score", header: "Pontuação", render: (r) => (r.score != null ? `${r.score}${r.maxScore != null ? ` / ${r.maxScore}` : ""}` : "—") },
    // NEVER "Nota Final": this is the exam percentage, not the subject grade.
    { key: "normalized", header: "Percentagem do exame", render: (r) => (r.normalizedScore != null ? `${r.normalizedScore}%` : "—") },
    {
      key: "official",
      header: "Resultado oficial",
      render: (r) =>
        r.officialResult ? (
          <span className="text-xs">
            {r.officialResult.source === "REVISION" ? "Revisão" : "Base"}
            {r.officialResult.normalizedScore != null ? ` · ${r.officialResult.normalizedScore}%` : ""}
          </span>
        ) : (
          "—"
        ),
    },
    {
      key: "actions",
      header: "Ações",
      className: "text-right",
      render: (r) => (
        <div className="flex flex-wrap justify-end gap-2">
          {r.examResultId == null && r.allowedActions.canCreate && <ResultEntryDialog row={r} mode="create" />}
          {r.examResultId != null && r.allowedActions.canEdit && <ResultEntryDialog row={r} mode="edit" />}
          <AllowedActionButton allowed={r.allowedActions.canSubmit} url={`/api/examinations/results/${r.examResultId}/submit`} label="Submeter" variant="secondary" hideWhenDisallowed successMessage="Resultado submetido" />
          <AllowedActionButton allowed={r.allowedActions.canReview} url={`/api/examinations/results/${r.examResultId}/review`} label="Rever" variant="secondary" hideWhenDisallowed successMessage="Resultado revisto" />
          <AllowedActionButton allowed={r.allowedActions.canApprove} url={`/api/examinations/results/${r.examResultId}/approve`} label="Aprovar" hideWhenDisallowed confirm confirmTitle="Aprovar resultado" successMessage="Resultado aprovado" />
          <AllowedActionButton allowed={r.allowedActions.canReturnForCorrection} url={`/api/examinations/results/${r.examResultId}/return-for-correction`} label="Devolver" variant="outline" hideWhenDisallowed reasonRequired reasonLabel="Motivo da devolução" confirmTitle="Devolver para correção" successMessage="Resultado devolvido" />
        </div>
      ),
    },
  ];

  return (
    <ExaminationDataTable
      columns={columns}
      rows={items}
      rowKey={(r) => r.examResultId ?? r.examCandidateId}
      page={page}
      pageSize={pageSize}
      total={total}
      emptyTitle="Sem resultados para esta sessão."
    />
  );
}
