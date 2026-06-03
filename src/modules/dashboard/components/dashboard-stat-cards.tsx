import { StatCard } from "@/shared/components/layout/stat-card";
import {
  Users,
  UserCheck,
  GraduationCap,
  BookOpen,
  TrendingUp,
  Clock,
  CalendarDays,
  Car,
} from "lucide-react";
import type { DashboardStats } from "@/modules/dashboard/types";

function formatCurrency(value: number, symbol: string) {
  return `${symbol} ${value.toLocaleString("pt-PT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

interface DashboardStatCardsProps {
  stats: DashboardStats;
  currencySymbol: string;
}

export function DashboardStatCards({ stats, currencySymbol }: DashboardStatCardsProps) {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
      <StatCard
        title="Total de Alunos"
        value={stats.totalStudents}
        icon={<Users className="size-4" />}
      />
      <StatCard
        title="Alunos Ativos"
        value={stats.activeStudents}
        icon={<UserCheck className="size-4" />}
      />
      <StatCard
        title="Professores Ativos"
        value={stats.activeTeachers}
        icon={<GraduationCap className="size-4" />}
      />
      <StatCard
        title="Matrículas Ativas"
        value={stats.activeEnrollments}
        icon={<BookOpen className="size-4" />}
      />
      <StatCard
        title="Receita Mensal"
        value={formatCurrency(stats.monthlyRevenue, currencySymbol)}
        icon={<TrendingUp className="size-4" />}
      />
      <StatCard
        title="Pagamentos Pendentes"
        value={stats.pendingPaymentsCount}
        description="faturas por liquidar"
        icon={<Clock className="size-4" />}
      />
      <StatCard
        title="Turmas Hoje"
        value={stats.classesToday}
        icon={<CalendarDays className="size-4" />}
      />
      <StatCard
        title="Aulas Práticas Hoje"
        value={stats.practicalLessonsToday}
        icon={<Car className="size-4" />}
      />
    </div>
  );
}
