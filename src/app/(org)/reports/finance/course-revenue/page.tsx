import Link from "next/link";
import {
  ChevronLeft, DollarSign, TrendingUp, AlertTriangle, Award, TrendingDown,
} from "lucide-react";
import { PageHeader } from "@/shared/components/layout/page-header";
import { StatCard } from "@/shared/components/layout/stat-card";
import { Button } from "@/shared/components/ui/button";
import { requirePermission } from "@/server/auth/context";
import { PERMISSIONS } from "@/server/auth/permissions";
import { getDb } from "@/server/db";
import { getCourseRevenueReport } from "@/modules/reports/finance/services/financial-reports.service";
import { CourseRevenueTable } from "@/modules/reports/finance/components/course-revenue-table";
import { CourseRevenueCharts } from "@/modules/reports/finance/components/course-revenue-charts";
import { ExportButton } from "@/modules/reports/finance/components/export-button";
import { IntegrityWarningBanner } from "@/modules/reports/finance/components/integrity-warning-banner";
import type { CourseRevenueFilters } from "@/modules/reports/finance/types";

export const metadata = { title: "Receita por Curso" };

async function getFilterOptions(organizationId: string) {
  const db = await getDb();
  const [branches, courses, academicYears] = await Promise.all([
    db.branch.findMany({ where: { organizationId, deletedAt: null }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    db.course.findMany({ where: { organizationId, deletedAt: null }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    db.academicYear.findMany({ where: { organizationId }, select: { id: true, name: true }, orderBy: { startDate: "desc" } }),
  ]);
  return { branches, courses, academicYears };
}

async function getCriticalCount(organizationId: string) {
  const db = await getDb();
  return db.financialIntegrityIssue.count({
    where: { organizationId, severity: "CRITICAL", status: "OPEN" },
  });
}

export default async function CourseRevenuePage({
  searchParams,
}: {
  searchParams: Record<string, string | undefined>;
}) {
  const context = await requirePermission(PERMISSIONS.FINANCIAL_REPORTS_VIEW);
  const { organizationId } = context;

  const filters: CourseRevenueFilters = {
    organizationId,
    branchId: searchParams.branchId,
    courseId: searchParams.courseId,
    academicYearId: searchParams.academicYearId,
    academicTermId: searchParams.academicTermId,
    dateFrom: searchParams.dateFrom,
    dateTo: searchParams.dateTo,
  };

  const [report, filterOptions, criticalCount] = await Promise.all([
    getCourseRevenueReport(filters),
    getFilterOptions(organizationId),
    getCriticalCount(organizationId),
  ]);

  const { kpis, rows, monthlyTrend } = report;

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
        title="Receita por Curso"
        description="Desempenho financeiro por curso — receita, cobrança e dívida."
        breadcrumb={
          <Link href="/reports/finance" className="flex items-center gap-1 text-muted-foreground hover:text-foreground text-xs">
            <ChevronLeft className="size-3" /> Relatórios Financeiros
          </Link>
        }
        actions={<ExportButton reportType="course-revenue" filters={exportFilters} />}
      />
      <div className="p-8 space-y-6">
        <IntegrityWarningBanner criticalCount={criticalCount} />

        {/* KPIs */}
        <div className="grid gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
          <StatCard
            title="Total Faturado"
            value={`${kpis.totalInvoiced.toLocaleString("pt-PT", { minimumFractionDigits: 2 })} MZN`}
            icon={<DollarSign className="size-4" />}
          />
          <StatCard
            title="Total Cobrado"
            value={`${kpis.totalCollected.toLocaleString("pt-PT", { minimumFractionDigits: 2 })} MZN`}
            icon={<TrendingUp className="size-4" />}
          />
          <StatCard
            title="Saldo em Aberto"
            value={`${kpis.outstandingBalance.toLocaleString("pt-PT", { minimumFractionDigits: 2 })} MZN`}
            icon={<AlertTriangle className="size-4" />}
          />
          <StatCard
            title="Taxa Média de Cobrança"
            value={`${kpis.averageCollectionRate.toFixed(1)}%`}
            icon={<TrendingUp className="size-4" />}
          />
          <StatCard
            title="Curso com Mais Receita"
            value={kpis.topRevenueCourseName ?? "—"}
            icon={<Award className="size-4" />}
          />
          <StatCard
            title="Curso com Mais Dívida"
            value={kpis.worstDebtCourseName ?? "—"}
            icon={<TrendingDown className="size-4" />}
            description="maior saldo em aberto"
          />
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
            <label className="text-xs font-medium text-muted-foreground">Ano Lectivo</label>
            <select name="academicYearId" defaultValue={filters.academicYearId ?? ""} className="h-8 rounded-md border border-input bg-background px-2 text-xs">
              <option value="">Todos</option>
              {filterOptions.academicYears.map((y) => (
                <option key={y.id} value={y.id}>{y.name}</option>
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
            <Link href="/reports/finance/course-revenue">Limpar</Link>
          </Button>
        </form>

        {/* Charts */}
        <CourseRevenueCharts rows={rows} monthlyTrend={monthlyTrend} />

        {/* Table */}
        <CourseRevenueTable rows={rows} />
      </div>
    </div>
  );
}
