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
import type { BulkSummary } from "@/modules/examinations/lib/bulk-runner";

// PT-PT for the typed codes the runner/commands surface — so a summary never shows a
// raw ENGINE_CODE. Unknown codes fall back to the runner's message.
export const BULK_CODE_LABELS: Record<string, string> = {
  // lifecycle / state
  RESULT_NOT_DRAFT: "Já não é rascunho",
  RESULT_NOT_SUBMITTED: "Não está submetido",
  RESULT_NOT_REVIEWED: "Não está revisto",
  RESULT_NOT_RETURNABLE: "Não pode ser devolvido",
  SESSION_NOT_OPEN_FOR_RESULTS: "Sessão não aberta a resultados",
  SESSION_NOT_COMPLETED: "Sessão não concluída",
  ATTENDANCE_ALREADY_MARKED: "Já tinha presença",
  ATTENDANCE_NOT_MARKED: "Assiduidade por marcar",
  // separation of duties
  SELF_REVIEW_NOT_ALLOWED: "Não pode rever o próprio lançamento",
  MARKER_REQUIRED: "Falta o corretor",
  REVIEWER_REQUIRED: "Falta o revisor",
  APPROVER_IS_MARKER: "O aprovador foi o corretor",
  APPROVER_IS_REVIEWER: "O aprovador foi o revisor",
  // data
  RESULT_INCOMPLETE: "Resultado incompleto",
  RESULT_STALE: "Resultado desatualizado",
  RESULT_ALREADY_EXISTS: "Já existe resultado",
  RESULT_CODE_MISMATCH: "Código incompatível com a nota",
  SCORE_REQUIRED: "Nota obrigatória",
  SCORE_OUT_OF_RANGE: "Nota fora do intervalo",
  MAX_SCORE_INVALID: "Nota máxima inválida",
  CANDIDATE_NOT_REGISTERED: "Candidato não inscrito",
  // generic
  RESULT_CONCURRENTLY_CHANGED: "Alterado entretanto — recarregue",
  CONFLICT: "Conflito de concorrência — recarregue",
  NOT_FOUND: "Não encontrado",
  VALIDATION_ERROR: "Dados inválidos",
  FORBIDDEN: "Sem permissão",
  SKIPPED: "Ignorado após falha anterior",
  INTERNAL_ERROR: "Erro interno",
};

export function bulkCodeLabel(code?: string, fallback?: string): string {
  if (code && BULK_CODE_LABELS[code]) return BULK_CODE_LABELS[code];
  return fallback ?? code ?? "—";
}

export function BulkSummaryDialog({
  open,
  onOpenChange,
  title,
  summary,
  nameOf,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  summary: BulkSummary | null;
  nameOf?: (ref: string) => string;
}) {
  const [showDetails, setShowDetails] = useState(false);
  const problems = summary ? summary.results.filter((r) => r.status !== "succeeded") : [];

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) setShowDetails(false);
        onOpenChange(o);
      }}
    >
      <DialogContent>
        <DialogHeader><DialogTitle>{title}</DialogTitle></DialogHeader>
        {summary && (
          <div className="space-y-3 text-sm">
            <ul className="space-y-1">
              <li><strong>{summary.succeeded}</strong> concluídos</li>
              <li><strong>{summary.skipped}</strong> ignorados</li>
              <li className={summary.failed > 0 ? "text-destructive" : undefined}><strong>{summary.failed}</strong> falharam</li>
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
                    <span className="truncate">{nameOf ? nameOf(p.ref) : p.ref}</span>
                    <span className={`shrink-0 ${p.status === "failed" ? "text-destructive" : "text-muted-foreground"}`}>
                      {bulkCodeLabel(p.code, p.message)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
        <DialogFooter>
          <Button onClick={() => onOpenChange(false)}>Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
