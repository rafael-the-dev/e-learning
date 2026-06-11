"use client";

import { Badge } from "@/shared/components/ui/badge";
import { EmptyState } from "@/shared/components/layout/empty-state";
import { STUDENT_RESULT_STATUS_LABELS, GRADE_COMPONENT_TYPE_LABELS } from "@/modules/grades/types";
import { STUDENT_SUBJECT_PROGRESS_STATUS_LABELS } from "@/modules/assessments/types";
import type { StudentAssessmentResult } from "@/modules/grades/types";
import type { StudentSubjectProgress } from "@/modules/assessments/types";

interface SubjectGroup {
  subjectId: string;
  subjectName: string;
  progress: StudentSubjectProgress | null;
  results: StudentAssessmentResult[];
}

interface Props {
  groups: SubjectGroup[];
}

export function StudentGradesPanel({ groups }: Props) {
  if (groups.length === 0) {
    return (
      <EmptyState
        title="Sem notas registadas"
        description="Ainda não existem notas registadas para este aluno."
      />
    );
  }

  return (
    <div className="space-y-6">
      {groups.map((group) => {
        const progressStatus = group.progress?.status ?? "NOT_STARTED";
        const progressVariant =
          progressStatus === "PASSED"
            ? "default"
            : progressStatus === "FAILED"
              ? "destructive"
              : "secondary";

        return (
          <div key={group.subjectId} className="rounded-md border overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 bg-muted/40 border-b">
              <div className="font-medium">{group.subjectName}</div>
              <div className="flex items-center gap-3">
                {group.progress?.finalGrade != null && (
                  <span className="text-sm font-mono font-semibold">
                    {group.progress.finalGrade}%
                  </span>
                )}
                <Badge variant={progressVariant} className="text-xs">
                  {STUDENT_SUBJECT_PROGRESS_STATUS_LABELS[progressStatus] ?? progressStatus}
                </Badge>
              </div>
            </div>

            {group.results.length === 0 ? (
              <div className="px-4 py-3 text-sm text-muted-foreground">Sem notas registadas</div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left px-4 py-2 font-medium text-muted-foreground text-xs">
                      Componente
                    </th>
                    <th className="text-left px-4 py-2 font-medium text-muted-foreground text-xs">
                      Tipo
                    </th>
                    <th className="text-right px-4 py-2 font-medium text-muted-foreground text-xs">
                      Nota
                    </th>
                    <th className="text-right px-4 py-2 font-medium text-muted-foreground text-xs">
                      Normalizada
                    </th>
                    <th className="text-right px-4 py-2 font-medium text-muted-foreground text-xs">
                      Estado
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {group.results.map((r) => (
                    <tr key={r.id} className="hover:bg-muted/20">
                      <td className="px-4 py-2.5">{r.componentName ?? "—"}</td>
                      <td className="px-4 py-2.5 text-muted-foreground">
                        {GRADE_COMPONENT_TYPE_LABELS[r.componentType ?? ""] ?? r.componentType ?? "—"}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono">
                        {r.grade} / {r.maxGrade}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono">
                        {r.normalizedGrade.toFixed(1)}%
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <Badge
                          variant={r.status === "GRADED" ? "default" : "secondary"}
                          className="text-xs"
                        >
                          {STUDENT_RESULT_STATUS_LABELS[r.status] ?? r.status}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {group.progress?.progressReason && (
              <div className="px-4 py-2 text-xs text-muted-foreground border-t bg-muted/20">
                {group.progress.progressReason}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
