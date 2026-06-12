"use client";

import { useState } from "react";
import { ChevronRight } from "lucide-react";
import { Badge } from "@/shared/components/ui/badge";
import { cn } from "@/shared/lib/utils";
import type { SubjectProgressSummary } from "@/modules/grades/services/academic-progress.service";

const PROGRESS_STATUS_LABELS: Record<string, string> = {
  NOT_STARTED: "Por Iniciar",
  IN_PROGRESS: "Em Progresso",
  PASSED: "Aprovado",
  FAILED: "Reprovado",
  RECOVERY_REQUIRED: "Recuperação",
  INCOMPLETE: "Incompleto",
  BLOCKED: "Bloqueado",
};

const PROGRESS_BADGE_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  PASSED: "default",
  FAILED: "destructive",
  RECOVERY_REQUIRED: "destructive",
  BLOCKED: "destructive",
  IN_PROGRESS: "secondary",
  INCOMPLETE: "outline",
  NOT_STARTED: "outline",
};

const COMPONENT_TYPE_LABELS: Record<string, string> = {
  TEST: "Teste",
  QUIZ: "Questionário",
  EXAM: "Exame",
  ASSIGNMENT: "Trabalho",
  PROJECT: "Projeto",
  ORAL: "Oral",
  PRACTICAL: "Prático",
  PARTICIPATION: "Participação",
  FINAL_EXAM: "Exame Final",
  RECOVERY: "Recuperação",
  OTHER: "Outro",
};

const RESULT_STATUS_LABELS: Record<string, string> = {
  DRAFT: "Rascunho",
  SUBMITTED: "Submetido",
  GRADED: "Classificado",
  CANCELLED: "Cancelado",
};

const RESULT_STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  GRADED: "default",
  SUBMITTED: "secondary",
  DRAFT: "outline",
  CANCELLED: "destructive",
};

interface Props {
  subject: SubjectProgressSummary;
}

export function TranscriptSubjectRow({ subject }: Props) {
  const [expanded, setExpanded] = useState(false);
  const hasComponents = subject.components.length > 0;
  const variant = PROGRESS_BADGE_VARIANT[subject.status] ?? "outline";

  return (
    <>
      <tr
        className={cn(
          "hover:bg-muted/20 transition-colors",
          hasComponents && "cursor-pointer"
        )}
        onClick={() => hasComponents && setExpanded((v) => !v)}
      >
        <td className="px-5 py-3 font-medium">
          <div className="flex items-center gap-2">
            {hasComponents && (
              <ChevronRight
                className={cn(
                  "size-3.5 text-muted-foreground shrink-0 transition-transform duration-150",
                  expanded && "rotate-90"
                )}
              />
            )}
            {subject.subjectName ?? subject.levelSubjectId}
          </div>
        </td>
        <td className="px-5 py-3 text-right tabular-nums font-mono font-semibold">
          {subject.finalGrade != null
            ? subject.finalGrade.toLocaleString("pt-PT", {
                minimumFractionDigits: 1,
                maximumFractionDigits: 1,
              })
            : <span className="text-muted-foreground font-normal">—</span>}
        </td>
        <td className="px-5 py-3 text-right tabular-nums text-muted-foreground">
          {subject.minimumPassingGrade != null ? subject.minimumPassingGrade : "—"}
        </td>
        <td className="px-5 py-3">
          <Badge variant={variant} className="text-xs">
            {PROGRESS_STATUS_LABELS[subject.status] ?? subject.status}
          </Badge>
        </td>
        <td className="px-5 py-3 text-muted-foreground text-xs">
          {subject.completedAt
            ? new Date(subject.completedAt).toLocaleDateString("pt-PT")
            : "—"}
        </td>
      </tr>

      {expanded && hasComponents && (
        <tr>
          <td colSpan={5} className="p-0 bg-muted/5">
            <div className="px-8 py-3 border-t border-b border-muted/50">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-muted-foreground border-b border-muted/30">
                    <th className="text-left py-1.5 pr-4 font-medium">Componente</th>
                    <th className="text-left py-1.5 pr-4 font-medium w-28">Tipo</th>
                    <th className="text-right py-1.5 pr-4 font-medium w-16">Peso</th>
                    <th className="text-right py-1.5 pr-4 font-medium w-24">Nota</th>
                    <th className="text-right py-1.5 pr-4 font-medium w-24">Norm.</th>
                    <th className="text-left py-1.5 pr-4 font-medium w-28">Estado</th>
                    <th className="text-left py-1.5 font-medium w-24">Data</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-muted/20">
                  {subject.components.map((comp) => (
                    <tr key={comp.componentId} className="hover:bg-muted/10">
                      <td className="py-2 pr-4 font-medium text-foreground/80">
                        {comp.componentName}
                        {comp.isRequired && (
                          <span className="ml-1 text-[10px] text-muted-foreground">(obrigatório)</span>
                        )}
                      </td>
                      <td className="py-2 pr-4 text-muted-foreground">
                        {COMPONENT_TYPE_LABELS[comp.componentType] ?? comp.componentType}
                      </td>
                      <td className="py-2 pr-4 text-right tabular-nums text-muted-foreground">
                        {comp.weight > 0 ? `${comp.weight}%` : "—"}
                      </td>
                      <td className="py-2 pr-4 text-right tabular-nums font-mono">
                        {comp.grade != null
                          ? `${comp.grade.toLocaleString("pt-PT", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} / ${comp.maxGrade}`
                          : <span className="text-muted-foreground">—</span>}
                      </td>
                      <td className="py-2 pr-4 text-right tabular-nums font-mono">
                        {comp.normalizedGrade != null
                          ? comp.normalizedGrade.toLocaleString("pt-PT", { minimumFractionDigits: 1, maximumFractionDigits: 1 })
                          : <span className="text-muted-foreground">—</span>}
                      </td>
                      <td className="py-2 pr-4">
                        {comp.status
                          ? (
                            <Badge
                              variant={RESULT_STATUS_VARIANT[comp.status] ?? "outline"}
                              className="text-[10px] py-0"
                            >
                              {RESULT_STATUS_LABELS[comp.status] ?? comp.status}
                            </Badge>
                          )
                          : <span className="text-muted-foreground">Pendente</span>}
                      </td>
                      <td className="py-2 text-muted-foreground">
                        {comp.gradedAt
                          ? new Date(comp.gradedAt).toLocaleDateString("pt-PT")
                          : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
