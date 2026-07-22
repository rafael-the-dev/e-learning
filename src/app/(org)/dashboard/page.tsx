import { PageHeader } from "@/shared/components/layout/page-header";
import { StatCard } from "@/shared/components/layout/stat-card";
import { Card, CardHeader, CardTitle, CardContent } from "@/shared/components/ui/card";
import { Badge } from "@/shared/components/ui/badge";
import {
  ExecutiveMainGrid,
  ExecutiveLeftColumn,
  ExecutiveRightColumn,
  ExecutiveKpiGrid,
  DashboardSideCard,
  DashboardInsightRow,
} from "@/shared/components/layout/executive-dashboard";
import { requireRoleOrRedirect } from "@/server/auth/context";
import { SYSTEM_ROLES } from "@/server/auth/permissions";
import { PERMISSIONS } from "@/server/auth/permissions";
import { getExecutiveDashboardData } from "@/modules/dashboard/services/dashboard.service";
import { riskMetricNumberDisplay } from "@/shared/lib/risk-metric-display";
import { OrganizationHealthCard } from "@/modules/dashboard/components/organization-health-card";
import { DashboardQuickActions } from "@/modules/dashboard/components/dashboard-quick-actions";
import { ExecutiveTrendCard } from "@/modules/dashboard/components/executive-trend-card";
import { DashboardAcademicWatchlist } from "@/modules/dashboard/components/dashboard-academic-watchlist";
import { DashboardFinancialWatchlist } from "@/modules/dashboard/components/dashboard-financial-watchlist";
import { DashboardActivityFeed } from "@/modules/dashboard/components/dashboard-activity-feed";
import { DashboardUpcomingDeadlines } from "@/modules/dashboard/components/dashboard-upcoming-deadlines";
import { DashboardQuickStats } from "@/modules/dashboard/components/dashboard-quick-stats";
import {
  Users, GraduationCap, ClipboardList, AlertTriangle, Banknote, Wallet, FileWarning, CreditCard,
  Bell, CalendarClock, Activity, ShieldAlert, TrendingUp,
} from "lucide-react";

export const metadata = { title: "Dashboard" };

function formatCurrency(value: number, symbol: string) {
  return `${symbol} ${value.toLocaleString("pt-PT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default async function DashboardPage() {
  const context = await requireRoleOrRedirect(SYSTEM_ROLES.ORG_ADMIN);

  const data = await getExecutiveDashboardData(context.organizationId);
  const { health, kpis, quickStats, trend, academicWatchlist, financialWatchlist, activityFeed, alerts, deadlines } = data;

  const insightSeverity = (severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW"): "critical" | "warning" | "info" => {
    if (severity === "CRITICAL") return "critical";
    if (severity === "HIGH" || severity === "MEDIUM") return "warning";
    return "info";
  };

  return (
    <>
      <PageHeader
        title="Dashboard"
        description="Centro de comando da organização — saúde, riscos e desempenho em tempo real."
      />

      <div className="p-4 sm:p-8 space-y-6">
        <OrganizationHealthCard health={health} />

        <DashboardQuickActions
          canCreateEnrollments={context.ability.can(PERMISSIONS.ENROLLMENTS_CREATE)}
          canCreateStudents={context.ability.can(PERMISSIONS.STUDENTS_CREATE)}
          canCreatePayments={context.ability.can(PERMISSIONS.PAYMENTS_CREATE)}
          canCreateInvoices={context.ability.can(PERMISSIONS.INVOICES_CREATE)}
          canCreateClassGroups={context.ability.can(PERMISSIONS.CLASS_GROUPS_CREATE)}
          canCreateAssessments={context.ability.can(PERMISSIONS.ASSESSMENTS_CREATE)}
        />

        <ExecutiveKpiGrid>
          <StatCard title="Alunos Ativos" value={kpis.activeStudents} icon={<Users className="size-4 text-blue-500" />} />
          <StatCard title="Turmas Ativas" value={kpis.activeClassGroups} icon={<GraduationCap className="size-4 text-indigo-500" />} />
          <StatCard title="Avaliações Abertas" value={kpis.openAssessments} icon={<ClipboardList className="size-4 text-violet-500" />} />
          <StatCard
            title="Alunos em Risco"
            value={riskMetricNumberDisplay(kpis.studentsAtRisk).value}
            description={riskMetricNumberDisplay(kpis.studentsAtRisk).description}
            icon={<AlertTriangle className="size-4 text-red-500" />}
          />
          <StatCard title="Recebimentos do Mês" value={formatCurrency(kpis.monthlyReceipts, kpis.currencySymbol)} icon={<Banknote className="size-4 text-emerald-500" />} />
          <StatCard title="Saldo em Dívida" value={formatCurrency(kpis.outstandingBalance, kpis.currencySymbol)} icon={<Wallet className="size-4 text-amber-500" />} />
          <StatCard title="Facturas Vencidas" value={kpis.overdueInvoices} icon={<FileWarning className="size-4 text-red-500" />} />
          <StatCard title="Passivo em Carteiras" value={formatCurrency(kpis.walletLiability, kpis.currencySymbol)} icon={<CreditCard className="size-4 text-slate-500" />} />
        </ExecutiveKpiGrid>

        <ExecutiveTrendCard data={trend} />

        <ExecutiveMainGrid>
          <ExecutiveLeftColumn>
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <ShieldAlert className="size-4 text-muted-foreground" />
                    <CardTitle className="text-sm font-medium">Vigilância Académica</CardTitle>
                  </div>
                  <Badge variant="secondary" className="text-xs">{academicWatchlist.length}</Badge>
                </div>
              </CardHeader>
              <CardContent>
                <DashboardAcademicWatchlist items={academicWatchlist} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Banknote className="size-4 text-muted-foreground" />
                    <CardTitle className="text-sm font-medium">Vigilância Financeira</CardTitle>
                  </div>
                  <Badge variant="secondary" className="text-xs">{financialWatchlist.length}</Badge>
                </div>
              </CardHeader>
              <CardContent>
                <DashboardFinancialWatchlist items={financialWatchlist} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                  <Activity className="size-4 text-muted-foreground" />
                  <CardTitle className="text-sm font-medium">Atividade Recente</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <DashboardActivityFeed items={activityFeed} />
              </CardContent>
            </Card>
          </ExecutiveLeftColumn>

          <ExecutiveRightColumn>
            {alerts.length > 0 && (
              <DashboardSideCard
                title="Alertas"
                icon={<Bell className="size-4" />}
                badge={<span className="text-xs text-muted-foreground">{alerts.length}</span>}
              >
                <div className="space-y-2">
                  {alerts.map((a) => (
                    <DashboardInsightRow
                      key={a.id}
                      insight={{
                        id: a.id,
                        message: a.message,
                        severity: insightSeverity(a.severity),
                        linkHref: a.link,
                        linkLabel: a.link ? "Ver" : undefined,
                      }}
                    />
                  ))}
                </div>
              </DashboardSideCard>
            )}

            <DashboardSideCard title="Próximos Prazos" icon={<CalendarClock className="size-4" />}>
              <DashboardUpcomingDeadlines items={deadlines} />
            </DashboardSideCard>

            <DashboardSideCard title="Indicadores Rápidos" icon={<TrendingUp className="size-4" />}>
              <DashboardQuickStats stats={quickStats} />
            </DashboardSideCard>
          </ExecutiveRightColumn>
        </ExecutiveMainGrid>
      </div>
    </>
  );
}
