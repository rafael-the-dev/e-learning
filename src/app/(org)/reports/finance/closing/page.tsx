import Link from "next/link";
import {
  ChevronLeft, AlertTriangle, ShieldAlert, Scale, Wallet, FileX, RefreshCcw,
  TrendingUp, Users, Filter, ExternalLink, Banknote, FileWarning,
} from "lucide-react";
import { PageHeader } from "@/shared/components/layout/page-header";
import { StatCard } from "@/shared/components/layout/stat-card";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/shared/components/ui/card";
import { Alert, AlertDescription } from "@/shared/components/ui/alert";
import { Badge } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import {
  Sheet, SheetTrigger, SheetContent, SheetHeader, SheetTitle, SheetBody,
} from "@/shared/components/ui/sheet";
import { requirePermissionOrRedirect } from "@/server/auth/context";
import { PERMISSIONS } from "@/server/auth/permissions";
import { getDb } from "@/server/db";
import { getFinancialClosingReport } from "@/modules/reports/finance/services/financial-reports.service";
import { ClosingFiltersForm } from "@/modules/reports/finance/components/closing-filters-form";
import { ClosingWatchlistTable } from "@/modules/reports/finance/components/closing-watchlist-table";
import { CashFlowChart } from "@/modules/reports/finance/components/cash-flow-chart";
import { ExportButton } from "@/modules/reports/finance/components/export-button";
import { TRUST_SCORE_RATING_LABELS, TRUST_SCORE_DEDUCTION_LABELS } from "@/modules/reports/finance/types";
import type { ClosingFilters } from "@/modules/reports/finance/types";

export const metadata = { title: "Fecho Financeiro" };

const RATING_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  HEALTHY: "default",
  NEEDS_REVIEW: "secondary",
  RISKY: "destructive",
  UNSAFE: "destructive",
};

async function getFilterOptions(organizationId: string) {
  const db = await getDb();
  const [branches, academicYears, academicTerms] = await Promise.all([
    db.branch.findMany({ where: { organizationId, deletedAt: null }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    db.academicYear.findMany({ where: { organizationId }, select: { id: true, name: true }, orderBy: { startDate: "desc" } }),
    db.academicTerm.findMany({ where: { organizationId }, select: { id: true, name: true }, orderBy: { startDate: "desc" } }),
  ]);
  return { branches, academicYears, academicTerms };
}

function fmtMzn(value: number): string {
  return `${value.toLocaleString("pt-PT", { minimumFractionDigits: 2 })} MZN`;
}

export default async function FinancialClosingPage({
  searchParams,
}: {
  searchParams: Record<string, string | undefined>;
}) {
  const context = await requirePermissionOrRedirect(PERMISSIONS.FINANCIAL_REPORTS_CLOSING_VIEW);
  const { organizationId } = context;

  const filters: ClosingFilters = {
    organizationId,
    branchId: searchParams.branchId,
    academicYearId: searchParams.academicYearId,
    academicTermId: searchParams.academicTermId,
    dateFrom: searchParams.dateFrom,
    dateTo: searchParams.dateTo,
  };

  const [report, filterOptions] = await Promise.all([
    getFinancialClosingReport(filters),
    getFilterOptions(organizationId),
  ]);

  const { kpis, trustScore, netCashTrend, watchlist, controlSummary, reconciliationSummary } = report;

  const exportFilters = Object.fromEntries(
    Object.entries({
      branchId: filters.branchId,
      academicYearId: filters.academicYearId,
      academicTermId: filters.academicTermId,
      dateFrom: filters.dateFrom,
      dateTo: filters.dateTo,
    }).filter(([, v]) => v != null)
  ) as Record<string, string>;

  return (
    <div className="flex flex-col min-h-full">
      <PageHeader
        title="Fecho Financeiro"
        description="Visão executiva da integridade financeira, reconciliação, caixa, recebíveis e passivos."
        breadcrumb={
          <Link href="/reports/finance" className="flex items-center gap-1 text-muted-foreground hover:text-foreground text-xs">
            <ChevronLeft className="size-3" /> Relatórios Financeiros
          </Link>
        }
        actions={
          <div className="flex items-center gap-2">
            <Sheet>
              <SheetTrigger asChild>
                <Button variant="outline" size="sm" className="lg:hidden">
                  <Filter className="size-4 mr-2" /> Filtros
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="w-full sm:max-w-sm flex flex-col">
                <SheetHeader>
                  <SheetTitle>Filtros</SheetTitle>
                </SheetHeader>
                <SheetBody>
                  <ClosingFiltersForm filters={filters} {...filterOptions} formId="closing-filters-mobile" />
                </SheetBody>
              </SheetContent>
            </Sheet>
            <Button asChild variant="outline" size="sm">
              <Link href="/reports/finance/accounts-receivable">Ver Recebíveis</Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link href="/reports/finance/integrity">Ver Integridade</Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link href="/reports/finance/reconciliation">Ver Reconciliação</Link>
            </Button>
            <ExportButton reportType="closing" filters={exportFilters} label="Exportar Resumo" />
          </div>
        }
      />
      <div className="p-8 space-y-6">
        {trustScore.score < 40 ? (
          <Alert variant="destructive">
            <AlertTriangle className="size-4" />
            <AlertDescription>
              <strong>Fecho financeiro inseguro.</strong> Corrija as inconsistências antes de usar estes números.
            </AlertDescription>
          </Alert>
        ) : trustScore.score < 70 ? (
          <Alert variant="destructive">
            <AlertTriangle className="size-4" />
            <AlertDescription>
              Os números financeiros exigem revisão antes do fecho.
            </AlertDescription>
          </Alert>
        ) : null}

        {/* Trust Score */}
        <Card>
          <CardContent className="flex flex-wrap items-center justify-between gap-4 pt-6">
            <div className="flex items-center gap-4">
              <div className="text-3xl font-bold">{trustScore.score}<span className="text-sm text-muted-foreground">/100</span></div>
              <div>
                <Badge variant={RATING_VARIANT[trustScore.rating] ?? "outline"}>
                  {TRUST_SCORE_RATING_LABELS[trustScore.rating]}
                </Badge>
                <p className="text-xs text-muted-foreground mt-1">Índice de Confiança Financeira</p>
              </div>
            </div>
            {trustScore.deductions.length > 0 && (
              <div className="text-xs text-muted-foreground space-y-0.5">
                {trustScore.deductions.map((d) => (
                  <div key={d.reason}>−{d.points} pts — {TRUST_SCORE_DEDUCTION_LABELS[d.reason]}</div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* KPI Cards */}
        <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
          <StatCard title="Total Faturado" value={fmtMzn(kpis.grossInvoiced)} icon={<FileWarning className="size-4" />} />
          <StatCard title="Total Cobrado" value={fmtMzn(kpis.grossCollected)} icon={<Banknote className="size-4" />} />
          <StatCard title="Posição de Caixa Líquida" value={fmtMzn(kpis.netCashPosition)} icon={<TrendingUp className="size-4" />} />
          <StatCard title="Recebíveis em Aberto" value={fmtMzn(kpis.outstandingReceivables)} icon={<FileX className="size-4" />} />
          <StatCard title="Recebíveis Vencidos" value={fmtMzn(kpis.overdueReceivables)} icon={<AlertTriangle className="size-4" />} />
          <StatCard title="Passivo de Carteiras" value={fmtMzn(kpis.walletLiability)} icon={<Wallet className="size-4" />} />
          <StatCard title="Exposição a Reembolsos" value={fmtMzn(kpis.refundExposure)} icon={<RefreshCcw className="size-4" />} />
          <StatCard title="Problemas Críticos" value={kpis.criticalFinancialIssues} icon={<ShieldAlert className="size-4" />} />
        </div>

        {/* Full-width chart */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Tendência da Posição de Caixa Líquida</CardTitle>
            <CardDescription className="text-xs">Entradas, saídas e fluxo líquido mensal, segundo o livro-razão financeiro.</CardDescription>
          </CardHeader>
          <CardContent>
            <CashFlowChart trend={netCashTrend} />
          </CardContent>
        </Card>

        {/* Filters (desktop) */}
        <div className="hidden lg:flex bg-muted/30 rounded-lg p-4 border">
          <ClosingFiltersForm filters={filters} {...filterOptions} formId="closing-filters-desktop" />
        </div>

        {/* Main grid — 70/30 */}
        <div className="grid grid-cols-1 lg:grid-cols-10 gap-6">
          {/* Left column — 70% */}
          <div className="lg:col-span-7 space-y-6">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Lista de Vigilância de Fecho</CardTitle>
                <CardDescription className="text-xs">Itens financeiros que exigem atenção urgente antes do fecho.</CardDescription>
              </CardHeader>
              <CardContent>
                <ClosingWatchlistTable items={watchlist} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Resumo de Controlo Financeiro</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1 text-xs">
                  <p className="font-medium text-muted-foreground">Integridade</p>
                  <p>Crítico: <strong>{controlSummary.integrity.openCritical}</strong> · Alto: <strong>{controlSummary.integrity.openHigh}</strong></p>
                  <p>Médio: <strong>{controlSummary.integrity.openMedium}</strong> · Baixo: <strong>{controlSummary.integrity.openLow}</strong></p>
                </div>
                <div className="space-y-1 text-xs">
                  <p className="font-medium text-muted-foreground">Reconciliação</p>
                  <p>Reconciliados: <strong>{controlSummary.reconciliation.reconciled}</strong></p>
                  <p>Não Reconciliados: <strong>{controlSummary.reconciliation.unreconciled}</strong></p>
                </div>
                <div className="space-y-1 text-xs">
                  <p className="font-medium text-muted-foreground">Recebíveis</p>
                  <p>Em Aberto: <strong>{fmtMzn(controlSummary.receivables.outstanding)}</strong></p>
                  <p>Vencido: <strong>{fmtMzn(controlSummary.receivables.overdue)}</strong> · Vence em Breve: <strong>{fmtMzn(controlSummary.receivables.dueSoon)}</strong></p>
                </div>
                <div className="space-y-1 text-xs">
                  <p className="font-medium text-muted-foreground">Reembolsos</p>
                  <p>Solicitados: <strong>{controlSummary.refunds.requestedCount}</strong> · Aprovados: <strong>{controlSummary.refunds.approvedCount}</strong></p>
                  <p>Concluídos no Período: <strong>{controlSummary.refunds.completedThisPeriodCount}</strong> ({fmtMzn(controlSummary.refunds.completedThisPeriodAmount)})</p>
                </div>
                <div className="space-y-1 text-xs sm:col-span-2">
                  <p className="font-medium text-muted-foreground">Carteira</p>
                  <p>Passivo Total: <strong>{fmtMzn(controlSummary.wallet.totalLiability)}</strong> · Alunos com Crédito: <strong>{controlSummary.wallet.studentsWithCredit}</strong> · Maior Saldo: <strong>{fmtMzn(controlSummary.wallet.largestBalance)}</strong></p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Resumo de Reconciliação</CardTitle>
                <CardDescription className="text-xs">
                  <Link href="/reports/finance/reconciliation" className="underline">Ver relatório completo de reconciliação</Link>
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4 grid-cols-2 sm:grid-cols-3 text-xs">
                <p>Lançamentos em Falta: <strong>{reconciliationSummary.missingLedgerEntries}</strong></p>
                <p>Lançamentos Duplicados: <strong>{reconciliationSummary.duplicateLedgerEntries}</strong></p>
                <p>Lançamentos Órfãos: <strong>{reconciliationSummary.orphanLedgerEntries}</strong></p>
                <p>Divergências de Imputação: <strong>{reconciliationSummary.invoiceAllocationMismatches}</strong></p>
                <p>Divergências de Recibo: <strong>{reconciliationSummary.receiptAmountMismatches}</strong></p>
                <p>Problemas Críticos: <strong>{reconciliationSummary.criticalIssues}</strong></p>
              </CardContent>
            </Card>
          </div>

          {/* Right column — 30% */}
          <div className="lg:col-span-3 space-y-6">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2"><ShieldAlert className="size-4" /> Estado de Integridade</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1 text-xs">
                <p>Crítico: <strong>{controlSummary.integrity.openCritical}</strong></p>
                <p>Alto: <strong>{controlSummary.integrity.openHigh}</strong></p>
                <p>Médio: <strong>{controlSummary.integrity.openMedium}</strong></p>
                <p>Baixo: <strong>{controlSummary.integrity.openLow}</strong></p>
                <Link href="/reports/finance/integrity" className="inline-flex items-center gap-1 text-primary underline mt-2">
                  Ver Integridade <ExternalLink className="size-3" />
                </Link>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2"><Scale className="size-4" /> Estado de Reconciliação</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1 text-xs">
                <p>Divergências: <strong>{reconciliationSummary.mismatchedItems}</strong></p>
                <p>Lançamentos em Falta: <strong>{reconciliationSummary.missingLedgerEntries}</strong></p>
                <p>Duplicados: <strong>{reconciliationSummary.duplicateLedgerEntries}</strong></p>
                <Link href="/reports/finance/reconciliation" className="inline-flex items-center gap-1 text-primary underline mt-2">
                  Ver Reconciliação <ExternalLink className="size-3" />
                </Link>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2"><TrendingUp className="size-4" /> Posição de Caixa</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1 text-xs">
                <p>Posição Líquida: <strong>{fmtMzn(kpis.netCashPosition)}</strong></p>
                <Link href="/reports/finance/cash-flow" className="inline-flex items-center gap-1 text-primary underline mt-2">
                  Ver Fluxo de Caixa <ExternalLink className="size-3" />
                </Link>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2"><FileX className="size-4" /> Estado de Recebíveis</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1 text-xs">
                <p>Em Aberto: <strong>{fmtMzn(controlSummary.receivables.outstanding)}</strong></p>
                <p>Vencido: <strong>{fmtMzn(controlSummary.receivables.overdue)}</strong></p>
                <Link href="/reports/finance/student-debt" className="inline-flex items-center gap-1 text-primary underline mt-2">
                  Ver Dívida de Alunos <ExternalLink className="size-3" />
                </Link>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2"><Wallet className="size-4" /> Passivo de Carteira</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1 text-xs">
                <p>Saldo Total: <strong>{fmtMzn(controlSummary.wallet.totalLiability)}</strong></p>
                <p>Maior Carteira: <strong>{fmtMzn(controlSummary.wallet.largestBalance)}</strong></p>
                <Link href="/reports/finance/wallets" className="inline-flex items-center gap-1 text-primary underline mt-2">
                  Ver Carteiras <ExternalLink className="size-3" />
                </Link>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2"><RefreshCcw className="size-4" /> Exposição a Reembolso</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1 text-xs">
                <p>Pendente: <strong>{fmtMzn(kpis.refundExposure)}</strong></p>
                <p>Solicitados: <strong>{controlSummary.refunds.requestedCount}</strong> · Aprovados: <strong>{controlSummary.refunds.approvedCount}</strong></p>
                <Link href="/reports/finance/refunds" className="inline-flex items-center gap-1 text-primary underline mt-2">
                  Ver Reembolsos <ExternalLink className="size-3" />
                </Link>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2"><Users className="size-4" /> Acesso Rápido</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-2 text-xs">
                <Link href="/reports/finance/integrity" className="text-primary underline">Problemas de Integridade</Link>
                <Link href="/reports/finance/reconciliation" className="text-primary underline">Reconciliação Financeira</Link>
                <Link href="/reports/finance/accounts-receivable" className="text-primary underline">Contas a Receber</Link>
                <Link href="/reports/finance/student-debt" className="text-primary underline">Dívida de Alunos</Link>
                <Link href="/reports/finance/wallets" className="text-primary underline">Extrato de Carteiras</Link>
                <Link href="/reports/finance/refunds" className="text-primary underline">Relatório de Reembolsos</Link>
                <Link href="/reports/finance/cash-flow" className="text-primary underline">Fluxo de Caixa</Link>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
