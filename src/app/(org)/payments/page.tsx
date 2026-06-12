import { redirect } from "next/navigation";
import Link from "next/link";
import {
  TrendingUp,
  TrendingDown,
  Clock,
  CheckCircle2,
  XCircle,
  FileText,
  Wallet,
  AlertCircle,
  ShieldX,
  AlertTriangle,
  Info,
  ArrowRight,
  Plus,
  CheckCheck,
  Download,
  Receipt,
} from "lucide-react";
import { PageHeader } from "@/shared/components/layout/page-header";
import { Button } from "@/shared/components/ui/button";
import { StatCard } from "@/shared/components/layout/stat-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui/card";
import { requirePermission } from "@/server/auth/context";
import { getUserPermissions, createAbility } from "@/server/auth/rbac";
import { PERMISSIONS } from "@/server/auth/permissions";
import { getDb } from "@/server/db";
import { normalizePaginationParams } from "@/shared/lib/pagination";
import { getPaymentsByOrganization } from "@/modules/finance/services/payment.service";
import { getWalletBalancesByStudentIds } from "@/modules/wallets/services/wallet.service";
import { getPaymentKPIs, getPaymentMethodStats, getPaymentStatusStats, getPaymentTrend } from "@/modules/finance/services/payment-metrics.service";
import { generatePaymentInsights } from "@/modules/finance/services/payment-insights.service";
import { getPaymentWatchlist } from "@/modules/finance/services/payment-watchlist.service";
import { PaymentsTable } from "@/modules/finance/components/payments-table";
import { PaymentWatchlist } from "@/modules/finance/components/payment-watchlist";
import { PAYMENT_STATUS_LABELS, PAYMENT_METHOD_LABELS } from "@/modules/finance/types";
import type { AuthContext } from "@/server/auth/context";
import type { PaymentInsight } from "@/modules/finance/types";

export const metadata = { title: "Pagamentos" };

async function getPaymentFilterOptions(organizationId: string) {
  const db = await getDb();
  return db.branch.findMany({
    where: { organizationId, deletedAt: null },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// LOCAL HELPERS
// ─────────────────────────────────────────────────────────────────────────────

function InsightRow({ insight }: { insight: PaymentInsight }) {
  const colors = {
    critical: "border-red-500 bg-red-50",
    warning: "border-amber-500 bg-amber-50",
    info: "border-blue-500 bg-blue-50",
  };
  const icons = {
    critical: <ShieldX className="size-4 text-red-600 shrink-0 mt-0.5" />,
    warning: <AlertTriangle className="size-4 text-amber-600 shrink-0 mt-0.5" />,
    info: <Info className="size-4 text-blue-600 shrink-0 mt-0.5" />,
  };
  return (
    <div className={`flex items-start gap-3 rounded-lg border-l-4 px-4 py-3 ${colors[insight.severity]}`}>
      {icons[insight.severity]}
      <div className="flex-1 min-w-0">
        <p className="text-sm">{insight.message}</p>
      </div>
      {insight.linkHref && (
        <Link
          href={insight.linkHref}
          className="text-xs font-medium text-foreground hover:underline shrink-0 flex items-center gap-1"
        >
          {insight.linkLabel ?? "Ver"}
          <ArrowRight className="size-3" />
        </Link>
      )}
    </div>
  );
}

function StatusDistributionCard({
  data,
}: {
  data: { status: string; count: number; totalAmount: number }[];
}) {
  const total = data.reduce((s, d) => s + d.count, 0);
  if (total === 0) return null;

  const STATUS_COLORS: Record<string, string> = {
    PENDING: "bg-amber-400",
    CONFIRMED: "bg-green-500",
    CANCELLED: "bg-red-400",
    REFUNDED: "bg-slate-400",
  };

  return (
    <div className="space-y-2.5">
      {data.map((row) => {
        const pct = Math.round((row.count / total) * 100);
        const color = STATUS_COLORS[row.status] ?? "bg-muted-foreground";
        return (
          <div key={row.status}>
            <div className="flex justify-between text-xs mb-1">
              <span className="text-muted-foreground">
                {PAYMENT_STATUS_LABELS[row.status] ?? row.status}
              </span>
              <span className="font-medium tabular-nums">
                {row.count} <span className="text-muted-foreground">({pct}%)</span>
              </span>
            </div>
            <div className="h-1.5 rounded-full bg-muted overflow-hidden">
              <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function MethodDistributionCard({
  data,
}: {
  data: { method: string; count: number; totalAmount: number }[];
}) {
  const maxAmount = Math.max(...data.map((d) => d.totalAmount), 1);

  return (
    <div className="space-y-2.5">
      {data.slice(0, 6).map((row) => {
        const pct = Math.round((row.totalAmount / maxAmount) * 100);
        return (
          <div key={row.method}>
            <div className="flex justify-between text-xs mb-1">
              <span className="text-muted-foreground">
                {PAYMENT_METHOD_LABELS[row.method] ?? row.method}
              </span>
              <span className="font-medium tabular-nums">
                {row.totalAmount.toLocaleString("pt-PT", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                <span className="text-muted-foreground ml-1">({row.count})</span>
              </span>
            </div>
            <div className="h-1.5 rounded-full bg-muted overflow-hidden">
              <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function MonthlyTrendCard({
  data,
}: {
  data: { month: string; count: number; totalAmount: number }[];
}) {
  if (data.length === 0) {
    return (
      <p className="text-sm text-muted-foreground text-center py-4">
        Sem dados de tendência disponíveis.
      </p>
    );
  }

  const maxAmount = Math.max(...data.map((d) => d.totalAmount), 1);
  const MONTH_NAMES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

  return (
    <div className="space-y-2.5">
      {data.map((row) => {
        const pct = Math.round((row.totalAmount / maxAmount) * 100);
        const [year, month] = row.month.split("-");
        const label = `${MONTH_NAMES[parseInt(month) - 1]} ${year}`;
        return (
          <div key={row.month}>
            <div className="flex justify-between text-xs mb-1">
              <span className="text-muted-foreground">{label}</span>
              <span className="font-medium tabular-nums">
                {row.totalAmount.toLocaleString("pt-PT", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                <span className="text-muted-foreground ml-1">({row.count})</span>
              </span>
            </div>
            <div className="h-1.5 rounded-full bg-muted overflow-hidden">
              <div className="h-full rounded-full bg-green-500" style={{ width: `${pct}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function QuickAction({
  href,
  icon: Icon,
  label,
  count,
  variant = "default",
}: {
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  count?: number;
  variant?: "default" | "warning" | "destructive" | "success";
}) {
  const variantStyles = {
    default: "hover:bg-muted/60",
    warning: "hover:bg-amber-50 border-amber-100",
    destructive: "hover:bg-red-50 border-red-100",
    success: "hover:bg-green-50 border-green-100",
  };
  const iconStyles = {
    default: "text-muted-foreground",
    warning: "text-amber-600",
    destructive: "text-red-600",
    success: "text-green-600",
  };

  return (
    <Link
      href={href}
      className={`flex items-center gap-3 rounded-lg border p-3 transition-colors ${variantStyles[variant]}`}
    >
      <div className={`rounded-md p-2 bg-muted/50`}>
        <Icon className={`size-4 ${iconStyles[variant]}`} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{label}</p>
        {count !== undefined && (
          <p className="text-xs text-muted-foreground">{count.toLocaleString("pt-PT")} registos</p>
        )}
      </div>
      <ArrowRight className="size-4 text-muted-foreground shrink-0" />
    </Link>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PAGE
// ─────────────────────────────────────────────────────────────────────────────

export default async function PaymentsPage({
  searchParams,
}: {
  searchParams: Promise<{
    page?: string;
    search?: string;
    status?: string;
    method?: string;
    receiptStatus?: string;
    branchId?: string;
    dateFrom?: string;
    dateTo?: string;
  }>;
}) {
  let context: AuthContext;
  try {
    context = await requirePermission(PERMISSIONS.PAYMENTS_VIEW);
  } catch {
    redirect("/forbidden");
  }

  const { page, search, status, method, receiptStatus, branchId, dateFrom, dateTo } =
    await searchParams;
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
      getPaymentsByOrganization(org, {
        ...pagination,
        search,
        status,
        method,
        receiptStatus,
        branchId,
        dateFrom,
        dateTo,
      }),
      getPaymentFilterOptions(org),
    ]);

  const insights = generatePaymentInsights(kpis, methodDistribution);

  // Wallet balances for PENDING payments in the current page
  const pendingStudentIds = [
    ...new Set(
      result.data
        .filter((p) => p.status === "PENDING" && p.studentId != null)
        .map((p) => p.studentId as string)
    ),
  ];
  const walletBalances = await getWalletBalancesByStudentIds(org, pendingStudentIds);

  const fmt = (n: number) =>
    n.toLocaleString("pt-PT", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

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

      <div className="p-4 sm:p-8 space-y-8">

        {/* ─── SECTION 1: KPI CARDS ─── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            title="Recebido Hoje"
            value={fmt(kpis.receivedToday)}
            description="Pagamentos confirmados hoje"
            icon={<TrendingUp className="size-5" />}
          />
          <StatCard
            title="Recebido Este Mês"
            value={fmt(kpis.receivedThisMonth)}
            description="Total confirmado no mês atual"
            icon={<TrendingUp className="size-5" />}
          />
          <StatCard
            title="Pagamentos Pendentes"
            value={kpis.pendingCount}
            description={`${fmt(kpis.pendingAmount)} MT por confirmar`}
            icon={<Clock className="size-5" />}
          />
          <StatCard
            title="Confirmados"
            value={kpis.confirmedCount}
            description={`${fmt(kpis.confirmedAmount)} MT recebidos`}
            icon={<CheckCircle2 className="size-5" />}
          />
          <StatCard
            title="Cancelados"
            value={kpis.cancelledCount}
            description="Total de cancelamentos"
            icon={<XCircle className="size-5" />}
          />
          <StatCard
            title="Sem Recibo"
            value={kpis.requireReceiptCount}
            description="Confirmados aguardam recibo"
            icon={<FileText className="size-5" />}
          />
          <StatCard
            title="Sobrepagamentos"
            value={kpis.overpaymentCount}
            description="Geraram crédito na carteira"
            icon={<AlertCircle className="size-5" />}
          />
          <StatCard
            title="Crédito Aplicado"
            value={fmt(kpis.walletCreditUsed)}
            description="Crédito de carteira usado este mês"
            icon={<Wallet className="size-5" />}
          />
        </div>

        {/* ─── SECTION 2: INSIGHTS ─── */}
        {insights.length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Alertas Operacionais</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {insights.map((insight) => (
                <InsightRow key={insight.id} insight={insight} />
              ))}
            </CardContent>
          </Card>
        )}

        {/* ─── SECTION 3: WATCHLIST ─── */}
        {watchlist.length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Lista de Atenção</CardTitle>
                <span className="text-xs text-muted-foreground">
                  {watchlist.length} {watchlist.length === 1 ? "item" : "itens"} a necessitar atenção
                </span>
              </div>
            </CardHeader>
            <CardContent className="p-0 pb-2">
              <PaymentWatchlist items={watchlist} />
            </CardContent>
          </Card>
        )}

        {/* ─── SECTION 4: DISTRIBUTION ─── */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                Por Estado
              </CardTitle>
            </CardHeader>
            <CardContent>
              <StatusDistributionCard data={statusDistribution} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                Por Método
              </CardTitle>
            </CardHeader>
            <CardContent>
              {methodDistribution.length > 0 ? (
                <MethodDistributionCard data={methodDistribution} />
              ) : (
                <p className="text-sm text-muted-foreground">Sem dados disponíveis.</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                Tendência Mensal
              </CardTitle>
            </CardHeader>
            <CardContent>
              <MonthlyTrendCard data={monthlyTrend} />
            </CardContent>
          </Card>
        </div>

        {/* ─── SECTION 5: QUICK ACTIONS ─── */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Ações Rápidas</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {canCreate && (
                <QuickAction
                  href="/payments/new"
                  icon={Plus}
                  label="Registar Pagamento"
                  variant="success"
                />
              )}
              <QuickAction
                href="/payments?status=PENDING"
                icon={Clock}
                label="Ver Pagamentos Pendentes"
                count={kpis.pendingCount}
                variant={kpis.pendingCount > 0 ? "warning" : "default"}
              />
              <QuickAction
                href="/payments?receiptStatus=MISSING"
                icon={FileText}
                label="Ver Sem Recibo"
                count={kpis.requireReceiptCount}
                variant={kpis.requireReceiptCount > 0 ? "warning" : "default"}
              />
              <QuickAction
                href="/payments?status=CONFIRMED"
                icon={AlertCircle}
                label="Ver Sobrepagamentos"
                count={kpis.overpaymentCount}
                variant="default"
              />
              <QuickAction
                href="/payments?status=CANCELLED"
                icon={XCircle}
                label="Ver Cancelados"
                count={kpis.cancelledCount}
                variant={kpis.cancelledCount > 0 ? "destructive" : "default"}
              />
              <QuickAction
                href="/receipts"
                icon={Receipt}
                label="Ver Recibos"
                variant="default"
              />
            </div>
          </CardContent>
        </Card>

        {/* ─── SECTION 6: PAYMENTS TABLE ─── */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Registos de Pagamentos</CardTitle>
              <span className="text-xs text-muted-foreground">
                {result.total.toLocaleString("pt-PT")} no total
              </span>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
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

      </div>
    </>
  );
}
