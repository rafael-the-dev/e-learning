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
  QuickActionTile,
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

  const [kpis, watchlist, statusDistribution, courseDistribution, monthlyTrend, agingBuckets, result, filterOptions] =
    await Promise.all([
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

  const AGING_COLORS = ["#fde047", "#f97316", "#ef4444", "#b91c1c"];
  const agingBar = {
    categories: agingBuckets.map((b) => b.label),
    series: [{ name: "Faturas", data: agingBuckets.map((b) => b.count) }],
    colors: [AGING_COLORS[0]],
  };

  const trendLine = {
    categories: monthlyTrend.map((m) => formatMonthKey(m.month)),
    series: [{ name: "Facturado (MT)", data: monthlyTrend.map((m) => m.totalAmount) }],
    colors: ["#6366f1"],
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
          <StatCard title="Facturado Hoje" value={kpis.invoicedToday.toLocaleString("pt-PT", { minimumFractionDigits: 2 })} description="Emitido hoje (excl. canceladas)" icon={<ReceiptText className="size-4" />} />
          <StatCard title="Facturado Este Mês" value={kpis.invoicedThisMonth.toLocaleString("pt-PT", { minimumFractionDigits: 2 })} description="Emitido este mês" icon={<FileText className="size-4" />} />
          <StatCard title="Pago Este Mês" value={kpis.paidThisMonth.toLocaleString("pt-PT", { minimumFractionDigits: 2 })} description="Faturas liquidadas este mês" icon={<CheckCircle2 className="size-4" />} />
          <StatCard title="Valor Pendente" value={kpis.pendingAmount.toLocaleString("pt-PT", { minimumFractionDigits: 2 })} description={`${kpis.pendingCount} fatura${kpis.pendingCount !== 1 ? "s" : ""} por cobrar`} icon={<Clock className="size-4" />} />
          <StatCard title="Valor em Atraso" value={kpis.overdueAmount.toLocaleString("pt-PT", { minimumFractionDigits: 2 })} description={`${kpis.overdueCount} fatura${kpis.overdueCount !== 1 ? "s" : ""} vencida${kpis.overdueCount !== 1 ? "s" : ""}`} icon={<AlertTriangle className="size-4" />} />
          <StatCard title="Parc. Pagas" value={kpis.partiallyPaidCount} description="Com pagamento parcial" icon={<Layers className="size-4" />} />
          <StatCard title="Sem Pagamento" value={kpis.noPaymentCount} description="Sem nenhum pagamento" icon={<TrendingDown className="size-4" />} />
          <StatCard title="Canceladas" value={kpis.cancelledCount} description="Faturas canceladas" icon={<Ban className="size-4" />} />
        </ExecutiveKpiGrid>

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
              <div className="space-y-2">
                {canCreate && (
                  <QuickActionTile href="/invoices/new" icon={<Plus className="size-4" />} label="Nova Fatura" description="Criar fatura manualmente" variant="success" />
                )}
                {canRegisterPayment && (
                  <QuickActionTile href="/payments/new" icon={<CreditCard className="size-4" />} label="Registar Pagamento" description="Associar pagamento a fatura" />
                )}
                <QuickActionTile href="/invoices?status=OVERDUE" icon={<AlertTriangle className="size-4" />} label="Ver Vencidas" description={`${kpis.overdueCount} fatura${kpis.overdueCount !== 1 ? "s" : ""} em atraso`} variant={kpis.overdueCount > 0 ? "destructive" : "default"} />
                <QuickActionTile href="/invoices?agingBucket=due-soon" icon={<Clock className="size-4" />} label="A Vencer (3 dias)" description={`${kpis.dueSoonCount} fatura${kpis.dueSoonCount !== 1 ? "s" : ""}`} variant={kpis.dueSoonCount > 0 ? "warning" : "default"} />
                <QuickActionTile href="/invoices?status=PARTIALLY_PAID" icon={<Layers className="size-4" />} label="Parc. Pagas" description={`${kpis.partiallyPaidCount} com saldo em aberto`} variant={kpis.partiallyPaidCount > 0 ? "warning" : "default"} />
                <QuickActionTile href="/invoices?paymentStatus=NO_PAYMENT" icon={<XCircle className="size-4" />} label="Sem Pagamento" description={`${kpis.noPaymentCount} sem pagamento`} />
              </div>
            </DashboardSideCard>

            <DashboardSideCard title="Distribuição por Estado">
              <ApexDonutChart data={statusDonut} height={220} />
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

            {monthlyTrend.length > 0 && (
              <DashboardSideCard title="Facturado por Mês" badge={<span className="text-xs text-muted-foreground">6 meses</span>}>
                <ApexLineChart data={trendLine} height={180} currency />
              </DashboardSideCard>
            )}

          </ExecutiveRightColumn>
        </ExecutiveMainGrid>
      </div>
    </>
  );
}
