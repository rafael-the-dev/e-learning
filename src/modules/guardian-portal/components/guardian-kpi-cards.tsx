import { StatCard } from "@/shared/components/layout/stat-card";
import {
  CalendarCheck,
  GraduationCap,
  CheckCircle2,
  CircleDashed,
  ClipboardList,
  CalendarX,
  FileText,
  Wallet,
  Bell,
} from "lucide-react";
import { formatCurrency } from "@/shared/lib/utils";
import type { GuardianPortalKpis } from "@/modules/guardian-portal/types";

interface Props {
  kpis: GuardianPortalKpis;
}

/**
 * Renders ONLY the KPI cards the per-link permissions allow. A null metric is a
 * forbidden one and is never shown — the grid simply omits that card.
 */
export function GuardianKpiCards({ kpis }: Props) {
  const cards: React.ReactNode[] = [];

  // Academic
  if (kpis.overallAverage !== null) {
    cards.push(
      <StatCard
        key="avg"
        title="Média Geral"
        value={`${kpis.overallAverage}%`}
        icon={<GraduationCap className="size-4 text-violet-500" />}
      />
    );
  }
  if (kpis.approvedSubjects !== null) {
    cards.push(
      <StatCard
        key="approved"
        title="Disciplinas Aprovadas"
        value={kpis.approvedSubjects}
        icon={<CheckCircle2 className="size-4 text-emerald-500" />}
      />
    );
  }
  if (kpis.pendingSubjects !== null) {
    cards.push(
      <StatCard
        key="pending-subjects"
        title="Disciplinas Pendentes"
        value={kpis.pendingSubjects}
        icon={<CircleDashed className="size-4 text-amber-500" />}
      />
    );
  }
  if (kpis.upcomingAssessments !== null) {
    cards.push(
      <StatCard
        key="upcoming"
        title="Próximas Avaliações"
        value={kpis.upcomingAssessments}
        icon={<ClipboardList className="size-4 text-cyan-500" />}
      />
    );
  }

  // Attendance
  if (kpis.averageAttendance !== null) {
    cards.push(
      <StatCard
        key="attendance"
        title="Frequência Média"
        value={`${kpis.averageAttendance}%`}
        icon={<CalendarCheck className="size-4 text-blue-500" />}
      />
    );
  }
  if (kpis.absences !== null) {
    cards.push(
      <StatCard
        key="absences"
        title="Faltas"
        value={kpis.absences}
        icon={<CalendarX className="size-4 text-rose-500" />}
      />
    );
  }

  // Finance
  if (kpis.pendingInvoices !== null) {
    cards.push(
      <StatCard
        key="invoices"
        title="Facturas Pendentes"
        value={kpis.pendingInvoices}
        icon={<FileText className="size-4 text-orange-500" />}
      />
    );
  }
  if (kpis.outstandingBalance !== null) {
    cards.push(
      <StatCard
        key="balance"
        title="Saldo em Dívida"
        value={formatCurrency(kpis.outstandingBalance)}
        icon={<Wallet className="size-4 text-red-500" />}
      />
    );
  }

  // Notifications
  if (kpis.unreadNotifications !== null) {
    cards.push(
      <StatCard
        key="notifications"
        title="Notificações Não Lidas"
        value={kpis.unreadNotifications}
        icon={<Bell className="size-4 text-slate-500" />}
      />
    );
  }

  if (cards.length === 0) return null;

  return <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">{cards}</div>;
}
