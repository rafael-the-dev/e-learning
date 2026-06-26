import { Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui/card";
import { ExecutiveKpiGrid } from "@/shared/components/layout/executive-dashboard";
import { StatCard } from "@/shared/components/layout/stat-card";
import { EmptyState } from "@/shared/components/layout/empty-state";
import { ApexLineChart } from "@/shared/components/charts/apex-line-chart";
import { ApexBarChart } from "@/shared/components/charts/apex-bar-chart";
import { TrendingUp, Activity, BarChart3 } from "lucide-react";
import type {
  SubjectPassRateRow,
  GradeMonthPoint,
} from "@/modules/teachers/teacher-360/repositories/teacher-360.repository";

interface TeacherPerformanceTabProps {
  subjectPassRates: SubjectPassRateRow[];
  gradeTrend: GradeMonthPoint[];
  organizationAveragePassRate: number | null;
  teacherPassRate: number | null;
  avgStudentAttendance: number | null;
}

export function TeacherPerformanceTab({
  subjectPassRates,
  gradeTrend,
  organizationAveragePassRate,
  teacherPassRate,
  avgStudentAttendance,
}: TeacherPerformanceTabProps) {
  return (
    <div className="space-y-6">
      <ExecutiveKpiGrid>
        <StatCard
          title="Taxa de Aprovação"
          value={teacherPassRate != null ? `${teacherPassRate}%` : "—"}
          icon={<TrendingUp className="size-4 text-emerald-500" />}
        />
        <StatCard
          title="Presença Média dos Alunos"
          value={avgStudentAttendance != null ? `${avgStudentAttendance.toFixed(1)}%` : "—"}
          icon={<Activity className="size-4 text-cyan-500" />}
        />
        <StatCard
          title="Média da Organização"
          value={organizationAveragePassRate != null ? `${organizationAveragePassRate}%` : "—"}
          icon={<BarChart3 className="size-4 text-amber-500" />}
        />
      </ExecutiveKpiGrid>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">Média das Notas por Mês</CardTitle>
        </CardHeader>
        <CardContent>
          <ApexLineChart
            data={{
              categories: gradeTrend.map((m) => m.month),
              series: [{ name: "Média", data: gradeTrend.map((m) => m.avgGrade ?? 0) }],
            }}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">Taxa de Aprovação por Disciplina</CardTitle>
        </CardHeader>
        <CardContent>
          {subjectPassRates.length === 0 ? (
            <EmptyState icon={<BarChart3 className="size-8" />} title="Sem dados de avaliação ainda" />
          ) : (
            <ApexBarChart
              data={{
                categories: subjectPassRates.map((s) => s.subjectName),
                series: [{ name: "Taxa de Aprovação (%)", data: subjectPassRates.map((s) => s.passRate ?? 0) }],
              }}
            />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">Professor vs. Média da Organização</CardTitle>
        </CardHeader>
        <CardContent>
          <ApexBarChart
            data={{
              categories: ["Taxa de Aprovação"],
              series: [
                { name: "Professor", data: [teacherPassRate ?? 0] },
                { name: "Organização", data: [organizationAveragePassRate ?? 0] },
              ],
            }}
          />
        </CardContent>
      </Card>
    </div>
  );
}
