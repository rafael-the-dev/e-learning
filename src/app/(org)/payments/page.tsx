import { redirect } from "next/navigation";
import Link from "next/link";
import {
  TrendingUp, Clock, CheckCircle2, XCircle, FileText,
  Wallet, AlertCircle, Plus, CheckCheck, Receipt,
} from "lucide-react";
import { PageHeader } from "@/shared/components/layout/page-header";
import { Button } from "@/shared/components/ui/button";
import { StatCard } from "@/shared/components/layout/stat-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui/card";
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
import { normalizePaginationParams } from "@/shared/lib/pagination";
import { getPaymentsByOrganization } from "@/modules/finance/services/payment.service";
import { getWalletBalancesByStudentIds } from "@/modules/wallets/services/wallet.service";
import {
  getPaymentKPIs,
  getPaymentMethodStats,
  getPaymentStatusStats,
  getPaymentTrend,
} from "@/modules/finance/services/payment-metrics.service";
import { generatePaymentInsights } from "@/modules/finance/services/payment-insights.service";
import { getPaymentWatchlist } from "@/modules/finance/services/payment-watchlist.service";
import { PaymentsTable } from "@/modules/finance/components/payments-table";
import { PaymentWatchlist } from "@/modules/finance/components/payment-watchlist";
import { PAYMENT_STATUS_LABELS, PAYMENT_METHOD_LABELS } from "@/modules/finance/types";
import type { AuthContext } from "@/server/auth/context";

export const metadata = { title: "Pagamentos" };

async function getPaymentFilterOptions(organizationId: string) {
  const db = await getDb();
  return db.branch.findMany({
    where: { organizationId, deletedAt: null },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
}

const MONTH_LABELS = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
function formatMonthKey(key: string) {
  const [year, month] = key.split("-");
  return `${MONTH_LABELS[parseInt(month) - 1]} ${year?.slice(2)}`;
}

const fmt = (n: number) =>
  n.toLocaleString("pt-PT", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default async function PaymentsPage({
  searchParams,
}: {
  searchParams: Promise<{
    page?: string; search?: string; status?: string; method?: string;
    receiptStatus?: string; branchId?: string; dateFrom?: string; dateTo?: string;
  }>;
}) {
  let context: AuthContext;
  try {
    context = await requirePermission(PERMISSIONS.PAYMENTS_VIEW);
  } catch {
    redirect("/forbidden");
  }

  const { page, search, status, method, receiptStatus, branchId, dateFrom, dateTo } = await searchParams;
  const pagination = normalizePaginationParams(page);
  const org = context.organizationId;

  const perms = await getUserPermissions(context.userId, org);
  const ability = createAbility(perms);
  const canCreate = ability.can(PERMISSIONS.PAYMENTS_CREATE);
  const canConfirm = ability.can(PERMISSIONS.PAYMENTS_CONFIRM);
  const canCancel = ability.can(PERMISSIONS.PAYMENTS_CANCEL);
  const canIssueReceipt = ability.can(PERMISSIONS.RECEIPTS_ISSUE);

  const [kpis, watchlist, methodDistribution, statusDistribution, monthlyTrend, result, branches] =
    await Promise.all([
      getPaymentKPIs(org),
      getPaymentWatchlist(org),
      getPaymentMethodStats(org),
      getPaymentStatusStats(org),
      getPaymentTrend(org, 6),
      getPaymentsByOrganization(org, { ...pagination, search, status, method, receiptStatus, branchId, dateFrom, dateTo }),
      getPaymentFilterOptions(org),
    ]);

  const insights = generatePaymentInsights(kpis, methodDistribution);

  const pendingStudentIds = [
    ...new Set(result.data.filter((p) => p.status === "PENDING" && p.studentId != null).map((p) => p.studentId as string)),
  ];
  const walletBalances = await getWalletBalancesByStudentIds(org, pendingStudentIds);

  // Chart DTOs
  const statusItems = statusDistribution.filter((d) => d.count > 0);
  const STATUS_COLORS: Record<string, string> = {
    PENDING: "#f59e0b", CONFIRMED: "#22c55e", CANCELLED: "#ef4444", REFUNDED: "#94a3b8",
  };
  const statusDonut = {
    labels: statusItems.map((d) => PAYMENT_STATUS_LABELS[d.status] ?? d.status),
    series: statusItems.map((d) => d.count),
    colors: statusItems.map((d) => STATUS_COLORS[d.status] ?? "#6366f1"),
  };

  const methodBar = {
    categories: methodDistribution.slice(0, 6).map((d) => PAYMENT_METHOD_LABELS[d.method] ?? d.method),
    series: [{ name: "Valor (MT)", data: methodDistribution.slice(0, 6).map((d) => d.totalAmount) }],
    colors: ["#6366f1"],
  };

  const trendLine = {
    categories: monthlyTrend.map((m) => formatMonthKey(m.month)),
    series: [{ name: "Valor Recebido", data: monthlyTrend.map((m) => m.totalAmount) }],
    colors: ["#22c55e"],
  };

  return (
    <>
      <PageHeader
        title="Pagamentos"
        description="Visão geral dos pagamentos, confirmações, métodos usados, recibos e créditos gerados."
        actions={
          <div className="flex flex-wrap gap-2">
            {canCreate && (
              <Button asChild size="sm">
                <Link href="/payments/new">
                  <Plus className="size-4 mr-1.5" />
                  Registar Pagamento
                </Link>
              </Button>
            )}
            {canConfirm && kpis.pendingCount > 0 && (
              <Button asChild variant="outline" size="sm">
                <Link href="/payments?status=PENDING">
                  <CheckCheck className="size-4 mr-1.5" />
                  Confirmar Pendentes
                  <span className="ml-1 rounded-full bg-amber-100 text-amber-700 text-xs px-1.5 py-0.5 font-medium">
                    {kpis.pendingCount}
                  </span>
                </Link>
              </Button>
            )}
            <Button asChild variant="outline" size="sm">
              <Link href="/receipts">
                <Receipt className="size-4 mr-1.5" />
                Ver Recibos
              </Link>
            </Button>
          </div>
        }
      />

      <div className="p-4 sm:p-8 space-y-6">

        {/* KPI Cards */}
        <ExecutiveKpiGrid>
          <StatCard title="Recebido Hoje" value={fmt(kpis.receivedToday)} description="Confirmados hoje" icon={<TrendingUp className="size-5" />} />
          <StatCard title="Recebido Este Mês" value={fmt(kpis.receivedThisMonth)} description="Total confirmado no mês" icon={<TrendingUp className="size-5" />} />
          <StatCard title="Pendentes" value={kpis.pendingCount} description={`${fmt(kpis.pendingAmount)} MT por confirmar`} icon={<Clock className="size-5" />} />
          <StatCard title="Confirmados" value={kpis.confirmedCount} description={`${fmt(kpis.confirmedAmount)} MT recebidos`} icon={<CheckCircle2 className="size-5" />} />
          <StatCard title="Cancelados" value={kpis.cancelledCount} description="Total de cancelamentos" icon={<XCircle className="size-5" />} />
          <StatCard title="Sem Recibo" value={kpis.requireReceiptCount} description="Confirmados aguardam recibo" icon={<FileText className="size-5" />} />
          <StatCard title="Sobrepagamentos" value={kpis.overpaymentCount} description="Geraram crédito na carteira" icon={<AlertCircle className="size-5" />} />
          <StatCard title="Crédito Aplicado" value={fmt(kpis.walletCreditUsed)} description="Crédito de carteira este mês" icon={<Wallet className="size-5" />} />
        </ExecutiveKpiGrid>

        {/* Two-column main content */}
        <ExecutiveMainGrid>

          {/* LEFT: Watchlist + Table */}
          <ExecutiveLeftColumn>
            {watchlist.length > 0 && (
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm font-medium">Lista de Atenção</CardTitle>
                    <span className="text-xs text-muted-foreground">
                      {watchlist.length} {watchlist.length === 1 ? "item" : "itens"}
                    </span>
                  </div>
                </CardHeader>
                <CardContent className="p-0 pb-2">
                  <PaymentWatchlist items={watchlist} />
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-medium">Registos de Pagamentos</CardTitle>
                  <span className="text-xs text-muted-foreground">{result.total.toLocaleString("pt-PT")} no total</span>
                </div>
              </CardHeader>
              <CardContent className="p-0 sm:px-4 sm:pb-4">
                <PaymentsTable
                  result={result}
                  branches={branches}
                  defaultSearch={search}
                  defaultStatus={status}
                  defaultMethod={method}
                  defaultReceiptStatus={receiptStatus}
                  defaultBranchId={branchId}
                  defaultDateFrom={dateFrom}
                  defaultDateTo={dateTo}
                  canConfirm={canConfirm}
                  canCancel={canCancel}
                  canIssueReceipt={canIssueReceipt}
                  walletBalances={walletBalances}
                />
              </CardContent>
            </Card>
          </ExecutiveLeftColumn>

          {/* RIGHT: Insights + Quick Actions + Charts */}
          <ExecutiveRightColumn>

            {insights.length > 0 && (
              <DashboardSideCard
                title="Alertas Operacionais"
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
                  <QuickActionTile href="/payments/new" icon={<Plus className="size-4" />} label="Registar Pagamento" variant="success" />
                )}
                <QuickActionTile href="/payments?status=PENDING" icon={<Clock className="size-4" />} label="Ver Pendentes" description={`${kpis.pendingCount} por confirmar`} variant={kpis.pendingCount > 0 ? "warning" : "default"} />
                <QuickActionTile href="/payments?receiptStatus=MISSING" icon={<FileText className="size-4" />} label="Ver Sem Recibo" description={`${kpis.requireReceiptCount} sem recibo`} variant={kpis.requireReceiptCount > 0 ? "warning" : "default"} />
                <QuickActionTile href="/payments?status=CANCELLED" icon={<XCircle className="size-4" />} label="Ver Cancelados" description={`${kpis.cancelledCount} cancelados`} variant={kpis.cancelledCount > 0 ? "destructive" : "default"} />
                <QuickActionTile href="/receipts" icon={<Receipt className="size-4" />} label="Ver Recibos" />
              </div>
            </DashboardSideCard>

            <DashboardSideCard title="Por Estado">
              <ApexDonutChart data={statusDonut} height={220} />
            </DashboardSideCard>

            {methodDistribution.length > 0 && (
              <DashboardSideCard title="Por Método de Pagamento">
                <ApexBarChart data={methodBar} height={200} currency />
              </DashboardSideCard>
            )}

            {monthlyTrend.length > 0 && (
              <DashboardSideCard title="Tendência Mensal" badge={<span className="text-xs text-muted-foreground">6 meses</span>}>
                <ApexLineChart data={trendLine} height={180} currency />
              </DashboardSideCard>
            )}

          </ExecutiveRightColumn>
        </ExecutiveMainGrid>
      </div>
    </>
  );
}
