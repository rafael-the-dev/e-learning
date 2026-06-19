import Link from "next/link";
import { ChevronLeft, TrendingDown, FileText, ReceiptText, Wallet2, Percent, ArrowDownToLine, Crown, UserCog, AlertTriangle } from "lucide-react";
import { PageHeader } from "@/shared/components/layout/page-header";
import { StatCard } from "@/shared/components/layout/stat-card";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/shared/components/ui/card";
import { Button } from "@/shared/components/ui/button";
import { Alert, AlertDescription } from "@/shared/components/ui/alert";
import { requirePermission } from "@/server/auth/context";
import { PERMISSIONS } from "@/server/auth/permissions";
import { getDb } from "@/server/db";
import { getDiscountReport } from "@/modules/reports/finance/services/financial-reports.service";
import { findActiveDiscountRules } from "@/modules/billing/repositories/discount-rule.repository";
import { ExportButton } from "@/modules/reports/finance/components/export-button";
import { DiscountByMonthChart } from "@/modules/reports/finance/components/discount-by-month-chart";
import { DiscountByRuleChart } from "@/modules/reports/finance/components/discount-by-rule-chart";
import { DiscountByBranchChart } from "@/modules/reports/finance/components/discount-by-branch-chart";
import { DiscountByCourseChart } from "@/modules/reports/finance/components/discount-by-course-chart";
import { ManualVsAutomaticDiscountChart } from "@/modules/reports/finance/components/manual-vs-automatic-discount-chart";
import { DiscountWatchlistTable } from "@/modules/reports/finance/components/discount-watchlist-table";
import { DiscountTable } from "@/modules/reports/finance/components/discount-table";
import { INVOICE_STATUS_LABELS } from "@/modules/finance/types";
import { DISCOUNT_TYPE_LABELS } from "@/modules/billing/types";
import type { DiscountReportFilters, DiscountSortBy } from "@/modules/reports/finance/types";

export const metadata = { title: "Descontos e Fuga de Receita" };

async function getFilterOptions(organizationId: string) {
  const db = await getDb();
  const [branches, courses, academicYears, academicTerms, discountRules, users] = await Promise.all([
    db.branch.findMany({ where: { organizationId, deletedAt: null }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    db.course.findMany({ where: { organizationId, deletedAt: null }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    db.academicYear.findMany({ where: { organizationId }, select: { id: true, name: true }, orderBy: { startDate: "desc" } }),
    db.academicTerm.findMany({ where: { organizationId }, select: { id: true, name: true }, orderBy: { startDate: "desc" } }),
    findActiveDiscountRules(organizationId),
    db.user.findMany({ where: { userOrganizations: { some: { organizationId } }, deletedAt: null }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  return { branches, courses, academicYears, academicTerms, discountRules, users };
}

function fmtMzn(value: number): string {
  return `${value.toLocaleString("pt-PT", { minimumFractionDigits: 2 })} MZN`;
}

export default async function DiscountsReportPage({
  searchParams,
}: {
  searchParams: Record<string, string | undefined>;
}) {
  const context = await requirePermission(PERMISSIONS.FINANCIAL_REPORTS_VIEW);
  const { organizationId } = context;

  const page = Math.max(1, parseInt(searchParams.page ?? "1", 10));
  const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.pageSize ?? "20", 10)));

  const filters: DiscountReportFilters = {
    organizationId,
    page,
    pageSize,
    branchId: searchParams.branchId,
    courseId: searchParams.courseId,
    studentId: searchParams.studentId,
    academicYearId: searchParams.academicYearId,
    academicTermId: searchParams.academicTermId,
    dateFrom: searchParams.dateFrom,
    dateTo: searchParams.dateTo,
    discountRuleId: searchParams.discountRuleId,
    discountType: searchParams.discountType,
    invoiceStatus: searchParams.invoiceStatus,
    appliedBy: searchParams.appliedBy,
    minDiscountAmount: searchParams.minDiscountAmount ? parseFloat(searchParams.minDiscountAmount) : undefined,
    sortBy: searchParams.sortBy as DiscountSortBy | undefined,
    sortDir: searchParams.sortDir as "asc" | "desc" | undefined,
  };

  const [report, filterOptions] = await Promise.all([
    getDiscountReport(filters),
    getFilterOptions(organizationId),
  ]);

  const { kpis, watchlist, byMonth, byRule, byBranch, byCourse, hasCriticalIntegrityIssue } = report;

  const exportFilters = Object.fromEntries(
    Object.entries({
      branchId: filters.branchId,
      courseId: filters.courseId,
      studentId: filters.studentId,
      academicYearId: filters.academicYearId,
      academicTermId: filters.academicTermId,
      dateFrom: filters.dateFrom,
      dateTo: filters.dateTo,
      discountRuleId: filters.discountRuleId,
      discountType: filters.discountType,
      invoiceStatus: filters.invoiceStatus,
      appliedBy: filters.appliedBy,
      minDiscountAmount: filters.minDiscountAmount,
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
        title="Descontos e Fuga de Receita"
        description="Análise de descontos aplicados, receita sacrificada e impacto por curso, filial e regra."
        breadcrumb={
          <Link href="/reports/finance" className="flex items-center gap-1 text-muted-foreground hover:text-foreground text-xs">
            <ChevronLeft className="size-3" /> Relatórios Financeiros
          </Link>
        }
        actions={
          <div className="flex items-center gap-2">
            <Button asChild variant="outline" size="sm">
              <Link href="/invoices">Ver Facturas</Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link href="/reports/finance/accounts-receivable">Ver Recebíveis</Link>
            </Button>
            <ExportButton reportType="discounts" filters={exportFilters} />
          </div>
        }
      />
      <div className="p-8 space-y-6">
        {hasCriticalIntegrityIssue && (
          <Alert variant="destructive">
            <AlertTriangle className="size-4" />
            <AlertDescription>
              Existem inconsistências financeiras críticas. Os valores de desconto podem não reflectir a realidade.{" "}
              <Link href="/reports/finance/integrity" className="underline font-medium">
                Ver problemas de integridade
              </Link>
            </AlertDescription>
          </Alert>
        )}

        {/* KPIs */}
        <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
          <StatCard title="Total de Descontos" value={fmtMzn(kpis.totalDiscounts)} icon={<TrendingDown className="size-4" />} />
          <StatCard title="Faturas com Desconto" value={kpis.discountedInvoicesCount} icon={<FileText className="size-4" />} />
          <StatCard title="Total Antes de Descontos" value={fmtMzn(kpis.grossBeforeDiscounts)} icon={<ReceiptText className="size-4" />} />
          <StatCard title="Total Faturado (Líquido)" value={fmtMzn(kpis.netInvoiced)} icon={<Wallet2 className="size-4" />} />
          <StatCard title="Taxa de Fuga de Receita" value={`${kpis.revenueLeakageRate.toFixed(1)}%`} icon={<Percent className="size-4" />} />
          <StatCard title="Desconto Médio por Fatura" value={fmtMzn(kpis.averageDiscountPerInvoice)} icon={<ArrowDownToLine className="size-4" />} />
          <StatCard title="Maior Desconto" value={fmtMzn(kpis.largestDiscount)} icon={<Crown className="size-4" />} />
          <StatCard title="Descontos Manuais" value={`${fmtMzn(kpis.manualDiscountsAmount)} (${kpis.manualDiscountsCount})`} icon={<UserCog className="size-4" />} />
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
            <label className="text-xs font-medium text-muted-foreground">Regra de Desconto</label>
            <select name="discountRuleId" defaultValue={filters.discountRuleId ?? ""} className="h-8 rounded-md border border-input bg-background px-2 text-xs">
              <option value="">Todas</option>
              {filterOptions.discountRules.map((r) => (
                <option key={r.id} value={r.id}>{r.name}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1 min-w-32">
            <label className="text-xs font-medium text-muted-foreground">Tipo de Desconto</label>
            <select name="discountType" defaultValue={filters.discountType ?? ""} className="h-8 rounded-md border border-input bg-background px-2 text-xs">
              <option value="">Todos</option>
              {Object.entries(DISCOUNT_TYPE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
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
          <div className="flex flex-col gap-1 min-w-40">
            <label className="text-xs font-medium text-muted-foreground">Aplicado Por</label>
            <select name="appliedBy" defaultValue={filters.appliedBy ?? ""} className="h-8 rounded-md border border-input bg-background px-2 text-xs">
              <option value="">Todos</option>
              {filterOptions.users.map((u) => (
                <option key={u.id} value={u.id}>{u.name}</option>
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
            <label className="text-xs font-medium text-muted-foreground">Valor Mínimo</label>
            <input type="number" name="minDiscountAmount" defaultValue={filters.minDiscountAmount ?? ""} className="h-8 w-28 rounded-md border border-input bg-background px-2 text-xs" />
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
            <Link href="/reports/finance/discounts">Limpar</Link>
          </Button>
        </form>

        {/* Full-width chart */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Descontos por Mês</CardTitle>
            <CardDescription className="text-xs">Valor de desconto concedido, por mês de aplicação.</CardDescription>
          </CardHeader>
          <CardContent>
            <DiscountByMonthChart rows={byMonth} />
          </CardContent>
        </Card>

        {/* Main grid — 70/30 */}
        <div className="grid grid-cols-1 lg:grid-cols-10 gap-6">
          {/* Left column — 70% */}
          <div className="lg:col-span-7 space-y-6">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Lista de Vigilância de Fuga de Receita</CardTitle>
                <CardDescription className="text-xs">Descontos de valor elevado ou que reduzem fortemente a fatura.</CardDescription>
              </CardHeader>
              <CardContent>
                <DiscountWatchlistTable items={watchlist} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Descontos por Fatura</CardTitle>
              </CardHeader>
              <CardContent>
                <DiscountTable queryString={queryString} pageSize={pageSize} />
              </CardContent>
            </Card>
          </div>

          {/* Right column — 30% */}
          <div className="lg:col-span-3 space-y-6">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Descontos por Regra</CardTitle>
              </CardHeader>
              <CardContent>
                <DiscountByRuleChart rows={byRule} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Descontos por Filial</CardTitle>
              </CardHeader>
              <CardContent>
                <DiscountByBranchChart rows={byBranch} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Descontos por Curso</CardTitle>
              </CardHeader>
              <CardContent>
                <DiscountByCourseChart rows={byCourse} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Manual vs. Automático</CardTitle>
              </CardHeader>
              <CardContent>
                <ManualVsAutomaticDiscountChart
                  manualAmount={kpis.manualDiscountsAmount}
                  automaticAmount={kpis.totalDiscounts - kpis.manualDiscountsAmount}
                />
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
