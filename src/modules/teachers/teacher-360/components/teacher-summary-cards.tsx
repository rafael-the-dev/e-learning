import { StatCard } from "@/shared/components/layout/stat-card";
import { ExecutiveKpiGrid } from "@/shared/components/layout/executive-dashboard";
import {
  Users,
  BookOpen,
  GraduationCap,
  Clock,
  ClipboardList,
  CheckCircle2,
  TrendingUp,
  Activity,
} from "lucide-react";
import type { TeacherSummaryCards as TeacherSummaryCardsData } from "@/modules/teachers/teacher-360/types";

export function TeacherSummaryCards({ summary }: { summary: TeacherSummaryCardsData }) {
  return (
    <ExecutiveKpiGrid>
      <StatCard
        title="Turmas Ativas"
        value={summary.activeClassGroupCount}
        icon={<Users className="size-4 text-indigo-500" />}
      />
      <StatCard
        title="Disciplinas"
        value={summary.subjectCount}
        icon={<BookOpen className="size-4 text-violet-500" />}
      />
      <StatCard
        title="Alunos"
        value={summary.studentCount}
        icon={<GraduationCap className="size-4 text-blue-500" />}
      />
      <StatCard
        title="Horas Semanais"
        value={`${summary.weeklyHours}h`}
        icon={<Clock className="size-4 text-cyan-500" />}
      />
      <StatCard
        title="Avaliações Pendentes"
        value={summary.pendingAssessmentCount}
        icon={<ClipboardList className="size-4 text-amber-500" />}
      />
      <StatCard
        title="Avaliações Concluídas"
        value={summary.completedAssessmentCount}
        icon={<CheckCircle2 className="size-4 text-emerald-500" />}
      />
      <StatCard
        title="Taxa de Aprovação"
        value={summary.passRate != null ? `${summary.passRate}%` : "—"}
        icon={<TrendingUp className="size-4 text-green-500" />}
      />
      <StatCard
        title="Presença Média"
        value={summary.avgStudentAttendance != null ? `${summary.avgStudentAttendance.toFixed(1)}%` : "—"}
        icon={<Activity className="size-4 text-rose-500" />}
      />
    </ExecutiveKpiGrid>
  );
}
