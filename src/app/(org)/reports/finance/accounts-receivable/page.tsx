import Link from "next/link";
import { ChevronLeft, FileText, AlertTriangle, TrendingDown, Users, Ban } from "lucide-react";
import { PageHeader } from "@/shared/components/layout/page-header";
import { StatCard } from "@/shared/components/layout/stat-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui/card";
import { Button } from "@/shared/components/ui/button";
import { requirePermission } from "@/server/auth/context";
import { PERMISSIONS } from "@/server/auth/permissions";
import { getDb } from "@/server/db";
import { getAccountsReceivableReport } from "@/modules/reports/finance/services/financial-reports.service";
import { AccountsReceivableTable } from "@/modules/reports/finance/components/accounts-receivable-table";
import { AgingBucketsChart } from "@/modules/reports/finance/components/aging-buckets-chart";
import { ExportButton } from "@/modules/reports/finance/components/export-button";
import { IntegrityWarningBanner } from "@/modules/reports/finance/components/integrity-warning-banner";
import { getAgingKPIs } from "@/modules/reports/finance/repositories/aging.repository";
import type { AccountsReceivableFilters } from "@/modules/reports/finance/types";

export const metadata = { title: "Contas a Receber" };

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

export default async function AccountsReceivablePage({
  searchParams,
}: {
  searchParams: Record<string, string | undefined>;
}) {
  const context = await requirePermission(PERMISSIONS.FINANCIAL_REPORTS_VIEW);
  const { organizationId } = context;

  const page = Math.max(1, parseInt(searchParams.page ?? "1", 10));
  const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.pageSize ?? "20", 10)));

  const filters: AccountsReceivableFilters = {
    organizationId,
    page,
    pageSize,
    branchId: searchParams.branchId,
    courseId: searchParams.courseId,
    studentId: searchParams.studentId,
    academicYearId: searchParams.academicYearId,
    dateFrom: searchParams.dateFrom,
    dateTo: searchParams.dateTo,
    dueDateFrom: searchParams.dueDateFrom,
    dueDateTo: searchParams.dueDateTo,
    invoiceStatus: searchParams.invoiceStatus,
    agingBucket: searchParams.agingBucket as AccountsReceivableFilters["agingBucket"],
    search: searchParams.search,
  };

  const [report, { buckets }, filterOptions, criticalCount] = await Promise.all([
    getAccountsReceivableReport(filters),
    getAgingKPIs(filters),
    getFilterOptions(organizationId),
    getCriticalCount(organizationId),
  ]);

  const { kpis } = report;

  const exportFilters = Object.fromEntries(
    Object.entries({
      branchId: filters.branchId,
      courseId: filters.courseId,
      studentId: filters.studentId,
      dateFrom: filters.dateFrom,
      dateTo: filters.dateTo,
      dueDateFrom: filters.dueDateFrom,
      dueDateTo: filters.dueDateTo,
      invoiceStatus: filters.invoiceStatus,
      agingBucket: filters.agingBucket,
      search: filters.search,
    }).filter(([, v]) => v != null)
  ) as Record<string, string>;

  // Build query string for client component
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
        title="Contas a Receber"
        breadcrumb={
          <Link href="/reports/finance" className="flex items-center gap-1 text-muted-foreground hover:text-foreground text-xs">
            <ChevronLeft className="size-3" /> Relatórios Financeiros
          </Link>
        }
        actions={
          <ExportButton reportType="accounts-receivable" filters={exportFilters} />
        }
      />
      <div className="p-8 space-y-6">
        <IntegrityWarningBanner criticalCount={criticalCount} />

        {/* KPIs */}
        <div className="grid gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
          <StatCard
            title="Total a Receber"
            value={`${kpis.totalReceivable.toLocaleString("pt-PT", { minimumFractionDigits: 2 })} MZN`}
            icon={<FileText className="size-4" />}
          />
          <StatCard
            title="Em Atraso"
            value={`${kpis.overdueReceivable.toLocaleString("pt-PT", { minimumFractionDigits: 2 })} MZN`}
            icon={<AlertTriangle className="size-4" />}
          />
          <StatCard
            title="Vence em Breve"
            value={`${kpis.dueSoon.toLocaleString("pt-PT", { minimumFractionDigits: 2 })} MZN`}
            icon={<TrendingDown className="size-4" />}
          />
          <StatCard
            title="Parcialmente Pago"
            value={kpis.partiallyPaid}
            icon={<Ban className="size-4" />}
            description="faturas"
          />
          <StatCard
            title="Alunos c/ Dívida"
            value={kpis.studentsWithDebt}
            icon={<Users className="size-4" />}
          />
          <StatCard
            title="Total Faturas"
            value={kpis.invoiceCount}
            description="em aberto"
          />
        </div>

        {/* Aging buckets bar chart */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Distribuição por Escalão de Atraso</CardTitle>
          </CardHeader>
          <CardContent>
            <AgingBucketsChart buckets={buckets} />
          </CardContent>
        </Card>

        {/* Filters section */}
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
          <div className="flex flex-col gap-1 min-w-28">
            <label className="text-xs font-medium text-muted-foreground">Escalão</label>
            <select name="agingBucket" defaultValue={filters.agingBucket ?? ""} className="h-8 rounded-md border border-input bg-background px-2 text-xs">
              <option value="">Todos</option>
              <option value="current">Corrente</option>
              <option value="1-30">1–30 dias</option>
              <option value="31-60">31–60 dias</option>
              <option value="61-90">61–90 dias</option>
              <option value="90+">90+ dias</option>
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-muted-foreground">Data De</label>
            <input type="date" name="dueDateFrom" defaultValue={filters.dueDateFrom ?? ""} className="h-8 rounded-md border border-input bg-background px-2 text-xs" />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-muted-foreground">Data Até</label>
            <input type="date" name="dueDateTo" defaultValue={filters.dueDateTo ?? ""} className="h-8 rounded-md border border-input bg-background px-2 text-xs" />
          </div>
          <div className="flex flex-col gap-1 flex-1 min-w-40">
            <label className="text-xs font-medium text-muted-foreground">Pesquisar</label>
            <input type="text" name="search" defaultValue={filters.search ?? ""} placeholder="Nº fatura, aluno..." className="h-8 rounded-md border border-input bg-background px-2 text-xs" />
          </div>
          <Button type="submit" size="sm">Filtrar</Button>
          <Button asChild variant="ghost" size="sm">
            <Link href="/reports/finance/accounts-receivable">Limpar</Link>
          </Button>
        </form>

        {/* Table */}
        <AccountsReceivableTable queryString={queryString} />
      </div>
    </div>
  );
}
