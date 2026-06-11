"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Save, Calculator } from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Badge } from "@/shared/components/ui/badge";
import { toast } from "@/shared/hooks/use-toast";
import {
  createStudentAssessmentResultAction,
  calculateStudentSubjectProgressAction,
} from "@/modules/grades/actions/grade.actions";
import { STUDENT_RESULT_STATUS_LABELS } from "@/modules/grades/types";
import type { SubjectAssessmentComponent, StudentAssessmentResult } from "@/modules/grades/types";

interface EnrollmentRow {
  enrollmentId: string;
  studentId: string;
  studentName: string;
  studentCode: string | null;
  existingResult?: StudentAssessmentResult;
}

interface Props {
  levelSubjectId: string;
  component: SubjectAssessmentComponent;
  rows: EnrollmentRow[];
  canGrade: boolean;
}

export function GradeEntryTable({ levelSubjectId, component, rows, canGrade }: Props) {
  const router = useRouter();
  const [grades, setGrades] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const row of rows) {
      if (row.existingResult) {
        init[row.enrollmentId] = String(row.existingResult.grade);
      }
    }
    return init;
  });
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    let successCount = 0;
    let errorCount = 0;

    for (const row of rows) {
      const gradeStr = grades[row.enrollmentId];
      if (gradeStr === undefined || gradeStr === "") continue;

      const grade = Number(gradeStr);
      if (isNaN(grade)) continue;

      const res = await createStudentAssessmentResultAction({
        enrollmentId: row.enrollmentId,
        studentId: row.studentId,
        assessmentComponentId: component.id,
        grade,
      });

      if (res.success) {
        successCount++;
      } else {
        errorCount++;
      }
    }

    if (successCount > 0) {
      toast.success(`${successCount} nota(s) guardada(s).`);
    }
    if (errorCount > 0) {
      toast.error(`${errorCount} nota(s) com erro.`);
    }

    setSaving(false);
    router.refresh();
  }

  async function handleRecalculate(enrollmentId: string, studentId: string) {
    const res = await calculateStudentSubjectProgressAction({
      studentId,
      enrollmentId,
      levelSubjectId,
    });
    if (res.success) {
      toast.success("Progresso recalculado.");
      router.refresh();
    } else {
      toast.error(res.error ?? "Erro ao recalcular progresso.");
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          {rows.length} aluno(s) · Nota máxima: {component.maxGrade}
        </div>
        {canGrade && (
          <Button size="sm" onClick={handleSave} disabled={saving}>
            <Save className="size-3.5 mr-1.5" />
            {saving ? "A guardar..." : "Guardar Notas"}
          </Button>
        )}
      </div>

      <div className="rounded-md border overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/40">
              <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Aluno</th>
              <th className="text-left px-4 py-2.5 font-medium text-muted-foreground w-32">
                Nota (0–{component.maxGrade})
              </th>
              <th className="text-left px-4 py-2.5 font-medium text-muted-foreground w-28">
                Estado
              </th>
              {canGrade && (
                <th className="text-right px-4 py-2.5 font-medium text-muted-foreground w-16">
                  Ações
                </th>
              )}
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.map((row) => {
              const existing = row.existingResult;
              return (
                <tr key={row.enrollmentId} className="hover:bg-muted/20">
                  <td className="px-4 py-2.5">
                    <div className="font-medium">{row.studentName}</div>
                    {row.studentCode && (
                      <div className="text-xs text-muted-foreground font-mono">{row.studentCode}</div>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    {canGrade ? (
                      <Input
                        type="number"
                        min={0}
                        max={component.maxGrade}
                        step={0.5}
                        className="h-7 w-24 text-sm"
                        value={grades[row.enrollmentId] ?? ""}
                        onChange={(e) =>
                          setGrades((prev) => ({
                            ...prev,
                            [row.enrollmentId]: e.target.value,
                          }))
                        }
                      />
                    ) : (
                      <span>{existing?.grade ?? "—"}</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    {existing ? (
                      <Badge variant={existing.status === "GRADED" ? "default" : "secondary"} className="text-xs">
                        {STUDENT_RESULT_STATUS_LABELS[existing.status] ?? existing.status}
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground text-xs">Sem nota</span>
                    )}
                  </td>
                  {canGrade && (
                    <td className="px-4 py-2.5 text-right">
                      {existing && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-7"
                          title="Recalcular progresso"
                          onClick={() => handleRecalculate(row.enrollmentId, row.studentId)}
                        >
                          <Calculator className="size-3.5" />
                        </Button>
                      )}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
