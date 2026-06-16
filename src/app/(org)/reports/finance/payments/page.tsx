import Link from "next/link";
import { ChevronLeft, CreditCard, TrendingUp, Calculator } from "lucide-react";
import { PageHeader } from "@/shared/components/layout/page-header";
import { StatCard } from "@/shared/components/layout/stat-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui/card";
import { Button } from "@/shared/components/ui/button";
import { requirePermission } from "@/server/auth/context";
import { PERMISSIONS } from "@/server/auth/permissions";
import { getDb } from "@/server/db";
import { getPaymentsReportKPIs } from "@/modules/reports/finance/repositories/payments-report.repository";
import { PaymentsReportTable } from "@/modules/reports/finance/components/payments-report-table";
import { ExportButton } from "@/modules/reports/finance/components/export-button";
import { IntegrityWarningBanner } from "@/modules/reports/finance/components/integrity-warning-banner";
import { PAYMENT_METHOD_LABELS } from "@/modules/finance/types";
import type { PaymentsReportFilters } from "@/modules/reports/finance/types";

export const metadata = { title: "Relatório de Pagamentos" };

async function getFilterOptions(organizationId: string) {
  const db = await getDb();
  const branches = await db.branch.findMany({
    where: { organizationId, deletedAt: null },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
  return { branches };
}

async function getCriticalCount(organizationId: string) {
  const db = await getDb();
  return db.financialIntegrityIssue.count({
    where: { organizationId, severity: "CRITICAL", status: "OPEN" },
  });
}

const PAYMENT_METHODS = ["CASH", "BANK_TRANSFER", "MPESA", "EMOLA", "POS", "CARD", "CHEQUE", "OTHER"];

export default async function PaymentsReportPage({
  searchParams,
}: {
  searchParams: Record<string, string | undefined>;
}) {
  const context = await requirePermission(PERMISSIONS.FINANCIAL_REPORTS_VIEW);
  const { organizationId } = context;

  const filters: PaymentsReportFilters = {
    organizationId,
    page: Math.max(1, parseInt(searchParams.page ?? "1", 10)),
    pageSize: Math.min(100, Math.max(1, parseInt(searchParams.pageSize ?? "20", 10))),
    branchId: searchParams.branchId,
    courseId: searchParams.courseId,
    dateFrom: searchParams.dateFrom,
    dateTo: searchParams.dateTo,
    paymentMethod: searchParams.paymentMethod,
    search: searchParams.search,
  };

  const [{ kpis, methodBreakdown, monthlyTrend }, filterOptions, criticalCount] = await Promise.all([
    getPaymentsReportKPIs(filters),
    getFilterOptions(organizationId),
    getCriticalCount(organizationId),
  ]);

  const exportFilters = Object.fromEntries(
    Object.entries({ branchId: filters.branchId, dateFrom: filters.dateFrom, dateTo: filters.dateTo, paymentMethod: filters.paymentMethod, search: filters.search }).filter(([, v]) => v != null)
  ) as Record<string, string>;

  const queryParams = new URLSearchParams();
  for (const [k, v] of Object.entries(filters)) {
    if (v != null && k !== "organizationId" && k !== "page" && k !== "pageSize") {
      queryParams.set(k, String(v));
    }
  }
  const queryString = queryParams.toString();

  return (
    <div className="flex flex-col min-h-full">
      <PageHeader
        title="Relatório de Pagamentos"
        description="Pagamentos confirmados — por método, filial e período."
        breadcrumb={
          <Link href="/reports/finance" className="flex items-center gap-1 text-muted-foreground hover:text-foreground text-xs">
            <ChevronLeft className="size-3" /> Relatórios Financeiros
          </Link>
        }
        actions={<ExportButton reportType="payments" filters={exportFilters} />}
      />
      <div className="p-8 space-y-6">
        <IntegrityWarningBanner criticalCount={criticalCount} />

        {/* KPIs */}
        <div className="grid gap-4 grid-cols-2 md:grid-cols-4 lg:grid-cols-4">
          <StatCard
            title="Total Recebido"
            value={`${kpis.totalReceived.toLocaleString("pt-PT", { minimumFractionDigits: 2 })} MZN`}
            icon={<CreditCard className="size-4" />}
          />
          <StatCard
            title="Valor Líquido"
            value={`${kpis.netReceived.toLocaleString("pt-PT", { minimumFractionDigits: 2 })} MZN`}
            description="após reembolsos"
            icon={<TrendingUp className="size-4" />}
          />
          <StatCard
            title="Nº Pagamentos"
            value={kpis.paymentsCount}
            icon={<Calculator className="size-4" />}
          />
          <StatCard
            title="Média por Pagamento"
            value={`${kpis.averagePayment.toLocaleString("pt-PT", { minimumFractionDigits: 2 })} MZN`}
          />
        </div>

        {/* Method breakdown + trend */}
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Por Método de Pagamento</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="divide-y">
                {methodBreakdown.length === 0 ? (
                  <p className="px-6 py-4 text-sm text-muted-foreground">Sem dados.</p>
                ) : (
                  methodBreakdown.map((m) => (
                    <div key={m.method} className="flex items-center justify-between px-6 py-2.5 text-sm">
                      <span>{PAYMENT_METHOD_LABELS[m.method] ?? m.method}</span>
                      <div className="text-right">
                        <span className="font-mono text-xs font-semibold">
                          {m.totalAmount.toLocaleString("pt-PT", { minimumFractionDigits: 2 })} MZN
                        </span>
                        <span className="text-muted-foreground text-xs ml-2">({m.count})</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Tendência Mensal</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="divide-y">
                {monthlyTrend.length === 0 ? (
                  <p className="px-6 py-4 text-sm text-muted-foreground">Sem dados.</p>
                ) : (
                  monthlyTrend.slice(-6).map((m) => (
                    <div key={m.month} className="flex items-center justify-between px-6 py-2.5 text-sm">
                      <span className="font-medium">{m.month}</span>
                      <div className="text-right">
                        <span className="font-mono text-xs font-semibold">
                          {m.totalAmount.toLocaleString("pt-PT", { minimumFractionDigits: 2 })} MZN
                        </span>
                        <span className="text-muted-foreground text-xs ml-2">({m.count})</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <form method="GET" className="flex flex-wrap gap-3 items-end bg-muted/30 rounded-lg p-4 border">
          <div className="flex flex-col gap-1 min-w-32">
            <label className="text-xs font-medium text-muted-foreground">Filial</label>
            <select name="branchId" defaultValue={filters.branchId ?? ""} className="h-8 rounded-md border border-input bg-background px-2 text-xs">
              <option value="">Todas</option>
              {filterOptions.branches.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1 min-w-32">
            <label className="text-xs font-medium text-muted-foreground">Método</label>
            <select name="paymentMethod" defaultValue={filters.paymentMethod ?? ""} className="h-8 rounded-md border border-input bg-background px-2 text-xs">
              <option value="">Todos</option>
              {PAYMENT_METHODS.map((m) => (
                <option key={m} value={m}>{PAYMENT_METHOD_LABELS[m] ?? m}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-muted-foreground">De</label>
            <input type="date" name="dateFrom" defaultValue={filters.dateFrom ?? ""} className="h-8 rounded-md border border-input bg-background px-2 text-xs" />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-muted-foreground">Até</label>
            <input type="date" name="dateTo" defaultValue={filters.dateTo ?? ""} className="h-8 rounded-md border border-input bg-background px-2 text-xs" />
          </div>
          <div className="flex flex-col gap-1 flex-1 min-w-40">
            <label className="text-xs font-medium text-muted-foreground">Pesquisar</label>
            <input type="text" name="search" defaultValue={filters.search ?? ""} placeholder="Nº pagamento, aluno, fatura..." className="h-8 rounded-md border border-input bg-background px-2 text-xs" />
          </div>
          <Button type="submit" size="sm">Filtrar</Button>
          <Button asChild variant="ghost" size="sm"><Link href="/reports/finance/payments">Limpar</Link></Button>
        </form>

        <PaymentsReportTable queryString={queryString} />
      </div>
    </div>
  );
}
