import { StatCard } from "@/shared/components/layout/stat-card";
import {
  CalendarCheck,
  GraduationCap,
  CheckCircle2,
  CircleDashed,
  ClipboardList,
  FileText,
  Wallet,
  Bell,
} from "lucide-react";
import { formatCurrency } from "@/shared/lib/utils";
import type { StudentPortalKpis } from "@/modules/student-portal/types";

interface Props {
  kpis: StudentPortalKpis;
}

export function StudentKpiCards({ kpis }: Props) {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
      <StatCard
        title="Frequência Média"
        value={kpis.averageAttendance != null ? `${kpis.averageAttendance}%` : "—"}
        icon={<CalendarCheck className="size-4 text-blue-500" />}
      />
      <StatCard
        title="Média Geral"
        value={kpis.overallAverage != null ? `${kpis.overallAverage}%` : "—"}
        icon={<GraduationCap className="size-4 text-violet-500" />}
      />
      <StatCard
        title="Disciplinas Aprovadas"
        value={kpis.approvedSubjects}
        icon={<CheckCircle2 className="size-4 text-emerald-500" />}
      />
      <StatCard
        title="Disciplinas Pendentes"
        value={kpis.pendingSubjects}
        icon={<CircleDashed className="size-4 text-amber-500" />}
      />
      <StatCard
        title="Próximas Avaliações"
        value={kpis.upcomingAssessments}
        icon={<ClipboardList className="size-4 text-cyan-500" />}
      />
      <StatCard
        title="Facturas Pendentes"
        value={kpis.pendingInvoices}
        icon={<FileText className="size-4 text-orange-500" />}
      />
      <StatCard
        title="Saldo em Dívida"
        value={formatCurrency(kpis.outstandingBalance)}
        icon={<Wallet className="size-4 text-red-500" />}
      />
      <StatCard
        title="Notificações Não Lidas"
        value={kpis.unreadNotifications}
        icon={<Bell className="size-4 text-slate-500" />}
      />
    </div>
  );
}
