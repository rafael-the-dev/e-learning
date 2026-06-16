import Link from "next/link";
import { ChevronLeft, RefreshCcw, Clock, CheckCircle2, XCircle } from "lucide-react";
import { PageHeader } from "@/shared/components/layout/page-header";
import { StatCard } from "@/shared/components/layout/stat-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui/card";
import { Button } from "@/shared/components/ui/button";
import { requirePermission } from "@/server/auth/context";
import { PERMISSIONS } from "@/server/auth/permissions";
import { getDb } from "@/server/db";
import { getRefundsReportKPIs } from "@/modules/reports/finance/repositories/refunds-report.repository";
import { RefundsReportTable } from "@/modules/reports/finance/components/refunds-report-table";
import { ExportButton } from "@/modules/reports/finance/components/export-button";
import { IntegrityWarningBanner } from "@/modules/reports/finance/components/integrity-warning-banner";
import { REFUND_METHOD_LABELS, REFUND_STATUS_LABELS } from "@/modules/finance/types";
import type { RefundsReportFilters } from "@/modules/reports/finance/types";

export const metadata = { title: "Relatório de Reembolsos" };

async function getCriticalCount(organizationId: string) {
  const db = await getDb();
  return db.financialIntegrityIssue.count({
    where: { organizationId, severity: "CRITICAL", status: "OPEN" },
  });
}

const REFUND_METHODS = ["CASH_RETURN", "WALLET_CREDIT"];
const REFUND_STATUSES = ["REQUESTED", "APPROVED", "REJECTED", "COMPLETED"];

export default async function RefundsReportPage({
  searchParams,
}: {
  searchParams: Record<string, string | undefined>;
}) {
  const context = await requirePermission(PERMISSIONS.FINANCIAL_REPORTS_VIEW);
  const { organizationId } = context;

  const filters: RefundsReportFilters = {
    organizationId,
    page: Math.max(1, parseInt(searchParams.page ?? "1", 10)),
    pageSize: Math.min(100, Math.max(1, parseInt(searchParams.pageSize ?? "20", 10))),
    branchId: searchParams.branchId,
    dateFrom: searchParams.dateFrom,
    dateTo: searchParams.dateTo,
    refundMethod: searchParams.refundMethod,
    refundStatus: searchParams.refundStatus,
    search: searchParams.search,
  };

  const [{ kpis, methodBreakdown, monthlyTrend }, criticalCount] = await Promise.all([
    getRefundsReportKPIs(filters),
    getCriticalCount(organizationId),
  ]);

  const exportFilters = Object.fromEntries(
    Object.entries({ refundMethod: filters.refundMethod, refundStatus: filters.refundStatus, dateFrom: filters.dateFrom, dateTo: filters.dateTo, branchId: filters.branchId, search: filters.search }).filter(([, v]) => v != null)
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
        title="Relatório de Reembolsos"
        description="Reembolsos por valor, método, estado e período."
        breadcrumb={
          <Link href="/reports/finance" className="flex items-center gap-1 text-muted-foreground hover:text-foreground text-xs">
            <ChevronLeft className="size-3" /> Relatórios Financeiros
          </Link>
        }
        actions={<ExportButton reportType="refunds" filters={exportFilters} />}
      />
      <div className="p-8 space-y-6">
        <IntegrityWarningBanner criticalCount={criticalCount} />

        {/* KPIs */}
        <div className="grid gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
          <StatCard
            title="Total Reembolsado"
            value={`${kpis.totalRefunded.toLocaleString("pt-PT", { minimumFractionDigits: 2 })} MZN`}
            icon={<RefreshCcw className="size-4" />}
          />
          <StatCard title="Nº Reembolsos" value={kpis.refundCount} description="concluídos" icon={<CheckCircle2 className="size-4" />} />
          <StatCard title="Pendentes" value={kpis.pendingRefunds} description="solicitados" icon={<Clock className="size-4" />} />
          <StatCard title="Aprovados" value={kpis.approvedNotCompleted} description="aguardam conclusão" />
          <StatCard title="Em Numerário" value={kpis.cashReturns} description="devoluções" icon={<XCircle className="size-4" />} />
          <StatCard title="Crédito Carteira" value={kpis.walletCreditRefunds} description="via carteira" />
        </div>

        {/* Breakdowns */}
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Por Método de Reembolso</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="divide-y">
                {methodBreakdown.length === 0 ? (
                  <p className="px-6 py-4 text-sm text-muted-foreground">Sem dados.</p>
                ) : (
                  methodBreakdown.map((m) => (
                    <div key={m.method} className="flex items-center justify-between px-6 py-2.5 text-sm">
                      <span>{REFUND_METHOD_LABELS[m.method] ?? m.method}</span>
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
                      <span>{m.month}</span>
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
          <div className="flex flex-col gap-1 min-w-36">
            <label className="text-xs font-medium text-muted-foreground">Método</label>
            <select name="refundMethod" defaultValue={filters.refundMethod ?? ""} className="h-8 rounded-md border border-input bg-background px-2 text-xs">
              <option value="">Todos</option>
              {REFUND_METHODS.map((m) => (
                <option key={m} value={m}>{REFUND_METHOD_LABELS[m] ?? m}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1 min-w-36">
            <label className="text-xs font-medium text-muted-foreground">Estado</label>
            <select name="refundStatus" defaultValue={filters.refundStatus ?? ""} className="h-8 rounded-md border border-input bg-background px-2 text-xs">
              <option value="">Todos</option>
              {REFUND_STATUSES.map((s) => (
                <option key={s} value={s}>{REFUND_STATUS_LABELS[s] ?? s}</option>
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
            <input type="text" name="search" defaultValue={filters.search ?? ""} placeholder="Nº reembolso, aluno..." className="h-8 rounded-md border border-input bg-background px-2 text-xs" />
          </div>
          <Button type="submit" size="sm">Filtrar</Button>
          <Button asChild variant="ghost" size="sm"><Link href="/reports/finance/refunds">Limpar</Link></Button>
        </form>

        <RefundsReportTable queryString={queryString} />
      </div>
    </div>
  );
}
