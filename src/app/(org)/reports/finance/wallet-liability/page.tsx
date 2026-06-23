import Link from "next/link";
import {
  ChevronLeft, Wallet, Users, TrendingUp, ArrowUpCircle, RefreshCcw,
  Clock, ShieldAlert, ExternalLink,
} from "lucide-react";
import { PageHeader } from "@/shared/components/layout/page-header";
import { StatCard } from "@/shared/components/layout/stat-card";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/shared/components/ui/card";
import { Button } from "@/shared/components/ui/button";
import { requirePermissionOrRedirect } from "@/server/auth/context";
import { PERMISSIONS } from "@/server/auth/permissions";
import { getDb } from "@/server/db";
import { getWalletLiabilityReport } from "@/modules/reports/finance/services/financial-reports.service";
import { ExportButton } from "@/modules/reports/finance/components/export-button";
import { WalletLiabilityTrendChart } from "@/modules/reports/finance/components/wallet-liability-trend-chart";
import { CreditsIssuedConsumedChart } from "@/modules/reports/finance/components/credits-issued-consumed-chart";
import { LiabilityByBranchChart } from "@/modules/reports/finance/components/liability-by-branch-chart";
import { LiabilityByCourseChart } from "@/modules/reports/finance/components/liability-by-course-chart";
import { WalletLiabilityWatchlistTable } from "@/modules/reports/finance/components/wallet-liability-watchlist-table";
import { WalletLiabilityTable } from "@/modules/reports/finance/components/wallet-liability-table";
import { WalletIntegrityWarningBanner } from "@/modules/reports/finance/components/wallet-integrity-warning-banner";
import type { WalletLiabilityFilters, WalletLiabilitySortBy } from "@/modules/reports/finance/types";

export const metadata = { title: "Carteiras — Passivo Financeiro" };

async function getFilterOptions(organizationId: string) {
  const db = await getDb();
  const [branches, courses] = await Promise.all([
    db.branch.findMany({ where: { organizationId, deletedAt: null }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    db.course.findMany({ where: { organizationId, deletedAt: null }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  return { branches, courses };
}

function fmtMzn(value: number): string {
  return `${value.toLocaleString("pt-PT", { minimumFractionDigits: 2 })} MZN`;
}

export default async function WalletLiabilityPage({
  searchParams,
}: {
  searchParams: Record<string, string | undefined>;
}) {
  const context = await requirePermissionOrRedirect(PERMISSIONS.FINANCIAL_REPORTS_VIEW);
  const { organizationId } = context;

  const page = Math.max(1, parseInt(searchParams.page ?? "1", 10));
  const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.pageSize ?? "20", 10)));

  const filters: WalletLiabilityFilters = {
    organizationId,
    page,
    pageSize,
    branchId: searchParams.branchId,
    courseId: searchParams.courseId,
    studentId: searchParams.studentId,
    dateFrom: searchParams.dateFrom,
    dateTo: searchParams.dateTo,
    minBalance: searchParams.minBalance ? parseFloat(searchParams.minBalance) : undefined,
    dormantDays: searchParams.dormantDays ? parseInt(searchParams.dormantDays, 10) : undefined,
    includeZeroBalances: searchParams.includeZeroBalances === "true",
    includeNegativeBalances: searchParams.includeNegativeBalances === "true",
    sortBy: searchParams.sortBy as WalletLiabilitySortBy | undefined,
    sortDir: searchParams.sortDir as "asc" | "desc" | undefined,
  };

  const [report, filterOptions] = await Promise.all([
    getWalletLiabilityReport(filters),
    getFilterOptions(organizationId),
  ]);

  const { kpis, watchlist, monthlyTrend, byBranch, byCourse, hasCriticalIntegrityIssue } = report;

  const exportFilters = Object.fromEntries(
    Object.entries({
      branchId: filters.branchId,
      courseId: filters.courseId,
      studentId: filters.studentId,
      dateFrom: filters.dateFrom,
      dateTo: filters.dateTo,
      minBalance: filters.minBalance,
      dormantDays: filters.dormantDays,
      includeZeroBalances: filters.includeZeroBalances ? "true" : undefined,
      includeNegativeBalances: filters.includeNegativeBalances ? "true" : undefined,
      sortBy: filters.sortBy,
      sortDir: filters.sortDir,
    }).filter(([, v]) => v != null)
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
        title="Carteiras — Passivo Financeiro"
        description="Visão do crédito acumulado em carteiras de alunos e exposição financeira da organização."
        breadcrumb={
          <Link href="/reports/finance" className="flex items-center gap-1 text-muted-foreground hover:text-foreground text-xs">
            <ChevronLeft className="size-3" /> Relatórios Financeiros
          </Link>
        }
        actions={
          <div className="flex items-center gap-2">
            <Button asChild variant="outline" size="sm">
              <Link href="/reports/finance/wallets">Ver Actividade de Carteiras</Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link href="/reports/finance/integrity">Ver Integridade</Link>
            </Button>
            <ExportButton reportType="wallet-liability" filters={exportFilters} />
          </div>
        }
      />
      <div className="p-8 space-y-6">
        <WalletIntegrityWarningBanner show={hasCriticalIntegrityIssue} />

        {/* KPIs */}
        <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
          <StatCard title="Passivo Total" value={fmtMzn(kpis.totalLiability)} icon={<Wallet className="size-4" />} />
          <StatCard title="Alunos com Crédito" value={kpis.studentsWithCredit} icon={<Users className="size-4" />} />
          <StatCard title="Saldo Médio Positivo" value={fmtMzn(kpis.averagePositiveBalance)} icon={<TrendingUp className="size-4" />} />
          <StatCard title="Maior Saldo de Carteira" value={fmtMzn(kpis.largestBalance)} icon={<ArrowUpCircle className="size-4" />} />
          <StatCard title="Créditos Emitidos no Período" value={fmtMzn(kpis.creditsIssuedThisPeriod)} icon={<ArrowUpCircle className="size-4" />} />
          <StatCard title="Créditos Consumidos no Período" value={fmtMzn(kpis.creditsConsumedThisPeriod)} icon={<RefreshCcw className="size-4" />} />
          <StatCard title="Movimento Líquido" value={fmtMzn(kpis.netWalletMovement)} icon={<TrendingUp className="size-4" />} />
          <StatCard title="Carteiras Dormentes" value={kpis.dormantWallets} icon={<Clock className="size-4" />} />
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
          <div className="flex flex-col gap-1 min-w-40">
            <label className="text-xs font-medium text-muted-foreground">Curso</label>
            <select name="courseId" defaultValue={filters.courseId ?? ""} className="h-8 rounded-md border border-input bg-background px-2 text-xs">
              <option value="">Todos</option>
              {filterOptions.courses.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1 min-w-32">
            <label className="text-xs font-medium text-muted-foreground">ID do Aluno</label>
            <input type="text" name="studentId" defaultValue={filters.studentId ?? ""} className="h-8 rounded-md border border-input bg-background px-2 text-xs" />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-muted-foreground">Saldo Mínimo</label>
            <input type="number" name="minBalance" defaultValue={filters.minBalance ?? ""} className="h-8 w-28 rounded-md border border-input bg-background px-2 text-xs" />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-muted-foreground">Dias Dormente (mín.)</label>
            <input type="number" name="dormantDays" defaultValue={filters.dormantDays ?? ""} className="h-8 w-28 rounded-md border border-input bg-background px-2 text-xs" />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-muted-foreground">Data De</label>
            <input type="date" name="dateFrom" defaultValue={filters.dateFrom ?? ""} className="h-8 rounded-md border border-input bg-background px-2 text-xs" />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-muted-foreground">Data Até</label>
            <input type="date" name="dateTo" defaultValue={filters.dateTo ?? ""} className="h-8 rounded-md border border-input bg-background px-2 text-xs" />
          </div>
          <label className="flex items-center gap-1.5 text-xs h-8">
            <input type="checkbox" name="includeZeroBalances" value="true" defaultChecked={filters.includeZeroBalances} />
            Incluir saldos zero
          </label>
          <label className="flex items-center gap-1.5 text-xs h-8">
            <input type="checkbox" name="includeNegativeBalances" value="true" defaultChecked={filters.includeNegativeBalances} />
            Incluir saldos negativos
          </label>
          <Button type="submit" size="sm">Filtrar</Button>
          <Button asChild variant="ghost" size="sm">
            <Link href="/reports/finance/wallet-liability">Limpar</Link>
          </Button>
        </form>

        {/* Full-width chart */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Tendência do Passivo de Carteiras</CardTitle>
            <CardDescription className="text-xs">Movimento mensal de créditos/débitos e passivo acumulado.</CardDescription>
          </CardHeader>
          <CardContent>
            <WalletLiabilityTrendChart rows={monthlyTrend} />
          </CardContent>
        </Card>

        {/* Main grid — 70/30 */}
        <div className="grid grid-cols-1 lg:grid-cols-10 gap-6">
          {/* Left column — 70% */}
          <div className="lg:col-span-7 space-y-6">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Lista de Vigilância de Passivo de Carteiras</CardTitle>
                <CardDescription className="text-xs">Saldos negativos, elevados ou dormentes que exigem atenção.</CardDescription>
              </CardHeader>
              <CardContent>
                <WalletLiabilityWatchlistTable items={watchlist} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Passivo de Carteiras por Aluno</CardTitle>
                <CardDescription className="text-xs">Apenas carteiras com saldo positivo, por defeito.</CardDescription>
              </CardHeader>
              <CardContent>
                <WalletLiabilityTable queryString={queryString} pageSize={pageSize} />
              </CardContent>
            </Card>
          </div>

          {/* Right column — 30% */}
          <div className="lg:col-span-3 space-y-6">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Passivo por Filial</CardTitle>
              </CardHeader>
              <CardContent>
                <LiabilityByBranchChart rows={byBranch} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Passivo por Curso</CardTitle>
              </CardHeader>
              <CardContent>
                <LiabilityByCourseChart rows={byCourse} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Créditos Emitidos vs. Consumidos</CardTitle>
              </CardHeader>
              <CardContent>
                <CreditsIssuedConsumedChart rows={monthlyTrend} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2"><ShieldAlert className="size-4" /> Aviso de Integridade</CardTitle>
              </CardHeader>
              <CardContent className="text-xs space-y-2">
                <p className="text-muted-foreground">
                  {hasCriticalIntegrityIssue
                    ? "Existem inconsistências críticas em carteiras que podem afectar estes números."
                    : "Nenhuma inconsistência crítica de carteira em aberto."}
                </p>
                <Link href="/reports/finance/integrity" className="inline-flex items-center gap-1 text-primary underline">
                  Ver Integridade <ExternalLink className="size-3" />
                </Link>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Acesso Rápido</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-2 text-xs">
                <Link href="/reports/finance/wallets" className="text-primary underline">Actividade de Carteiras</Link>
                <Link href="/reports/finance/integrity" className="text-primary underline">Problemas de Integridade</Link>
                <Link href="/reports/finance/student-debt" className="text-primary underline">Dívida de Alunos</Link>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
