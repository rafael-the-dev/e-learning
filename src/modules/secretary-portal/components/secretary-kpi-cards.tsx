import { StatCard } from "@/shared/components/layout/stat-card";
import {
  ClipboardList,
  GraduationCap,
  CreditCard,
  AlertTriangle,
  FileText,
  Bell,
  UsersRound,
  Flame,
} from "lucide-react";
import type { SecretaryPortalKpis } from "@/modules/secretary-portal/types";

interface Props {
  kpis: SecretaryPortalKpis;
}

export function SecretaryKpiCards({ kpis }: Props) {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
      <StatCard
        title="Matrículas Pendentes"
        value={kpis.pendingEnrollments}
        icon={<ClipboardList className="size-4 text-amber-500" />}
      />
      <StatCard
        title="Alunos Activos"
        value={kpis.activeStudents}
        icon={<GraduationCap className="size-4 text-violet-500" />}
      />
      <StatCard
        title="Pagamentos Pendentes"
        value={kpis.pendingPayments}
        icon={<CreditCard className="size-4 text-blue-500" />}
      />
      <StatCard
        title="Facturas Vencidas"
        value={kpis.overdueInvoices}
        icon={<AlertTriangle className="size-4 text-red-500" />}
      />
      <StatCard
        title="Documentos por Rever"
        value={kpis.documentsToReview}
        icon={<FileText className="size-4 text-orange-500" />}
      />
      <StatCard
        title="Notificações Não Lidas"
        value={kpis.unreadNotifications}
        icon={<Bell className="size-4 text-slate-500" />}
      />
      <StatCard
        title="Turmas em Formação"
        value={kpis.formingClassGroups}
        icon={<UsersRound className="size-4 text-indigo-500" />}
      />
      <StatCard
        title="Tarefas Urgentes"
        value={kpis.urgentTasks}
        icon={<Flame className="size-4 text-red-500" />}
      />
    </div>
  );
}
