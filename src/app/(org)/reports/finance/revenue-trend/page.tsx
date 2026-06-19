import Link from "next/link";
import { ChevronLeft, FileText, Banknote, RefreshCcw, TrendingUp, Percent, FileX } from "lucide-react";
import { PageHeader } from "@/shared/components/layout/page-header";
import { StatCard } from "@/shared/components/layout/stat-card";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/shared/components/ui/card";
import { Button } from "@/shared/components/ui/button";
import { requirePermission } from "@/server/auth/context";
import { PERMISSIONS } from "@/server/auth/permissions";
import { getDb } from "@/server/db";
import { auditService } from "@/modules/audit-logs/services/audit.service";
import { getRevenueTrendReport } from "@/modules/reports/finance/services/financial-reports.service";
import { IntegrityWarningBanner } from "@/modules/reports/finance/components/integrity-warning-banner";
import { ExportButton } from "@/modules/reports/finance/components/export-button";
import { RevenueTrendChart } from "@/modules/reports/finance/components/revenue-trend-chart";
import { BillingCollectionGapChart } from "@/modules/reports/finance/components/billing-collection-gap-chart";
import { CollectionRateChart } from "@/modules/reports/finance/components/collection-rate-chart";
import { RevenueTrendTable } from "@/modules/reports/finance/components/revenue-trend-table";
import type { RevenueTrendFilters } from "@/modules/reports/finance/types";

export const metadata = { title: "Tendência de Receita" };

async function getFilterOptions(organizationId: string) {
  const db = await getDb();
  const [branches, courses, academicYears, academicTerms] = await Promise.all([
    db.branch.findMany({ where: { organizationId, deletedAt: null }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    db.course.findMany({ where: { organizationId, deletedAt: null }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    db.academicYear.findMany({ where: { organizationId }, select: { id: true, name: true }, orderBy: { startDate: "desc" } }),
    db.academicTerm.findMany({ where: { organizationId }, select: { id: true, name: true }, orderBy: { startDate: "desc" } }),
  ]);
  return { branches, courses, academicYears, academicTerms };
}

async function getCriticalCount(organizationId: string) {
  const db = await getDb();
  return db.financialIntegrityIssue.count({ where: { organizationId, severity: "CRITICAL", status: "OPEN" } });
}

function fmtMzn(value: number): string {
  return `${value.toLocaleString("pt-PT", { minimumFractionDigits: 2 })} MZN`;
}

export default async function RevenueTrendPage({
  searchParams,
}: {
  searchParams: Record<string, string | undefined>;
}) {
  const context = await requirePermission(PERMISSIONS.FINANCIAL_REPORTS_VIEW);
  const { organizationId } = context;

  const filters: RevenueTrendFilters = {
    organizationId,
    branchId: searchParams.branchId,
    courseId: searchParams.courseId,
    academicYearId: searchParams.academicYearId,
    academicTermId: searchParams.academicTermId,
    dateFrom: searchParams.dateFrom,
    dateTo: searchParams.dateTo,
  };

  const [report, filterOptions, criticalCount] = await Promise.all([
    getRevenueTrendReport(filters),
    getFilterOptions(organizationId),
    getCriticalCount(organizationId),
  ]);

  try {
    await auditService.log(context, {
      entity: "FinancialReport",
      entityId: "revenue-trend",
      action: "financial_report.viewed",
      newValues: {
        reportType: "revenue-trend",
        filters: {
          branchId: filters.branchId,
          courseId: filters.courseId,
          academicYearId: filters.academicYearId,
          academicTermId: filters.academicTermId,
          dateFrom: filters.dateFrom,
          dateTo: filters.dateTo,
        },
      },
    });
  } catch (err) {
    console.error("[revenue-trend] audit error (non-fatal):", err);
  }

  const { kpis, rows } = report;

  const exportFilters = Object.fromEntries(
    Object.entries({
      branchId: filters.branchId,
      courseId: filters.courseId,
      academicYearId: filters.academicYearId,
      academicTermId: filters.academicTermId,
      dateFrom: filters.dateFrom,
      dateTo: filters.dateTo,
    }).filter(([, v]) => v != null)
  ) as Record<string, string>;

  return (
    <div className="flex flex-col min-h-full">
      <PageHeader
        title="Tendência de Receita"
        description="Evolução mensal entre facturação, cobrança e reembolsos — crescimento, lacunas de cobrança e recebíveis em aberto."
        breadcrumb={
          <Link href="/reports/finance" className="flex items-center gap-1 text-muted-foreground hover:text-foreground text-xs">
            <ChevronLeft className="size-3" /> Relatórios Financeiros
          </Link>
        }
        actions={<ExportButton reportType="revenue-trend" filters={exportFilters} />}
      />
      <div className="p-8 space-y-6">
        <IntegrityWarningBanner criticalCount={criticalCount} />

        {/* KPIs */}
        <div className="grid gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
          <StatCard title="Total Faturado" value={fmtMzn(kpis.totalInvoiced)} icon={<FileText className="size-4" />} />
          <StatCard title="Total Cobrado" value={fmtMzn(kpis.totalCollected)} icon={<Banknote className="size-4" />} />
          <StatCard title="Total Reembolsado" value={fmtMzn(kpis.totalRefunded)} icon={<RefreshCcw className="size-4" />} />
          <StatCard title="Cobrado Líquido" value={fmtMzn(kpis.netCollected)} icon={<TrendingUp className="size-4" />} />
          <StatCard title="Taxa de Cobrança" value={`${kpis.collectionRate.toFixed(1)}%`} icon={<Percent className="size-4" />} />
          <StatCard title="Saldo em Aberto" value={fmtMzn(kpis.outstandingBalance)} icon={<FileX className="size-4" />} />
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
          <div className="flex flex-col gap-1 min-w-36">
            <label className="text-xs font-medium text-muted-foreground">Ano Académico</label>
            <select name="academicYearId" defaultValue={filters.academicYearId ?? ""} className="h-8 rounded-md border border-input bg-background px-2 text-xs">
              <option value="">Todos</option>
              {filterOptions.academicYears.map((y) => (
                <option key={y.id} value={y.id}>{y.name}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1 min-w-36">
            <label className="text-xs font-medium text-muted-foreground">Período Académico</label>
            <select name="academicTermId" defaultValue={filters.academicTermId ?? ""} className="h-8 rounded-md border border-input bg-background px-2 text-xs">
              <option value="">Todos</option>
              {filterOptions.academicTerms.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-muted-foreground">Data De</label>
            <input type="date" name="dateFrom" defaultValue={filters.dateFrom ?? ""} className="h-8 rounded-md border border-input bg-background px-2 text-xs" />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-muted-foreground">Data Até</label>
            <input type="date" name="dateTo" defaultValue={filters.dateTo ?? ""} className="h-8 rounded-md border border-input bg-background px-2 text-xs" />
          </div>
          <Button type="submit" size="sm">Filtrar</Button>
          <Button asChild variant="ghost" size="sm">
            <Link href="/reports/finance/revenue-trend">Limpar</Link>
          </Button>
        </form>

        {/* Chart 1 */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Tendência Mensal de Receita</CardTitle>
            <CardDescription className="text-xs">Faturado, cobrado, cobrado líquido e reembolsado, por mês.</CardDescription>
          </CardHeader>
          <CardContent>
            <RevenueTrendChart rows={rows} />
          </CardContent>
        </Card>

        <div className="grid gap-6 lg:grid-cols-2">
          {/* Chart 2 */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Lacuna entre Facturação e Cobrança</CardTitle>
              <CardDescription className="text-xs">Faturado vs. cobrado, com a diferença em destaque.</CardDescription>
            </CardHeader>
            <CardContent>
              <BillingCollectionGapChart rows={rows} />
            </CardContent>
          </Card>

          {/* Chart 3 */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Tendência da Taxa de Cobrança</CardTitle>
              <CardDescription className="text-xs">Cobrado ÷ Faturado, por mês.</CardDescription>
            </CardHeader>
            <CardContent>
              <CollectionRateChart rows={rows} />
            </CardContent>
          </Card>
        </div>

        {/* Table */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Detalhe Mensal</CardTitle>
          </CardHeader>
          <CardContent>
            <RevenueTrendTable rows={rows} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
