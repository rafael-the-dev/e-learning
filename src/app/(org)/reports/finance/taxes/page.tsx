import Link from "next/link";
import { ChevronLeft, Receipt, Layers, FileText, FileCheck2, Percent, FileX, AlertTriangle } from "lucide-react";
import { PageHeader } from "@/shared/components/layout/page-header";
import { StatCard } from "@/shared/components/layout/stat-card";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/shared/components/ui/card";
import { Button } from "@/shared/components/ui/button";
import { Alert, AlertDescription } from "@/shared/components/ui/alert";
import { requirePermissionOrRedirect } from "@/server/auth/context";
import { PERMISSIONS } from "@/server/auth/permissions";
import { getDb } from "@/server/db";
import { getTaxReport } from "@/modules/reports/finance/services/financial-reports.service";
import { findActiveTaxRules } from "@/modules/billing/repositories/tax-rule.repository";
import { ExportButton } from "@/modules/reports/finance/components/export-button";
import { TaxByMonthChart } from "@/modules/reports/finance/components/tax-by-month-chart";
import { TaxByRuleChart } from "@/modules/reports/finance/components/tax-by-rule-chart";
import { TaxByBranchChart } from "@/modules/reports/finance/components/tax-by-branch-chart";
import { EffectiveTaxRateChart } from "@/modules/reports/finance/components/effective-tax-rate-chart";
import { TaxTable } from "@/modules/reports/finance/components/tax-table";
import { INVOICE_STATUS_LABELS } from "@/modules/finance/types";
import type { TaxReportFilters, TaxSortBy } from "@/modules/reports/finance/types";

export const metadata = { title: "Relatório de Impostos" };

async function getFilterOptions(organizationId: string) {
  const db = await getDb();
  const [branches, courses, academicYears, academicTerms, taxRules] = await Promise.all([
    db.branch.findMany({ where: { organizationId, deletedAt: null }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    db.course.findMany({ where: { organizationId, deletedAt: null }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    db.academicYear.findMany({ where: { organizationId }, select: { id: true, name: true }, orderBy: { startDate: "desc" } }),
    db.academicTerm.findMany({ where: { organizationId }, select: { id: true, name: true }, orderBy: { startDate: "desc" } }),
    findActiveTaxRules(organizationId),
  ]);
  return { branches, courses, academicYears, academicTerms, taxRules };
}

async function getCriticalCount(organizationId: string) {
  const db = await getDb();
  return db.financialIntegrityIssue.count({
    where: { organizationId, severity: "CRITICAL", status: "OPEN", category: "INVOICE_BALANCE" },
  });
}

function fmtMzn(value: number): string {
  return `${value.toLocaleString("pt-PT", { minimumFractionDigits: 2 })} MZN`;
}

export default async function TaxesReportPage({
  searchParams,
}: {
  searchParams: Record<string, string | undefined>;
}) {
  const context = await requirePermissionOrRedirect(PERMISSIONS.FINANCIAL_REPORTS_VIEW);
  const { organizationId } = context;

  const page = Math.max(1, parseInt(searchParams.page ?? "1", 10));
  const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.pageSize ?? "20", 10)));

  const filters: TaxReportFilters = {
    organizationId,
    page,
    pageSize,
    branchId: searchParams.branchId,
    courseId: searchParams.courseId,
    academicYearId: searchParams.academicYearId,
    academicTermId: searchParams.academicTermId,
    dateFrom: searchParams.dateFrom,
    dateTo: searchParams.dateTo,
    taxRuleId: searchParams.taxRuleId,
    invoiceStatus: searchParams.invoiceStatus,
    sortBy: searchParams.sortBy as TaxSortBy | undefined,
    sortDir: searchParams.sortDir as "asc" | "desc" | undefined,
  };

  const [report, filterOptions, criticalCount] = await Promise.all([
    getTaxReport(filters),
    getFilterOptions(organizationId),
    getCriticalCount(organizationId),
  ]);

  const { kpis, byRule, byBranch, monthlyTrend, hasCriticalIntegrityIssue } = report;

  const exportFilters = Object.fromEntries(
    Object.entries({
      branchId: filters.branchId,
      courseId: filters.courseId,
      academicYearId: filters.academicYearId,
      academicTermId: filters.academicTermId,
      dateFrom: filters.dateFrom,
      dateTo: filters.dateTo,
      taxRuleId: filters.taxRuleId,
      invoiceStatus: filters.invoiceStatus,
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
        title="Relatório de Impostos"
        description="Imposto cobrado e exposição fiscal por período, regra fiscal, filial e fatura."
        breadcrumb={
          <Link href="/reports/finance" className="flex items-center gap-1 text-muted-foreground hover:text-foreground text-xs">
            <ChevronLeft className="size-3" /> Relatórios Financeiros
          </Link>
        }
        actions={<ExportButton reportType="taxes" filters={exportFilters} />}
      />
      <div className="p-8 space-y-6">
        {hasCriticalIntegrityIssue && (
          <Alert variant="destructive">
            <AlertTriangle className="size-4" />
            <AlertDescription>
              Existem inconsistências críticas no cálculo de faturas. Os valores de imposto podem não reflectir a realidade.{" "}
              <Link href="/reports/finance/integrity" className="underline font-medium">
                Ver problemas de integridade
              </Link>
            </AlertDescription>
          </Alert>
        )}

        {/* KPIs */}
        <div className="grid gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
          <StatCard title="Total de Imposto" value={fmtMzn(kpis.totalTaxAmount)} icon={<Receipt className="size-4" />} />
          <StatCard title="Base Tributável" value={fmtMzn(kpis.taxableBase)} icon={<Layers className="size-4" />} />
          <StatCard title="Total Faturado" value={fmtMzn(kpis.grossInvoiced)} icon={<FileText className="size-4" />} />
          <StatCard title="Faturas com Imposto" value={kpis.taxedInvoicesCount} icon={<FileCheck2 className="size-4" />} />
          <StatCard title="Taxa Efectiva Média" value={`${kpis.averageEffectiveTaxRate.toFixed(1)}%`} icon={<Percent className="size-4" />} />
          <StatCard title="Isento / Sem Imposto" value={fmtMzn(kpis.exemptAmount)} icon={<FileX className="size-4" />} />
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
          <div className="flex flex-col gap-1 min-w-40">
            <label className="text-xs font-medium text-muted-foreground">Regra Fiscal</label>
            <select name="taxRuleId" defaultValue={filters.taxRuleId ?? ""} className="h-8 rounded-md border border-input bg-background px-2 text-xs">
              <option value="">Todas</option>
              {filterOptions.taxRules.map((t) => (
                <option key={t.id} value={t.id}>{t.name} ({t.rate}%)</option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1 min-w-32">
            <label className="text-xs font-medium text-muted-foreground">Estado da Fatura</label>
            <select name="invoiceStatus" defaultValue={filters.invoiceStatus ?? ""} className="h-8 rounded-md border border-input bg-background px-2 text-xs">
              <option value="">Todos (excl. cancelados)</option>
              {Object.entries(INVOICE_STATUS_LABELS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
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
            <Link href="/reports/finance/taxes">Limpar</Link>
          </Button>
        </form>

        {/* Chart 1 — full width */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Imposto por Mês</CardTitle>
            <CardDescription className="text-xs">Imposto cobrado e base tributável, por mês de emissão.</CardDescription>
          </CardHeader>
          <CardContent>
            <TaxByMonthChart rows={monthlyTrend} />
          </CardContent>
        </Card>

        <div className="grid gap-6 lg:grid-cols-3">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Imposto por Regra Fiscal</CardTitle>
            </CardHeader>
            <CardContent>
              <TaxByRuleChart rows={byRule} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Imposto por Filial</CardTitle>
            </CardHeader>
            <CardContent>
              <TaxByBranchChart rows={byBranch} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Tendência da Taxa Efectiva</CardTitle>
              <CardDescription className="text-xs">Imposto ÷ base tributável, por mês.</CardDescription>
            </CardHeader>
            <CardContent>
              <EffectiveTaxRateChart rows={monthlyTrend} />
            </CardContent>
          </Card>
        </div>

        {/* Table */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Impostos por Fatura</CardTitle>
          </CardHeader>
          <CardContent>
            <TaxTable queryString={queryString} pageSize={pageSize} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
