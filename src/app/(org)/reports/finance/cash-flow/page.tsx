import Link from "next/link";
import { ChevronLeft, TrendingUp, TrendingDown, ArrowRightLeft, Banknote } from "lucide-react";
import { PageHeader } from "@/shared/components/layout/page-header";
import { StatCard } from "@/shared/components/layout/stat-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui/card";
import { Badge } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import { requirePermissionOrRedirect } from "@/server/auth/context";
import { PERMISSIONS } from "@/server/auth/permissions";
import { getDb } from "@/server/db";
import { getCashFlowKPIs, listCashFlowEntries } from "@/modules/reports/finance/repositories/cash-flow.repository";
import { CashFlowChart } from "@/modules/reports/finance/components/cash-flow-chart";
import { IntegrityWarningBanner } from "@/modules/reports/finance/components/integrity-warning-banner";
import type { CashFlowFilters } from "@/modules/reports/finance/types";

export const metadata = { title: "Fluxo de Caixa" };

const TX_TYPE_LABELS: Record<string, string> = {
  PAYMENT_RECEIVED: "Pagamento Recebido",
  PAYMENT_CANCELLED: "Pagamento Cancelado",
  REFUND_DISBURSED: "Reembolso Efetuado",
};

const TX_TYPE_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  PAYMENT_RECEIVED: "default",
  PAYMENT_CANCELLED: "outline",
  REFUND_DISBURSED: "destructive",
};

function fmt(v: number) {
  return v.toLocaleString("pt-PT", { minimumFractionDigits: 2 }) + " MZN";
}

async function getCriticalCount(organizationId: string) {
  const db = await getDb();
  return db.financialIntegrityIssue.count({
    where: { organizationId, severity: "CRITICAL", status: "OPEN" },
  });
}

export default async function CashFlowPage({
  searchParams,
}: {
  searchParams: Record<string, string | undefined>;
}) {
  const context = await requirePermissionOrRedirect(PERMISSIONS.FINANCIAL_REPORTS_VIEW);
  const { organizationId } = context;

  const page = Math.max(1, parseInt(searchParams.page ?? "1", 10));
  const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.pageSize ?? "20", 10)));

  const filters: CashFlowFilters = {
    organizationId,
    studentId: searchParams.studentId,
    dateFrom: searchParams.dateFrom,
    dateTo: searchParams.dateTo,
  };

  const [{ kpis, monthlyTrend }, { entries, total }, criticalCount] = await Promise.all([
    getCashFlowKPIs(filters),
    listCashFlowEntries({ ...filters, page, pageSize }),
    getCriticalCount(organizationId),
  ]);

  const totalPages = Math.ceil(total / pageSize);

  const baseParams = new URLSearchParams();
  for (const [k, v] of Object.entries(filters)) {
    if (v && k !== "organizationId") baseParams.set(k, v);
  }

  return (
    <div className="flex flex-col min-h-full">
      <PageHeader
        title="Fluxo de Caixa"
        description="Movimentos reais de caixa baseados no livro-razão financeiro."
        breadcrumb={
          <Link href="/reports/finance" className="flex items-center gap-1 text-muted-foreground hover:text-foreground text-xs">
            <ChevronLeft className="size-3" /> Relatórios Financeiros
          </Link>
        }
      />
      <div className="p-8 space-y-6">
        <IntegrityWarningBanner criticalCount={criticalCount} />

        {/* KPIs */}
        <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
          <StatCard
            title="Total Entradas"
            value={fmt(kpis.totalCashIn)}
            description={`${kpis.paymentCount} pagamento(s)`}
            icon={<TrendingUp className="size-4 text-green-600" />}
          />
          <StatCard
            title="Cancelamentos"
            value={fmt(kpis.totalCancellations)}
            description={`${kpis.cancellationCount} cancelamento(s)`}
            icon={<ArrowRightLeft className="size-4 text-amber-600" />}
          />
          <StatCard
            title="Reembolsos"
            value={fmt(kpis.totalRefunds)}
            description={`${kpis.refundCount} reembolso(s)`}
            icon={<TrendingDown className="size-4 text-red-600" />}
          />
          <StatCard
            title="Fluxo Líquido"
            value={fmt(kpis.netCashFlow)}
            description="entradas − cancelamentos − reembolsos"
            icon={<Banknote className="size-4" />}
          />
        </div>

        {/* Monthly trend chart */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Tendência Mensal (Entradas · Saídas · Líquido)</CardTitle>
          </CardHeader>
          <CardContent>
            <CashFlowChart trend={monthlyTrend} />
          </CardContent>
        </Card>

        {/* Filters */}
        <form method="GET" className="flex flex-wrap gap-3 items-end bg-muted/30 rounded-lg p-4 border">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-muted-foreground">De</label>
            <input type="date" name="dateFrom" defaultValue={filters.dateFrom ?? ""} className="h-8 rounded-md border border-input bg-background px-2 text-xs" />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-muted-foreground">Até</label>
            <input type="date" name="dateTo" defaultValue={filters.dateTo ?? ""} className="h-8 rounded-md border border-input bg-background px-2 text-xs" />
          </div>
          <Button type="submit" size="sm">Filtrar</Button>
          <Button asChild variant="ghost" size="sm"><Link href="/reports/finance/cash-flow">Limpar</Link></Button>
        </form>

        {/* Ledger entries table */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Movimentos ({total})</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {entries.length === 0 ? (
              <p className="px-6 py-8 text-sm text-muted-foreground text-center">
                Nenhum movimento encontrado para os filtros selecionados.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/30 text-xs text-muted-foreground">
                      <th className="px-4 py-2.5 text-left font-medium">Nº Transação</th>
                      <th className="px-4 py-2.5 text-left font-medium">Tipo</th>
                      <th className="px-4 py-2.5 text-left font-medium">Descrição</th>
                      <th className="px-4 py-2.5 text-right font-medium">Entrada</th>
                      <th className="px-4 py-2.5 text-right font-medium">Saída</th>
                      <th className="px-4 py-2.5 text-left font-medium">Data</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {entries.map((e) => {
                      const isInflow = e.transactionType === "PAYMENT_RECEIVED";
                      return (
                        <tr key={e.id} className="hover:bg-muted/20 transition-colors">
                          <td className="px-4 py-2.5 font-mono text-xs">{e.transactionNumber}</td>
                          <td className="px-4 py-2.5">
                            <Badge variant={TX_TYPE_VARIANT[e.transactionType] ?? "outline"} className="text-[10px]">
                              {TX_TYPE_LABELS[e.transactionType] ?? e.transactionType}
                            </Badge>
                          </td>
                          <td className="px-4 py-2.5 text-muted-foreground max-w-56 truncate">{e.description ?? "—"}</td>
                          <td className="px-4 py-2.5 text-right font-mono text-xs">
                            {isInflow ? <span className="text-green-700 font-semibold">{fmt(e.amount)}</span> : "—"}
                          </td>
                          <td className="px-4 py-2.5 text-right font-mono text-xs">
                            {!isInflow ? <span className="text-red-700 font-semibold">{fmt(e.amount)}</span> : "—"}
                          </td>
                          <td className="px-4 py-2.5 text-xs text-muted-foreground">
                            {new Date(e.occurredAt).toLocaleDateString("pt-PT")}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t text-xs text-muted-foreground">
                <span>Página {page} de {totalPages} — {total} movimentos</span>
                <div className="flex gap-2">
                  {page > 1 && (
                    <Button asChild variant="outline" size="sm">
                      <Link href={`?${new URLSearchParams({ ...Object.fromEntries(baseParams), page: String(page - 1) })}`}>
                        Anterior
                      </Link>
                    </Button>
                  )}
                  {page < totalPages && (
                    <Button asChild variant="outline" size="sm">
                      <Link href={`?${new URLSearchParams({ ...Object.fromEntries(baseParams), page: String(page + 1) })}`}>
                        Próxima
                      </Link>
                    </Button>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
