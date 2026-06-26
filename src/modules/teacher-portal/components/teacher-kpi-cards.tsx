import { StatCard } from "@/shared/components/layout/stat-card";
import {
  CalendarDays,
  UsersRound,
  GraduationCap,
  CheckSquare,
  ClipboardCheck,
  AlertTriangle,
  Bell,
  ShieldAlert,
} from "lucide-react";
import type { TeacherPortalKpis } from "@/modules/teacher-portal/types";

interface Props {
  kpis: TeacherPortalKpis;
}

export function TeacherKpiCards({ kpis }: Props) {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
      <StatCard title="Aulas Hoje" value={kpis.classesToday} icon={<CalendarDays className="size-4 text-blue-500" />} />
      <StatCard title="Turmas Ativas" value={kpis.activeClassGroupCount} icon={<UsersRound className="size-4 text-indigo-500" />} />
      <StatCard title="Alunos" value={kpis.studentCount} icon={<GraduationCap className="size-4 text-violet-500" />} />
      <StatCard title="Presenças Pendentes" value={kpis.attendancePendingCount} icon={<CheckSquare className="size-4 text-amber-500" />} />
      <StatCard title="Avaliações por Corrigir" value={kpis.assessmentsToGradeCount} icon={<ClipboardCheck className="size-4 text-cyan-500" />} />
      <StatCard title="Avaliações em Atraso" value={kpis.overdueAssessmentCount} icon={<AlertTriangle className="size-4 text-red-500" />} />
      <StatCard title="Notificações Não Lidas" value={kpis.unreadNotificationCount} icon={<Bell className="size-4 text-slate-500" />} />
      <StatCard title="Alunos em Risco" value={kpis.studentsAtRiskCount} icon={<ShieldAlert className="size-4 text-red-500" />} />
    </div>
  );
}
