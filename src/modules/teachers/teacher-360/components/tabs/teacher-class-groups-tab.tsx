import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui/card";
import { ExecutiveKpiGrid } from "@/shared/components/layout/executive-dashboard";
import { StatCard } from "@/shared/components/layout/stat-card";
import { StatusBadge } from "@/shared/components/data/status-badge";
import { EmptyState } from "@/shared/components/layout/empty-state";
import { Button } from "@/shared/components/ui/button";
import { Users, GraduationCap, BarChart3, ChevronLeft, ChevronRight } from "lucide-react";
import type { ClassGroup } from "@/modules/class-groups/types";
import type { PaginatedResult } from "@/shared/types/common";

interface TeacherClassGroupsTabProps {
  classGroups: PaginatedResult<ClassGroup>;
  // Aggregates across ALL of the teacher's active class groups — computed once
  // in Teacher360Core, never derived from the current page. Must not be
  // recalculated from `classGroups.data` here, or these KPIs would change as
  // the user pages through the table.
  activeClassGroupCount: number;
  distinctActiveStudentCount: number;
  avgOccupancyPercent: number;
}

export function TeacherClassGroupsTab({
  classGroups,
  activeClassGroupCount,
  distinctActiveStudentCount,
  avgOccupancyPercent,
}: TeacherClassGroupsTabProps) {
  const { data } = classGroups;

  return (
    <div className="space-y-6">
      <ExecutiveKpiGrid>
        <StatCard title="Total de Turmas" value={classGroups.total} icon={<Users className="size-4 text-indigo-500" />} />
        <StatCard title="Turmas Ativas" value={activeClassGroupCount} icon={<Users className="size-4 text-emerald-500" />} />
        <StatCard title="Total de Alunos" value={distinctActiveStudentCount} icon={<GraduationCap className="size-4 text-blue-500" />} />
        <StatCard title="Ocupação Média" value={`${avgOccupancyPercent}%`} icon={<BarChart3 className="size-4 text-amber-500" />} />
      </ExecutiveKpiGrid>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">Turmas</CardTitle>
        </CardHeader>
        <CardContent>
          {data.length === 0 ? (
            <EmptyState icon={<Users className="size-8" />} title="Sem turmas atribuídas" />
          ) : (
            <div className="space-y-2">
              <div className="rounded-md border overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr className="text-left text-xs text-muted-foreground">
                      <th className="px-3 py-2">Turma</th>
                      <th className="px-3 py-2">Curso</th>
                      <th className="px-3 py-2">Nível</th>
                      <th className="px-3 py-2">Alunos</th>
                      <th className="px-3 py-2">Ocupação</th>
                      <th className="px-3 py-2">Estado</th>
                      <th className="px-3 py-2">Início</th>
                      <th className="px-3 py-2">Fim</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {data.map((g) => (
                      <tr key={g.id}>
                        <td className="px-3 py-2 font-medium">
                          <Link href={`/class-groups/${g.id}`} className="hover:underline">
                            {g.name}
                          </Link>
                        </td>
                        <td className="px-3 py-2">{g.courseName ?? "—"}</td>
                        <td className="px-3 py-2">{g.courseLevelName ?? "—"}</td>
                        <td className="px-3 py-2 tabular-nums">{g.currentCount}/{g.capacity}</td>
                        <td className="px-3 py-2 tabular-nums">
                          {g.capacity > 0 ? Math.round((g.currentCount / g.capacity) * 100) : 0}%
                        </td>
                        <td className="px-3 py-2"><StatusBadge status={g.status} /></td>
                        <td className="px-3 py-2">{g.startDate ? new Date(g.startDate).toLocaleDateString("pt-PT") : "—"}</td>
                        <td className="px-3 py-2">{g.endDate ? new Date(g.endDate).toLocaleDateString("pt-PT") : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {classGroups.totalPages > 1 && (
                <div className="flex items-center justify-between text-xs text-muted-foreground px-1">
                  <span>Página {classGroups.page} de {classGroups.totalPages}</span>
                  <div className="flex items-center gap-1">
                    {classGroups.hasPreviousPage ? (
                      <Button asChild variant="outline" size="icon" className="size-7">
                        <Link href={`?tab=classGroups&page=${classGroups.page - 1}`}>
                          <ChevronLeft className="size-3.5" />
                        </Link>
                      </Button>
                    ) : (
                      <Button variant="outline" size="icon" className="size-7" disabled>
                        <ChevronLeft className="size-3.5" />
                      </Button>
                    )}
                    {classGroups.hasNextPage ? (
                      <Button asChild variant="outline" size="icon" className="size-7">
                        <Link href={`?tab=classGroups&page=${classGroups.page + 1}`}>
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
