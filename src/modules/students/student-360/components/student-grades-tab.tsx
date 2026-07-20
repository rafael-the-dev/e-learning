import Link from "next/link";
import { StatCard } from "@/shared/components/layout/stat-card";
import { ExecutiveKpiGrid } from "@/shared/components/layout/executive-dashboard";
import { Card, CardHeader, CardTitle, CardContent } from "@/shared/components/ui/card";
import { Badge } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import { EmptyState } from "@/shared/components/layout/empty-state";
import {
  STUDENT_RESULT_STATUS_LABELS,
  GRADE_COMPONENT_TYPE_LABELS,
} from "@/modules/grades/types";
import { STUDENT_SUBJECT_PROGRESS_STATUS_LABELS } from "@/modules/assessments/types";
import { BookOpen, CheckCircle2, XCircle, AlertTriangle, Clock, ChevronLeft, ChevronRight } from "lucide-react";
import type { StudentAssessmentResult } from "@/modules/grades/types";
import type { StudentSubjectProgress } from "@/modules/assessments/types";
import type { StudentAcademicSummary } from "@/modules/students/services/student-academic-summary.service";
import type { PaginatedResult } from "@/shared/types/common";

const PROGRESS_VARIANT: Record<string, "secondary" | "outline" | "destructive"> = {
  PASSED: "secondary",
  FAILED: "destructive",
  INCOMPLETE: "outline",
  BLOCKED: "destructive",
  IN_PROGRESS: "outline",
  NOT_STARTED: "outline",
};

interface StudentGradesTabProps {
  assessments: PaginatedResult<StudentAssessmentResult>;
  subjectProgress: StudentSubjectProgress[];
  // Canonical academic figures — the headline KPIs come from here, NEVER recomputed
  // over the paginated assessment slice (which previously made "Média" change per page).
  academicSummary: StudentAcademicSummary;
}

export function StudentGradesTab({ assessments, subjectProgress, academicSummary }: StudentGradesTabProps) {
  const pendingAssessments = assessments.data.filter((a) => a.status === "SUBMITTED").length;

  return (
    <div className="space-y-6">
      <ExecutiveKpiGrid>
        <StatCard
          title="Média das Disciplinas"
          value={academicSummary.subjectAverage != null ? academicSummary.subjectAverage.toFixed(1) : "—"}
          icon={<BookOpen className="size-4 text-violet-500" />}
        />
        <StatCard title="Aprovadas" value={academicSummary.passedSubjects} icon={<CheckCircle2 className="size-4 text-emerald-500" />} />
        <StatCard title="Reprovadas" value={academicSummary.failedSubjects} icon={<XCircle className="size-4 text-red-500" />} />
        <StatCard title="Incompletas" value={academicSummary.incompleteSubjects} icon={<AlertTriangle className="size-4 text-amber-500" />} />
        <StatCard title="Avaliações Pendentes" value={pendingAssessments} icon={<Clock className="size-4 text-blue-500" />} />
      </ExecutiveKpiGrid>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">Avaliações</CardTitle>
        </CardHeader>
        <CardContent>
          {assessments.data.length === 0 ? (
            <EmptyState icon={<BookOpen className="size-8" />} title="Sem avaliações" description="Nenhuma avaliação registada para este aluno." />
          ) : (
            <div className="space-y-2">
              <div className="rounded-md border overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr className="text-left text-xs text-muted-foreground">
                      <th className="px-3 py-2">Disciplina</th>
                      <th className="px-3 py-2">Componente</th>
                      <th className="px-3 py-2 text-right">Nota</th>
                      <th className="px-3 py-2 text-right">Nota Norm.</th>
                      <th className="px-3 py-2">Estado</th>
                      <th className="px-3 py-2">Classificado em</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {assessments.data.map((a) => (
                      <tr key={a.id}>
                        <td className="px-3 py-2">{a.subjectName ?? "—"}</td>
                        <td className="px-3 py-2 text-xs">
                          {a.componentName ?? (a.componentType ? GRADE_COMPONENT_TYPE_LABELS[a.componentType] ?? a.componentType : "—")}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">{a.grade} / {a.maxGrade}</td>
                        <td className="px-3 py-2 text-right tabular-nums font-medium">{a.normalizedGrade.toFixed(1)}</td>
                        <td className="px-3 py-2">
                          <Badge variant="outline">{STUDENT_RESULT_STATUS_LABELS[a.status] ?? a.status}</Badge>
                        </td>
                        <td className="px-3 py-2 text-xs text-muted-foreground">
                          {a.gradedAt ? new Date(a.gradedAt).toLocaleDateString("pt-PT") : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {assessments.totalPages > 1 && (
                <div className="flex items-center justify-between text-xs text-muted-foreground px-1">
                  <span>Página {assessments.page} de {assessments.totalPages}</span>
                  <div className="flex items-center gap-1">
                    {assessments.hasPreviousPage ? (
                      <Button asChild variant="outline" size="icon" className="size-7">
                        <Link href={`?tab=grades&page=${assessments.page - 1}`}>
                          <ChevronLeft className="size-3.5" />
                        </Link>
                      </Button>
                    ) : (
                      <Button variant="outline" size="icon" className="size-7" disabled>
                        <ChevronLeft className="size-3.5" />
                      </Button>
                    )}
                    {assessments.hasNextPage ? (
                      <Button asChild variant="outline" size="icon" className="size-7">
                        <Link href={`?tab=grades&page=${assessments.page + 1}`}>
                          <ChevronRight className="size-3.5" />
                        </Link>
                      </Button>
                    ) : (
                      <Button variant="outline" size="icon" className="size-7" disabled>
                        <ChevronRight className="size-3.5" />
                      </Button>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">Notas Finais</CardTitle>
        </CardHeader>
        <CardContent>
          {subjectProgress.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">Sem notas finais registadas.</p>
          ) : (
            <div className="rounded-md border overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr className="text-left text-xs text-muted-foreground">
                    <th className="px-3 py-2">Disciplina</th>
                    <th className="px-3 py-2 text-right">Nota Final</th>
                    <th className="px-3 py-2 text-right">Nota Mínima</th>
                    <th className="px-3 py-2">Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {subjectProgress.map((p) => (
                    <tr key={p.id}>
                      <td className="px-3 py-2">{p.subjectName ?? "—"}</td>
                      <td className="px-3 py-2 text-right tabular-nums font-medium">{p.finalGrade != null ? p.finalGrade.toFixed(1) : "—"}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{p.minimumPassingGrade ?? "—"}</td>
                      <td className="px-3 py-2">
                        <Badge variant={PROGRESS_VARIANT[p.status] ?? "outline"}>
                          {STUDENT_SUBJECT_PROGRESS_STATUS_LABELS[p.status] ?? p.status}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
