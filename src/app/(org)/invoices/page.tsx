import { redirect } from "next/navigation";
import Link from "next/link";
import {
  FileText, Plus, Zap, Download, CreditCard,
  AlertTriangle, Clock, CheckCircle2, XCircle,
  Ban, ReceiptText, TrendingDown, Layers, AlertCircle,
} from "lucide-react";
import { PageHeader } from "@/shared/components/layout/page-header";
import { Button } from "@/shared/components/ui/button";
import { StatCard } from "@/shared/components/layout/stat-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui/card";
import { Badge } from "@/shared/components/ui/badge";
import {
  ExecutiveMainGrid,
  ExecutiveLeftColumn,
  ExecutiveRightColumn,
  ExecutiveKpiGrid,
  DashboardSideCard,
  DashboardInsightRow,
} from "@/shared/components/layout/executive-dashboard";
import { ApexDonutChart, ApexBarChart, ApexLineChart } from "@/shared/components/charts";
import { requirePermission } from "@/server/auth/context";
import { getUserPermissions, createAbility } from "@/server/auth/rbac";
import { PERMISSIONS } from "@/server/auth/permissions";
import { getDb } from "@/server/db";
import { getInvoicesByOrganization } from "@/modules/finance/services/invoice.service";
import {
  getInvoiceKPIs,
  getInvoiceStatusStats,
  getInvoiceCourseStats,
  getInvoiceTrend,
  getInvoiceAging,
  getInvoiceTopOutstandingBalances,
} from "@/modules/finance/services/invoice-metrics.service";
import { generateInvoiceInsights } from "@/modules/finance/services/invoice-insights.service";
import { getInvoiceWatchlist } from "@/modules/finance/services/invoice-watchlist.service";
import { InvoicesTable } from "@/modules/finance/components/invoices-table";
import { InvoiceWatchlist } from "@/modules/finance/components/invoice-watchlist";
import { normalizePaginationParams } from "@/shared/lib/pagination";
import { INVOICE_STATUS_LABELS } from "@/modules/finance/types";
import { cn } from "@/shared/lib/utils";
import type { AuthContext } from "@/server/auth/context";
import type { ReactNode } from "react";

export const metadata = { title: "Faturas" };

const MONTH_LABELS = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
function formatMonthKey(key: string) {
  const [year, month] = key.split("-");
  return `${MONTH_LABELS[parseInt(month) - 1]} ${year?.slice(2)}`;
}

async function getInvoiceFilterOptions(organizationId: string) {
  const db = await getDb();
  const [branches, courses, academicYears] = await Promise.all([
    db.branch.findMany({ where: { organizationId, deletedAt: null }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    db.course.findMany({ where: { organizationId, deletedAt: null }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    db.academicYear.findMany({ where: { organizationId }, select: { id: true, name: true }, orderBy: { startDate: "desc" } }),
  ]);
  return {
    branches: branches.map((b) => ({ value: b.id, label: b.name })),
    courses: courses.map((c) => ({ value: c.id, label: c.name })),
    academicYears: academicYears.map((y) => ({ value: y.id, label: y.name })),
  };
}

function calcTrend(current: number, previous: number) {
  if (previous === 0) return undefined;
  const pct = Math.round(((current - previous) / previous) * 100);
  return {
    value: Math.abs(pct),
    label: "vs. mês anterior",
    direction: pct >= 0 ? ("up" as const) : ("down" as const),
  };
}

function ActionMetricTile({
  href,
  icon,
  label,
  count,
  variant = "default",
}: {
  href: string;
  icon: ReactNode;
  label: string;
  count?: number;
  variant?: "default" | "warning" | "destructive" | "success";
}) {
  const config = {
    default: { bg: "bg-muted/40 hover:bg-muted border-border", icon: "text-muted-foreground", count: "text-foreground" },
    warning: { bg: "bg-amber-50 hover:bg-amber-100 border-amber-100", icon: "text-amber-600", count: "text-amber-700" },
    destructive: { bg: "bg-red-50 hover:bg-red-100 border-red-100", icon: "text-red-600", count: "text-red-700" },
    success: { bg: "bg-green-50 hover:bg-green-100 border-green-100", icon: "text-green-600", count: "text-green-700" },
  }[variant];

  return (
    <Link
      href={href}
      className={cn("rounded-lg border p-3 flex flex-col items-center gap-1.5 transition-colors text-center", config.bg)}
    >
      <div className={cn(config.icon)}>{icon}</div>
      {count !== undefined && (
        <p className={cn("text-xl font-bold tabular-nums leading-none", config.count)}>
          {count.toLocaleString("pt-PT")}
        </p>
      )}
      <p className="text-xs text-muted-foreground leading-tight">{label}</p>
    </Link>
  );
}

export default async function InvoicesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  let context: AuthContext;
  try {
    context = await requirePermission(PERMISSIONS.INVOICES_VIEW);
  } catch {
    redirect("/forbidden");
  }

  const params = await searchParams;
  const pagination = normalizePaginationParams(params.page);

  const perms = await getUserPermissions(context.userId, context.organizationId);
  const ability = createAbility(perms);
  const canCreate = ability.can(PERMISSIONS.INVOICES_CREATE);
  const canCancel = ability.can(PERMISSIONS.INVOICES_CANCEL);
  const canRegisterPayment = ability.can(PERMISSIONS.PAYMENTS_CREATE);

  const [
    kpis,
    watchlist,
    statusDistribution,
    courseDistribution,
    monthlyTrend,
    agingBuckets,
    result,
    filterOptions,
    topOutstandingBalances,
  ] = await Promise.all([
    getInvoiceKPIs(context.organizationId),
    getInvoiceWatchlist(context.organizationId),
    getInvoiceStatusStats(context.organizationId),
    getInvoiceCourseStats(context.organizationId),
    getInvoiceTrend(context.organizationId, 6),
    getInvoiceAging(context.organizationId),
    getInvoicesByOrganization(context.organizationId, {
      ...pagination,
      search: params.search,
      status: params.status,
      branchId: params.branchId,
      courseId: params.courseId,
      academicYearId: params.academicYearId,
      paymentStatus: params.paymentStatus,
      agingBucket: params.agingBucket,
      dateFrom: params.dateFrom,
      dateTo: params.dateTo,
      dueDateFrom: params.dueDateFrom,
      dueDateTo: params.dueDateTo,
    }),
    getInvoiceFilterOptions(context.organizationId),
    getInvoiceTopOutstandingBalances(context.organizationId),
  ]);

  const insights = generateInvoiceInsights(kpis, courseDistribution);

  // Chart DTOs
  const STATUS_COLORS_MAP: Record<string, string> = {
    PENDING: "#94a3b8",
    PARTIALLY_PAID: "#f59e0b",
    PAID: "#22c55e",
    OVERDUE: "#ef4444",
    CANCELLED: "#e2e8f0",
  };
  const statusItems = statusDistribution.filter((d) => d.count > 0);
  const statusDonut = {
    labels: statusItems.map((d) => INVOICE_STATUS_LABELS[d.status] ?? d.status),
    series: statusItems.map((d) => d.count),
    colors: statusItems.map((d) => STATUS_COLORS_MAP[d.status] ?? "#6366f1"),
  };

  const agingBar = {
    categories: agingBuckets.map((b) => b.label),
    series: [{ name: "Faturas", data: agingBuckets.map((b) => b.count) }],
    colors: ["#f97316"],
  };

  const trendLine = {
    categories: monthlyTrend.map((m) => formatMonthKey(m.month)),
    series: [{ name: "Facturado (MT)", data: monthlyTrend.map((m) => m.totalAmount) }],
    colors: ["#6366f1"],
  };

  const coursesRevenueBar = {
    categories: courseDistribution.slice(0, 8).map((c) => c.courseName),
    series: [{ name: "Facturado (MT)", data: courseDistribution.slice(0, 8).map((c) => c.totalAmount) }],
    colors: ["#22c55e"],
  };

  return (
    <>
      <PageHeader
        title="Faturas"
        description="Visão geral da facturação, cobranças pendentes, vencimentos e situação financeira dos alunos."
        actions={
          <div className="flex flex-wrap gap-2">
            {canCreate && (
              <>
                <Button asChild size="sm" variant="outline">
                  <Link href="/invoices/generate">
                    <Zap className="size-4 mr-1.5" />
                    Gerar Fatura
                  </Link>
                </Button>
                <Button asChild size="sm">
                  <Link href="/invoices/new">
                    <Plus className="size-4 mr-1.5" />
                    Nova Fatura
                  </Link>
                </Button>
              </>
            )}
            <Button asChild size="sm" variant="outline">
              <Link href="/payments">
                <CreditCard className="size-4 mr-1.5" />
                Ver Pagamentos
              </Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link href="/invoices/export">
                <Download className="size-4 mr-1.5" />
                Exportar
              </Link>
            </Button>
          </div>
        }
      />

      <div className="p-4 sm:p-8 space-y-6">

        {/* KPI Cards */}
        <ExecutiveKpiGrid>
          <StatCard
            title="Facturado Hoje"
            value={kpis.invoicedToday.toLocaleString("pt-PT", { minimumFractionDigits: 2 })}
            description="Emitido hoje (excl. canceladas)"
            icon={<ReceiptText className="size-4" />}
          />
          <StatCard
            title="Facturado Este Mês"
            value={kpis.invoicedThisMonth.toLocaleString("pt-PT", { minimumFractionDigits: 2 })}
            description="Total emitido este mês"
            icon={<FileText className="size-4" />}
            trend={calcTrend(kpis.invoicedThisMonth, kpis.invoicedLastMonth)}
          />
          <StatCard
            title="Pago Este Mês"
            value={kpis.paidThisMonth.toLocaleString("pt-PT", { minimumFractionDigits: 2 })}
            description="Faturas liquidadas este mês"
            icon={<CheckCircle2 className="size-4" />}
            trend={calcTrend(kpis.paidThisMonth, kpis.paidLastMonth)}
          />
          <StatCard
            title="Valor Pendente"
            value={kpis.pendingAmount.toLocaleString("pt-PT", { minimumFractionDigits: 2 })}
            description={`${kpis.pendingCount} fatura${kpis.pendingCount !== 1 ? "s" : ""} por cobrar`}
            icon={<Clock className="size-4" />}
          />
          <StatCard
            title="Valor em Atraso"
            value={kpis.overdueAmount.toLocaleString("pt-PT", { minimumFractionDigits: 2 })}
            description={`${kpis.overdueCount} fatura${kpis.overdueCount !== 1 ? "s" : ""} vencida${kpis.overdueCount !== 1 ? "s" : ""}`}
            icon={<AlertTriangle className="size-4" />}
          />
          <StatCard
            title="Parc. Pagas"
            value={kpis.partiallyPaidCount}
            description="Com pagamento parcial"
            icon={<Layers className="size-4" />}
          />
          <StatCard
            title="Sem Pagamento"
            value={kpis.noPaymentCount}
            description="Sem nenhum pagamento"
            icon={<TrendingDown className="size-4" />}
          />
          <StatCard
            title="Canceladas"
            value={kpis.cancelledCount}
            description="Faturas canceladas"
            icon={<Ban className="size-4" />}
          />
        </ExecutiveKpiGrid>

        {/* Full-width Revenue Trend */}
        {monthlyTrend.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium">Facturação Mensal</CardTitle>
                <span className="text-xs text-muted-foreground">Últimos 6 meses</span>
              </div>
            </CardHeader>
            <CardContent>
              <ApexLineChart data={trendLine} height={200} currency />
            </CardContent>
          </Card>
        )}

        {/* Two-column main content */}
        <ExecutiveMainGrid>

          {/* LEFT: Watchlist + Table */}
          <ExecutiveLeftColumn>
            {watchlist.length > 0 && (
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm font-medium">Requer Atenção</CardTitle>
                    <Badge variant="secondary" className="text-xs">{watchlist.length}</Badge>
                  </div>
                </CardHeader>
                <CardContent className="p-0 pb-2">
                  <InvoiceWatchlist items={watchlist} canCreate={canRegisterPayment} />
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-medium">Faturas</CardTitle>
                  <Badge variant="secondary" className="text-xs">{result.total}</Badge>
                </div>
              </CardHeader>
              <CardContent className="p-0 sm:px-4 sm:pb-4">
                <InvoicesTable
                  result={result}
                  defaultSearch={params.search}
                  defaultStatus={params.status}
                  defaultBranchId={params.branchId}
                  defaultCourseId={params.courseId}
                  defaultAcademicYearId={params.academicYearId}
                  defaultPaymentStatus={params.paymentStatus}
                  defaultAgingBucket={params.agingBucket}
                  defaultDateFrom={params.dateFrom}
                  defaultDateTo={params.dateTo}
                  defaultDueDateFrom={params.dueDateFrom}
                  defaultDueDateTo={params.dueDateTo}
                  branches={filterOptions.branches}
                  courses={filterOptions.courses}
                  academicYears={filterOptions.academicYears}
                  canCancel={canCancel}
                  canCreate={canRegisterPayment}
                />
              </CardContent>
            </Card>
          </ExecutiveLeftColumn>

          {/* RIGHT: Insights + Quick Actions + Charts */}
          <ExecutiveRightColumn>

            {insights.length > 0 && (
              <DashboardSideCard
                title="Informações e Alertas"
                icon={<AlertCircle className="size-4" />}
                badge={<span className="text-xs text-muted-foreground">{insights.length}</span>}
              >
                <div className="space-y-2">
                  {insights.map((i) => <DashboardInsightRow key={i.id} insight={i} />)}
                </div>
              </DashboardSideCard>
            )}

            <DashboardSideCard title="Ações Rápidas">
              <div className="grid grid-cols-2 gap-2">
                {canCreate && (
                  <ActionMetricTile
                    href="/invoices/new"
                    icon={<Plus className="size-5" />}
                    label="Nova Fatura"
                    variant="success"
                  />
                )}
                {canRegisterPayment && (
                  <ActionMetricTile
                    href="/payments/new"
                    icon={<CreditCard className="size-5" />}
                    label="Registar Pagamento"
                  />
                )}
                <ActionMetricTile
                  href="/invoices?status=OVERDUE"
                  icon={<AlertTriangle className="size-5" />}
                  label="Vencidas"
                  count={kpis.overdueCount}
                  variant={kpis.overdueCount > 0 ? "destructive" : "default"}
                />
                <ActionMetricTile
                  href="/invoices?agingBucket=due-soon"
                  icon={<Clock className="size-5" />}
                  label="A Vencer"
                  count={kpis.dueSoonCount}
                  variant={kpis.dueSoonCount > 0 ? "warning" : "default"}
                />
                <ActionMetricTile
                  href="/invoices?status=PARTIALLY_PAID"
                  icon={<Layers className="size-5" />}
                  label="Parc. Pagas"
                  count={kpis.partiallyPaidCount}
                  variant={kpis.partiallyPaidCount > 0 ? "warning" : "default"}
                />
                <ActionMetricTile
                  href="/invoices?paymentStatus=NO_PAYMENT"
                  icon={<XCircle className="size-5" />}
                  label="Sem Pagamento"
                  count={kpis.noPaymentCount}
                  variant={kpis.noPaymentCount > 0 ? "warning" : "default"}
                />
              </div>
            </DashboardSideCard>

            <DashboardSideCard title="Distribuição por Estado">
              <ApexDonutChart data={statusDonut} height={200} />
            </DashboardSideCard>

            {agingBuckets.some((b) => b.count > 0) ? (
              <DashboardSideCard title="Aging em Atraso">
                <ApexBarChart data={agingBar} height={180} />
              </DashboardSideCard>
            ) : (
              <DashboardSideCard title="Aging em Atraso">
                <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                  <CheckCircle2 className="size-4 text-green-500 shrink-0" />
                  Nenhuma fatura em atraso.
                </div>
              </DashboardSideCard>
            )}

            {courseDistribution.length > 0 && (
              <DashboardSideCard
                title="Cursos por Facturação"
                badge={<span className="text-xs text-muted-foreground">Este mês</span>}
              >
                <ApexBarChart data={coursesRevenueBar} height={220} horizontal currency />
              </DashboardSideCard>
            )}

            {topOutstandingBalances.length > 0 && (
              <DashboardSideCard title="Maiores Saldos em Aberto">
                <div className="divide-y">
                  {topOutstandingBalances.map((item, idx) => (
                    <div key={item.studentId} className="flex items-center justify-between gap-2 py-2 first:pt-0 last:pb-0">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-xs text-muted-foreground tabular-nums w-4 shrink-0">{idx + 1}</span>
                        <div className="min-w-0">
                          <Link
                            href={`/students/${item.studentId}`}
                            className="text-sm font-medium hover:underline truncate block"
                          >
                            {item.studentName}
                          </Link>
                          <p className="text-xs text-muted-foreground">
                            {item.invoiceCount} fatura{item.invoiceCount !== 1 ? "s" : ""} em aberto
                          </p>
                        </div>
                      </div>
                      <span className="text-sm font-semibold tabular-nums text-destructive shrink-0">
                        {item.totalBalance.toLocaleString("pt-PT", { minimumFractionDigits: 2 })} MT
                      </span>
                    </div>
                  ))}
                </div>
              </DashboardSideCard>
            )}

          </ExecutiveRightColumn>
        </ExecutiveMainGrid>
      </div>
    </>
  );
}
