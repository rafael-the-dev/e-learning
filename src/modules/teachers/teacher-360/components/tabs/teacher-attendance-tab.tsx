import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui/card";
import { ExecutiveKpiGrid } from "@/shared/components/layout/executive-dashboard";
import { StatCard } from "@/shared/components/layout/stat-card";
import { EmptyState } from "@/shared/components/layout/empty-state";
import { Button } from "@/shared/components/ui/button";
import { ApexLineChart } from "@/shared/components/charts/apex-line-chart";
import { ClipboardList, Users, UserX, Activity, ChevronLeft, ChevronRight } from "lucide-react";
import type {
  TeacherAttendanceKPIs,
  TeacherAttendanceMonthPoint,
  TeacherAttendanceSessionRow,
} from "@/modules/teachers/teacher-360/repositories/teacher-360.repository";

interface TeacherAttendanceTabProps {
  kpis: TeacherAttendanceKPIs;
  monthlyTrend: TeacherAttendanceMonthPoint[];
  sessions: { data: TeacherAttendanceSessionRow[]; total: number };
  page: number;
  pageSize: number;
}

export function TeacherAttendanceTab({ kpis, monthlyTrend, sessions, page, pageSize }: TeacherAttendanceTabProps) {
  const totalPages = Math.max(1, Math.ceil(sessions.total / pageSize));

  return (
    <div className="space-y-6">
      <ExecutiveKpiGrid>
        <StatCard title="Sessões" value={kpis.sessionCount} icon={<ClipboardList className="size-4 text-indigo-500" />} />
        <StatCard title="Registos" value={kpis.recordCount} icon={<Users className="size-4 text-blue-500" />} />
        <StatCard title="Faltas dos Alunos" value={kpis.absenceCount} icon={<UserX className="size-4 text-red-500" />} />
        <StatCard
          title="Presença Média"
          value={kpis.avgAttendanceRate != null ? `${kpis.avgAttendanceRate}%` : "—"}
          icon={<Activity className="size-4 text-emerald-500" />}
        />
      </ExecutiveKpiGrid>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">Presença por Mês</CardTitle>
        </CardHeader>
        <CardContent>
          <ApexLineChart
            data={{
              categories: monthlyTrend.map((m) => m.month),
              series: [{ name: "Presença (%)", data: monthlyTrend.map((m) => m.attendanceRate ?? 0) }],
            }}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">Sessões Registadas</CardTitle>
        </CardHeader>
        <CardContent>
          {sessions.data.length === 0 ? (
            <EmptyState icon={<ClipboardList className="size-8" />} title="Sem sessões registadas" />
          ) : (
            <div className="space-y-2">
              <div className="rounded-md border overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr className="text-left text-xs text-muted-foreground">
                      <th className="px-3 py-2">Data</th>
                      <th className="px-3 py-2">Turma</th>
                      <th className="px-3 py-2">Disciplina</th>
                      <th className="px-3 py-2">Presentes</th>
                      <th className="px-3 py-2">Ausentes</th>
                      <th className="px-3 py-2">Taxa de Presença</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {sessions.data.map((s) => (
                      <tr key={s.id}>
                        <td className="px-3 py-2">{new Date(s.sessionDate).toLocaleDateString("pt-PT")}</td>
                        <td className="px-3 py-2">{s.classGroupName}</td>
                        <td className="px-3 py-2">{s.subjectName}</td>
                        <td className="px-3 py-2 tabular-nums">{s.presentCount}</td>
                        <td className="px-3 py-2 tabular-nums">{s.absentCount}</td>
                        <td className="px-3 py-2 tabular-nums">
                          {s.attendanceRate != null ? `${s.attendanceRate}%` : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {totalPages > 1 && (
                <div className="flex items-center justify-between text-xs text-muted-foreground px-1">
                  <span>Página {page} de {totalPages}</span>
                  <div className="flex items-center gap-1">
                    {page > 1 ? (
                      <Button asChild variant="outline" size="icon" className="size-7">
                        <Link href={`?tab=attendance&page=${page - 1}`}>
                          <ChevronLeft className="size-3.5" />
                        </Link>
                      </Button>
                    ) : (
                      <Button variant="outline" size="icon" className="size-7" disabled>
                        <ChevronLeft className="size-3.5" />
                      </Button>
                    )}
                    {page < totalPages ? (
                      <Button asChild variant="outline" size="icon" className="size-7">
                        <Link href={`?tab=attendance&page=${page + 1}`}>
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
