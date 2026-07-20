import { StatCard } from "@/shared/components/layout/stat-card";
import { ExecutiveKpiGrid } from "@/shared/components/layout/executive-dashboard";
import {
  GraduationCap,
  BookOpen,
  Activity,
  ClipboardCheck,
  TrendingUp,
  CircleDollarSign,
  Wallet,
  AlertTriangle,
} from "lucide-react";
import type { StudentSummaryCards as StudentSummaryCardsData } from "@/modules/students/student-360/types";

function formatCurrency(value: number): string {
  return value.toLocaleString("pt-PT", { style: "currency", currency: "MZN" });
}

export function StudentSummaryCards({ summary }: { summary: StudentSummaryCardsData }) {
  return (
    <ExecutiveKpiGrid>
      <StatCard
        title="Matrículas Ativas"
        value={summary.activeEnrollments}
        icon={<GraduationCap className="size-4 text-indigo-500" />}
      />
      <StatCard
        title="Curso Atual"
        value={summary.currentCourseName ?? "—"}
        icon={<BookOpen className="size-4 text-violet-500" />}
      />
      <StatCard
        title="Estado Académico"
        value={summary.academicStatusLabel}
        icon={<ClipboardCheck className="size-4 text-blue-500" />}
      />
      <StatCard
        title="Assiduidade"
        value={summary.attendancePercentage != null ? `${summary.attendancePercentage.toFixed(1)}%` : "—"}
        icon={<Activity className="size-4 text-cyan-500" />}
      />
      <StatCard
        title="Média das Disciplinas"
        value={summary.subjectAverage != null ? summary.subjectAverage.toFixed(1) : "—"}
        icon={<TrendingUp className="size-4 text-emerald-500" />}
      />
      {summary.outstandingBalance != null && (
        <StatCard
          title="Saldo em Dívida"
          value={formatCurrency(summary.outstandingBalance)}
          icon={<CircleDollarSign className="size-4 text-red-500" />}
        />
      )}
      {summary.walletBalance != null && (
        <StatCard
          title="Saldo da Carteira"
          value={formatCurrency(summary.walletBalance)}
          icon={<Wallet className="size-4 text-amber-500" />}
        />
      )}
      <StatCard
        title="Alertas Abertos"
        value={summary.openAlertsCount}
        icon={<AlertTriangle className="size-4 text-orange-500" />}
      />
    </ExecutiveKpiGrid>
  );
}
