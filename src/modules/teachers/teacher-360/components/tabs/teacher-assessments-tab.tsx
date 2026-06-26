import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui/card";
import { ExecutiveKpiGrid } from "@/shared/components/layout/executive-dashboard";
import { StatCard } from "@/shared/components/layout/stat-card";
import { StatusBadge } from "@/shared/components/data/status-badge";
import { EmptyState } from "@/shared/components/layout/empty-state";
import { Button } from "@/shared/components/ui/button";
import { ClipboardList, ClipboardCheck, CheckCircle2, AlertTriangle, ChevronLeft, ChevronRight } from "lucide-react";
import type { Assessment } from "@/modules/assessments/types";
import type { PaginatedResult } from "@/shared/types/common";
import type { TeacherAssessmentMetrics } from "@/modules/teachers/teacher-360/repositories/teacher-360.repository";

interface TeacherAssessmentsTabProps {
  assessments: PaginatedResult<Assessment>;
  metrics: TeacherAssessmentMetrics;
}

export function TeacherAssessmentsTab({ assessments, metrics }: TeacherAssessmentsTabProps) {
  const { data } = assessments;

  return (
    <div className="space-y-6">
      <ExecutiveKpiGrid>
        <StatCard title="Avaliações Criadas" value={assessments.total} icon={<ClipboardList className="size-4 text-indigo-500" />} />
        <StatCard title="Por Classificar" value={metrics.pendingGradingResultsCount} icon={<ClipboardCheck className="size-4 text-amber-500" />} />
        <StatCard title="Publicadas" value={metrics.publishedCount} icon={<CheckCircle2 className="size-4 text-emerald-500" />} />
        <StatCard title="Atrasadas" value={metrics.overdueOpenCount} icon={<AlertTriangle className="size-4 text-red-500" />} />
      </ExecutiveKpiGrid>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">Avaliações</CardTitle>
        </CardHeader>
        <CardContent>
          {data.length === 0 ? (
            <EmptyState icon={<ClipboardList className="size-8" />} title="Sem avaliações criadas" />
          ) : (
            <div className="space-y-2">
              <div className="rounded-md border overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr className="text-left text-xs text-muted-foreground">
                      <th className="px-3 py-2">Avaliação</th>
                      <th className="px-3 py-2">Turma</th>
                      <th className="px-3 py-2">Estado</th>
                      <th className="px-3 py-2">Data</th>
                      <th className="px-3 py-2">Resultados</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {data.map((a) => (
                      <tr key={a.id}>
                        <td className="px-3 py-2 font-medium">
                          <Link href={`/assessments/${a.id}/grade`} className="hover:underline">
                            {a.title}
                          </Link>
                        </td>
                        <td className="px-3 py-2">{a.classGroupName ?? "—"}</td>
                        <td className="px-3 py-2"><StatusBadge status={a.status} /></td>
                        <td className="px-3 py-2">{new Date(a.assessmentDate).toLocaleDateString("pt-PT")}</td>
                        <td className="px-3 py-2 tabular-nums">{a.resultsCount ?? 0}</td>
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
                        <Link href={`?tab=assessments&page=${assessments.page - 1}`}>
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
                        <Link href={`?tab=assessments&page=${assessments.page + 1}`}>
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
    </div>
  );
}
