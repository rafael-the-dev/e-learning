import { redirect } from "next/navigation";
import Link from "next/link";
import {
  FileText,
  Plus,
  Zap,
  Download,
  CreditCard,
  AlertTriangle,
  Clock,
  CheckCircle2,
  XCircle,
  Ban,
  ReceiptText,
  TrendingDown,
  Layers,
  Info,
  ShieldAlert,
  ShieldX,
} from "lucide-react";
import { PageHeader } from "@/shared/components/layout/page-header";
import { Button } from "@/shared/components/ui/button";
import { StatCard } from "@/shared/components/layout/stat-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui/card";
import { Badge } from "@/shared/components/ui/badge";
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
import { cn } from "@/shared/lib/utils";
import type { AuthContext } from "@/server/auth/context";

export const metadata = { title: "Faturas" };

const STATUS_COLORS: Record<string, string> = {
  PENDING: "bg-slate-400",
  PARTIALLY_PAID: "bg-amber-400",
  PAID: "bg-green-500",
  OVERDUE: "bg-red-500",
  CANCELLED: "bg-gray-300",
};

const MONTH_LABELS: Record<string, string> = {
  "01": "Jan", "02": "Fev", "03": "Mar", "04": "Abr",
  "05": "Mai", "06": "Jun", "07": "Jul", "08": "Ago",
  "09": "Set", "10": "Out", "11": "Nov", "12": "Dez",
};

function formatMonth(key: string) {
  const [year, month] = key.split("-");
  return `${MONTH_LABELS[month] ?? month} ${year}`;
}

async function getInvoiceFilterOptions(organizationId: string) {
  const db = await getDb();
  const [branches, courses, academicYears] = await Promise.all([
    db.branch.findMany({
      where: { organizationId, deletedAt: null },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    db.course.findMany({
      where: { organizationId, deletedAt: null },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    db.academicYear.findMany({
      where: { organizationId },
      select: { id: true, name: true },
      orderBy: { startDate: "desc" },
    }),
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

  const [
    kpis,
    watchlist,
    statusDistribution,
    courseDistribution,
    monthlyTrend,
    agingBuckets,
    result,
    filterOptions,
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
  ]);

  const insights = generateInvoiceInsights(kpis, courseDistribution);

  const totalStatusAmount = statusDistribution.reduce((s, d) => s + d.totalAmount, 0);
  const maxTrendAmount = Math.max(...monthlyTrend.map((m) => m.totalAmount), 1);
  const maxCourseAmount = Math.max(...courseDistribution.map((c) => c.totalAmount), 1);

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

        {/* ================================================================ */}
        {/* SECTION 1 — KPI CARDS                                            */}
        {/* ================================================================ */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            title="Facturado Hoje"
            value={kpis.invoicedToday.toLocaleString("pt-PT", { minimumFractionDigits: 2 })}
            description="Emitido hoje (excl. canceladas)"
            icon={<ReceiptText className="size-4" />}
          />
          <StatCard
            title="Facturado Este Mês"
            value={kpis.invoicedThisMonth.toLocaleString("pt-PT", { minimumFractionDigits: 2 })}
            description="Emitido este mês (excl. canceladas)"
            icon={<FileText className="size-4" />}
          />
          <StatCard
            title="Pago Este Mês"
            value={kpis.paidThisMonth.toLocaleString("pt-PT", { minimumFractionDigits: 2 })}
            description="Faturas liquidadas este mês"
            icon={<CheckCircle2 className="size-4" />}
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
            description="Não receberam nenhum pagamento"
            icon={<TrendingDown className="size-4" />}
          />
          <StatCard
            title="Canceladas"
            value={kpis.cancelledCount}
            description="Faturas canceladas"
            icon={<Ban className="size-4" />}
          />
        </div>

        {/* ================================================================ */}
        {/* SECTION 2 — INSIGHTS                                             */}
        {/* ================================================================ */}
        {insights.length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                Informações e Alertas
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 pt-0">
              {insights.map((insight) => {
                const borderColor =
                  insight.severity === "critical"
                    ? "border-red-500 bg-red-50/50"
                    : insight.severity === "warning"
                    ? "border-amber-400 bg-amber-50/50"
                    : "border-blue-400 bg-blue-50/50";
                const textColor =
                  insight.severity === "critical"
                    ? "text-red-700"
                    : insight.severity === "warning"
                    ? "text-amber-700"
                    : "text-blue-700";
                const IconComp =
                  insight.severity === "critical"
                    ? ShieldX
                    : insight.severity === "warning"
                    ? ShieldAlert
                    : Info;

                return (
                  <div
                    key={insight.id}
                    className={cn(
                      "flex items-start justify-between gap-3 rounded-md border-l-4 px-4 py-2.5",
                      borderColor
                    )}
                  >
                    <div className="flex items-start gap-2.5 min-w-0">
                      <IconComp className={cn("size-4 mt-0.5 shrink-0", textColor)} />
                      <p className={cn("text-sm font-medium", textColor)}>{insight.message}</p>
                    </div>
                    {insight.linkHref && (
                      <Link
                        href={insight.linkHref}
                        className={cn(
                          "text-xs font-medium shrink-0 hover:underline",
                          textColor
                        )}
                      >
                        {insight.linkLabel}
                      </Link>
                    )}
                  </div>
                );
              })}
            </CardContent>
          </Card>
        )}

        {/* ================================================================ */}
        {/* SECTION 3 — WATCHLIST                                            */}
        {/* ================================================================ */}
        {watchlist.length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                  Requer Atenção
                </CardTitle>
                <Badge variant="secondary" className="text-xs">
                  {watchlist.length}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <InvoiceWatchlist items={watchlist} canCreate={canRegisterPayment} />
            </CardContent>
          </Card>
        )}

        {/* ================================================================ */}
        {/* SECTION 4 — DISTRIBUTION                                         */}
        {/* ================================================================ */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Status distribution */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                Por Estado
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2.5">
              {statusDistribution.length === 0 ? (
                <p className="text-sm text-muted-foreground">Sem dados.</p>
              ) : (
                statusDistribution
                  .sort((a, b) => b.totalAmount - a.totalAmount)
                  .map((d) => {
                    const pct = totalStatusAmount > 0
                      ? Math.round((d.totalAmount / totalStatusAmount) * 100)
                      : 0;
                    return (
                      <div key={d.status} className="space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-medium">
                            {INVOICE_STATUS_LABELS[d.status] ?? d.status}
                          </span>
                          <span className="text-muted-foreground tabular-nums">
                            {d.count} · {pct}%
                          </span>
                        </div>
                        <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                          <div
                            className={cn(
                              "h-full rounded-full transition-all",
                              STATUS_COLORS[d.status] ?? "bg-slate-400"
                            )}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    );
                  })
              )}
            </CardContent>
          </Card>

          {/* Course distribution */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                Por Curso (este mês)
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2.5">
              {courseDistribution.length === 0 ? (
                <p className="text-sm text-muted-foreground">Sem dados este mês.</p>
              ) : (
                courseDistribution.map((c) => {
                  const pct = Math.round((c.totalAmount / maxCourseAmount) * 100);
                  return (
                    <div key={c.courseId ?? "__none__"} className="space-y-1">
                      <div className="flex items-center justify-between text-xs gap-2">
                        <span className="font-medium truncate">{c.courseName}</span>
                        <span className="text-muted-foreground tabular-nums shrink-0">
                          {c.count}
                        </span>
                      </div>
                      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                        <div
                          className="h-full rounded-full bg-primary transition-all"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })
              )}
            </CardContent>
          </Card>

          {/* Aging buckets */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                Aging em Atraso
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {agingBuckets.every((b) => b.count === 0) ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                  <CheckCircle2 className="size-4 text-green-500" />
                  Nenhuma fatura em atraso.
                </div>
              ) : (
                agingBuckets.map((b) => (
                  <div key={b.bucket} className="flex items-center justify-between gap-2 py-1 border-b last:border-0">
                    <div className="flex items-center gap-2">
                      <span
                        className={cn(
                          "size-2 rounded-full shrink-0",
                          b.bucket === "31+" ? "bg-red-500" :
                          b.bucket === "16-30" ? "bg-orange-400" :
                          b.bucket === "8-15" ? "bg-amber-400" :
                          "bg-yellow-400"
                        )}
                      />
                      <span className="text-sm">{b.label}</span>
                    </div>
                    <div className="text-right">
                      <span className="text-sm font-medium tabular-nums">{b.count}</span>
                      <p className="text-xs text-muted-foreground tabular-nums">
                        {b.totalAmount.toLocaleString("pt-PT", { minimumFractionDigits: 2 })} MT
                      </p>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>

        {/* Monthly trend */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
              Tendência Mensal (últimos 6 meses)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-end gap-2 h-28">
              {monthlyTrend.map((m) => {
                const heightPct = maxTrendAmount > 0 ? (m.totalAmount / maxTrendAmount) * 100 : 0;
                return (
                  <div key={m.month} className="flex-1 flex flex-col items-center gap-1">
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {m.count > 0
                        ? m.totalAmount.toLocaleString("pt-PT", {
                            notation: "compact",
                            maximumFractionDigits: 1,
                          })
                        : ""}
                    </span>
                    <div className="w-full flex items-end" style={{ height: "72px" }}>
                      <div
                        className="w-full rounded-t-sm bg-primary/80 transition-all"
                        style={{ height: `${Math.max(heightPct, m.count > 0 ? 4 : 0)}%` }}
                      />
                    </div>
                    <span className="text-[10px] text-muted-foreground text-center leading-tight">
                      {formatMonth(m.month)}
                    </span>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* ================================================================ */}
        {/* SECTION 5 — QUICK ACTIONS                                        */}
        {/* ================================================================ */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {canCreate && (
            <Link
              href="/invoices/new"
              className="flex items-center gap-3 rounded-lg border bg-card p-4 hover:bg-muted/50 transition-colors"
            >
              <div className="flex size-9 items-center justify-center rounded-md bg-primary/10">
                <Plus className="size-4 text-primary" />
              </div>
              <div>
                <p className="text-sm font-medium">Nova Fatura</p>
                <p className="text-xs text-muted-foreground">Criar fatura manualmente</p>
              </div>
            </Link>
          )}
          {canRegisterPayment && (
            <Link
              href="/payments/new"
              className="flex items-center gap-3 rounded-lg border bg-card p-4 hover:bg-muted/50 transition-colors"
            >
              <div className="flex size-9 items-center justify-center rounded-md bg-green-500/10">
                <CreditCard className="size-4 text-green-600" />
              </div>
              <div>
                <p className="text-sm font-medium">Registar Pagamento</p>
                <p className="text-xs text-muted-foreground">Associar pagamento a uma fatura</p>
              </div>
            </Link>
          )}
          <Link
            href="/invoices?status=OVERDUE"
            className="flex items-center gap-3 rounded-lg border bg-card p-4 hover:bg-muted/50 transition-colors"
          >
            <div className="flex size-9 items-center justify-center rounded-md bg-red-500/10">
              <AlertTriangle className="size-4 text-red-600" />
            </div>
            <div>
              <p className="text-sm font-medium">Ver Vencidas</p>
              <p className="text-xs text-muted-foreground">
                {kpis.overdueCount} fatura{kpis.overdueCount !== 1 ? "s" : ""} em atraso
              </p>
            </div>
          </Link>
          <Link
            href="/invoices?agingBucket=due-soon"
            className="flex items-center gap-3 rounded-lg border bg-card p-4 hover:bg-muted/50 transition-colors"
          >
            <div className="flex size-9 items-center justify-center rounded-md bg-amber-500/10">
              <Clock className="size-4 text-amber-600" />
            </div>
            <div>
              <p className="text-sm font-medium">A Vencer (3 dias)</p>
              <p className="text-xs text-muted-foreground">
                {kpis.dueSoonCount} fatura{kpis.dueSoonCount !== 1 ? "s" : ""} a vencer em breve
              </p>
            </div>
          </Link>
          <Link
            href="/invoices?status=PARTIALLY_PAID"
            className="flex items-center gap-3 rounded-lg border bg-card p-4 hover:bg-muted/50 transition-colors"
          >
            <div className="flex size-9 items-center justify-center rounded-md bg-amber-400/10">
              <Layers className="size-4 text-amber-600" />
            </div>
            <div>
              <p className="text-sm font-medium">Parcialmente Pagas</p>
              <p className="text-xs text-muted-foreground">
                {kpis.partiallyPaidCount} com saldo em aberto
              </p>
            </div>
          </Link>
          <Link
            href="/invoices?paymentStatus=NO_PAYMENT"
            className="flex items-center gap-3 rounded-lg border bg-card p-4 hover:bg-muted/50 transition-colors"
          >
            <div className="flex size-9 items-center justify-center rounded-md bg-slate-500/10">
              <XCircle className="size-4 text-slate-600" />
            </div>
            <div>
              <p className="text-sm font-medium">Sem Pagamento</p>
              <p className="text-xs text-muted-foreground">
                {kpis.noPaymentCount} sem pagamento recebido
              </p>
            </div>
          </Link>
        </div>

        {/* ================================================================ */}
        {/* SECTION 6 — TABLE                                                */}
        {/* ================================================================ */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                Faturas
              </CardTitle>
              <Badge variant="secondary" className="text-xs">
                {result.total}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="p-0 sm:px-6 sm:pb-6">
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
      </div>
    </>
  );
}
