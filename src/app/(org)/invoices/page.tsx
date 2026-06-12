import { redirect } from "next/navigation";
import Link from "next/link";
import {
  FileText, Plus, Zap, Download, CreditCard,
  AlertTriangle, Clock, CheckCircle2,
  Ban, ReceiptText, TrendingDown, Layers, AlertCircle,
} from "lucide-react";
import { PageHeader } from "@/shared/components/layout/page-header";
import { Button } from "@/shared/components/ui/button";
import { StatCard } from "@/shared/components/layout/stat-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui/card";
import { Badge } from "@/shared/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/shared/components/ui/tabs";
import {
  ExecutiveMainGrid,
  ExecutiveLeftColumn,
  ExecutiveRightColumn,
  ExecutiveKpiGrid,
  DashboardSideCard,
  DashboardInsightRow,
} from "@/shared/components/layout/executive-dashboard";
import { ApexDonutChart, ApexBarChart, ApexLineChart } from "@/shared/components/charts";
import { InvoiceActionFilterBar } from "@/modules/finance/components/invoice-action-filter-bar";
import { InvoiceTableFilters } from "@/modules/finance/components/invoice-table-filters";
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
import type { AuthContext } from "@/server/auth/context";

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

  const maxCourseAmount = courseDistribution[0]?.totalAmount ?? 1;

  const watchlistPreview = watchlist.slice(0, 5);

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

      {/* Single-row sticky quick-access chips */}
      <InvoiceActionFilterBar
        overdueCount={kpis.overdueCount}
        dueSoonCount={kpis.dueSoonCount}
        partiallyPaidCount={kpis.partiallyPaidCount}
        noPaymentCount={kpis.noPaymentCount}
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
                    <div className="flex items-center gap-2">
                      {watchlist.length > 5 && (
                        <Link
                          href="/invoices?status=OVERDUE"
                          className="text-xs text-muted-foreground hover:underline"
                        >
                          Ver todos ({watchlist.length})
                        </Link>
                      )}
                      <Badge variant="secondary" className="text-xs">{watchlist.length}</Badge>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="p-0 pb-2">
                  <InvoiceWatchlist items={watchlistPreview} canCreate={canRegisterPayment} />
                </CardContent>
              </Card>
            )}

            {/* Table card with inline filters */}
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-medium">Faturas</CardTitle>
                  <Badge variant="secondary" className="text-xs">{result.total}</Badge>
                </div>
                <InvoiceTableFilters
                  branches={filterOptions.branches}
                  courses={filterOptions.courses}
                  academicYears={filterOptions.academicYears}
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
                />
              </CardHeader>
              <CardContent className="p-0 sm:px-4 sm:pb-4">
                <InvoicesTable
                  result={result}
                  canCancel={canCancel}
                  canCreate={canRegisterPayment}
                />
              </CardContent>
            </Card>
          </ExecutiveLeftColumn>

          {/* RIGHT: Insights + Tabbed charts */}
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

            {/* All charts in one tabbed card */}
            <Card>
              <Tabs defaultValue="status">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Análise</CardTitle>
                  <TabsList className="w-full mt-2 grid grid-cols-4 h-8">
                    <TabsTrigger value="status" className="text-xs">Estado</TabsTrigger>
                    <TabsTrigger value="aging" className="text-xs">Aging</TabsTrigger>
                    <TabsTrigger value="courses" className="text-xs">Cursos</TabsTrigger>
                    <TabsTrigger value="balances" className="text-xs">Saldos</TabsTrigger>
                  </TabsList>
                </CardHeader>
                <CardContent className="pt-0">
                  <TabsContent value="status" className="mt-0">
                    {statusItems.length > 0 ? (
                      <ApexDonutChart data={statusDonut} height={200} />
                    ) : (
                      <p className="text-sm text-muted-foreground py-4 text-center">Sem faturas.</p>
                    )}
                  </TabsContent>

                  <TabsContent value="aging" className="mt-0">
                    {agingBuckets.some((b) => b.count > 0) ? (
                      <ApexBarChart data={agingBar} height={180} />
                    ) : (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
                        <CheckCircle2 className="size-4 text-green-500 shrink-0" />
                        Nenhuma fatura em atraso.
                      </div>
                    )}
                  </TabsContent>

                  <TabsContent value="courses" className="mt-0">
                    {courseDistribution.length > 0 ? (
                      <div className="space-y-3 pt-1">
                        {courseDistribution.slice(0, 8).map((c) => {
                          const pct = maxCourseAmount > 0 ? Math.round((c.totalAmount / maxCourseAmount) * 100) : 0;
                          return (
                            <div key={c.courseId ?? c.courseName} className="space-y-1">
                              <div className="flex items-center justify-between text-xs">
                                {c.courseId ? (
                                  <Link href={`/invoices?courseId=${c.courseId}`} className="truncate hover:underline">
                                    {c.courseName}
                                  </Link>
                                ) : (
                                  <span className="truncate text-muted-foreground">{c.courseName}</span>
                                )}
                                <span className="font-medium tabular-nums shrink-0 ml-2">
                                  {c.totalAmount.toLocaleString("pt-PT", { minimumFractionDigits: 2 })} MT
                                </span>
                              </div>
                              <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                                <div
                                  className="h-full rounded-full bg-indigo-500"
                                  style={{ width: `${pct}%` }}
                                />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground py-4 text-center">Sem dados de cursos.</p>
                    )}
                  </TabsContent>

                  <TabsContent value="balances" className="mt-0">
                    {topOutstandingBalances.length > 0 ? (
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
                    ) : (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
                        <CheckCircle2 className="size-4 text-green-500 shrink-0" />
                        Sem saldos em aberto.
                      </div>
                    )}
                  </TabsContent>
                </CardContent>
              </Tabs>
            </Card>

          </ExecutiveRightColumn>
        </ExecutiveMainGrid>
      </div>
    </>
  );
}
