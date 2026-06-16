import Link from "next/link";
import {
  ChevronLeft, Users, TrendingDown, AlertCircle, User, Clock,
} from "lucide-react";
import { PageHeader } from "@/shared/components/layout/page-header";
import { StatCard } from "@/shared/components/layout/stat-card";
import { Button } from "@/shared/components/ui/button";
import { requirePermission } from "@/server/auth/context";
import { PERMISSIONS } from "@/server/auth/permissions";
import { getDb } from "@/server/db";
import { getStudentDebtKPIs } from "@/modules/reports/finance/repositories/student-debt.repository";
import { StudentDebtTable } from "@/modules/reports/finance/components/student-debt-table";
import { ExportButton } from "@/modules/reports/finance/components/export-button";
import { IntegrityWarningBanner } from "@/modules/reports/finance/components/integrity-warning-banner";
import type { StudentDebtFilters } from "@/modules/reports/finance/types";

export const metadata = { title: "Dívida de Alunos" };

async function getFilterOptions(organizationId: string) {
  const db = await getDb();
  const [branches, courses] = await Promise.all([
    db.branch.findMany({ where: { organizationId, deletedAt: null }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    db.course.findMany({ where: { organizationId, deletedAt: null }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  return { branches, courses };
}

async function getCriticalCount(organizationId: string) {
  const db = await getDb();
  return db.financialIntegrityIssue.count({
    where: { organizationId, severity: "CRITICAL", status: "OPEN" },
  });
}

export default async function StudentDebtPage({
  searchParams,
}: {
  searchParams: Record<string, string | undefined>;
}) {
  const context = await requirePermission(PERMISSIONS.FINANCIAL_REPORTS_VIEW);
  const { organizationId } = context;

  const page = Math.max(1, parseInt(searchParams.page ?? "1", 10));
  const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.pageSize ?? "20", 10)));

  const filters: StudentDebtFilters = {
    organizationId,
    page,
    pageSize,
    branchId: searchParams.branchId,
    courseId: searchParams.courseId,
    studentId: searchParams.studentId,
    dateFrom: searchParams.dateFrom,
    dateTo: searchParams.dateTo,
    dueDateFrom: searchParams.dueDateFrom,
    dueDateTo: searchParams.dueDateTo,
    overdueOnly: searchParams.overdueOnly === "true",
    minBalance: searchParams.minBalance ? parseFloat(searchParams.minBalance) : undefined,
    search: searchParams.search,
  };

  const [kpis, filterOptions, criticalCount] = await Promise.all([
    getStudentDebtKPIs(filters),
    getFilterOptions(organizationId),
    getCriticalCount(organizationId),
  ]);

  const exportFilters = Object.fromEntries(
    Object.entries({
      branchId: filters.branchId,
      courseId: filters.courseId,
      dateFrom: filters.dateFrom,
      dateTo: filters.dateTo,
      dueDateFrom: filters.dueDateFrom,
      dueDateTo: filters.dueDateTo,
      overdueOnly: filters.overdueOnly ? "true" : undefined,
      minBalance: filters.minBalance ? String(filters.minBalance) : undefined,
      search: filters.search,
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
        title="Dívida de Alunos"
        description="Vista consolidada por aluno — quem deve mais e há quanto tempo."
        breadcrumb={
          <Link href="/reports/finance" className="flex items-center gap-1 text-muted-foreground hover:text-foreground text-xs">
            <ChevronLeft className="size-3" /> Relatórios Financeiros
          </Link>
        }
        actions={<ExportButton reportType="student-debt" filters={exportFilters} />}
      />
      <div className="p-8 space-y-6">
        <IntegrityWarningBanner criticalCount={criticalCount} />

        {/* KPIs */}
        <div className="grid gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
          <StatCard
            title="Total em Aberto"
            value={`${kpis.totalOutstanding.toLocaleString("pt-PT", { minimumFractionDigits: 2 })} MZN`}
            icon={<TrendingDown className="size-4" />}
          />
          <StatCard
            title="Saldo Vencido"
            value={`${kpis.overdueOutstanding.toLocaleString("pt-PT", { minimumFractionDigits: 2 })} MZN`}
            icon={<AlertCircle className="size-4" />}
          />
          <StatCard
            title="Alunos com Dívida"
            value={kpis.studentsWithDebt}
            icon={<Users className="size-4" />}
          />
          <StatCard
            title="Maior Devedor"
            value={`${kpis.largestDebtorBalance.toLocaleString("pt-PT", { minimumFractionDigits: 2 })} MZN`}
            icon={<User className="size-4" />}
          />
          <StatCard
            title="Máx. Dias em Atraso"
            value={kpis.longestOverdueDays}
            icon={<Clock className="size-4" />}
            description="dias"
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
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-muted-foreground">Venc. De</label>
            <input type="date" name="dueDateFrom" defaultValue={filters.dueDateFrom ?? ""} className="h-8 rounded-md border border-input bg-background px-2 text-xs" />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-muted-foreground">Venc. Até</label>
            <input type="date" name="dueDateTo" defaultValue={filters.dueDateTo ?? ""} className="h-8 rounded-md border border-input bg-background px-2 text-xs" />
          </div>
          <div className="flex flex-col gap-1 min-w-28">
            <label className="text-xs font-medium text-muted-foreground">Saldo Mín.</label>
            <input
              type="number"
              name="minBalance"
              defaultValue={filters.minBalance ?? ""}
              min={0}
              step={0.01}
              placeholder="0.00"
              className="h-8 rounded-md border border-input bg-background px-2 text-xs"
            />
          </div>
          <div className="flex flex-col gap-1 flex-1 min-w-40">
            <label className="text-xs font-medium text-muted-foreground">Pesquisar</label>
            <input type="text" name="search" defaultValue={filters.search ?? ""} placeholder="Nome, código..." className="h-8 rounded-md border border-input bg-background px-2 text-xs" />
          </div>
          <div className="flex items-center gap-2 self-end pb-1">
            <input
              type="checkbox"
              id="overdueOnly"
              name="overdueOnly"
              value="true"
              defaultChecked={filters.overdueOnly}
              className="h-4 w-4 rounded border-input"
            />
            <label htmlFor="overdueOnly" className="text-xs font-medium text-muted-foreground whitespace-nowrap">
              Apenas vencidos
            </label>
          </div>
          <Button type="submit" size="sm">Filtrar</Button>
          <Button asChild variant="ghost" size="sm">
            <Link href="/reports/finance/student-debt">Limpar</Link>
          </Button>
        </form>

        <StudentDebtTable queryString={queryString} />
      </div>
    </div>
  );
}
