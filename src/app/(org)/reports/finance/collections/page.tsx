import Link from "next/link";
import {
  ChevronLeft, AlertTriangle, DollarSign, Calendar, CalendarDays, Clock,
} from "lucide-react";
import { PageHeader } from "@/shared/components/layout/page-header";
import { StatCard } from "@/shared/components/layout/stat-card";
import { Button } from "@/shared/components/ui/button";
import { requirePermissionOrRedirect } from "@/server/auth/context";
import { PERMISSIONS } from "@/server/auth/permissions";
import { getDb } from "@/server/db";
import { getCollectionsKPIs } from "@/modules/reports/finance/repositories/collections.repository";
import { CollectionsTable } from "@/modules/reports/finance/components/collections-table";
import { ExportButton } from "@/modules/reports/finance/components/export-button";
import { IntegrityWarningBanner } from "@/modules/reports/finance/components/integrity-warning-banner";
import { INSTALLMENT_STATUS_LABELS } from "@/modules/finance/types";
import type { CollectionsFilters } from "@/modules/reports/finance/types";

export const metadata = { title: "Cobranças / Prestações" };

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

const INSTALLMENT_STATUSES = ["OVERDUE", "PENDING", "PARTIALLY_PAID"];

export default async function CollectionsPage({
  searchParams,
}: {
  searchParams: Record<string, string | undefined>;
}) {
  const context = await requirePermissionOrRedirect(PERMISSIONS.FINANCIAL_REPORTS_VIEW);
  const { organizationId } = context;

  const page = Math.max(1, parseInt(searchParams.page ?? "1", 10));
  const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.pageSize ?? "20", 10)));

  const filters: CollectionsFilters = {
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
    installmentStatus: searchParams.installmentStatus,
    minDaysOverdue: searchParams.minDaysOverdue ? parseInt(searchParams.minDaysOverdue, 10) : undefined,
    maxDaysOverdue: searchParams.maxDaysOverdue ? parseInt(searchParams.maxDaysOverdue, 10) : undefined,
    search: searchParams.search,
  };

  const [kpis, filterOptions, criticalCount] = await Promise.all([
    getCollectionsKPIs(filters),
    getFilterOptions(organizationId),
    getCriticalCount(organizationId),
  ]);

  const exportFilters = Object.fromEntries(
    Object.entries({
      branchId: filters.branchId,
      courseId: filters.courseId,
      dueDateFrom: filters.dueDateFrom,
      dueDateTo: filters.dueDateTo,
      installmentStatus: filters.installmentStatus,
      minDaysOverdue: filters.minDaysOverdue != null ? String(filters.minDaysOverdue) : undefined,
      maxDaysOverdue: filters.maxDaysOverdue != null ? String(filters.maxDaysOverdue) : undefined,
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
        title="Cobranças / Prestações"
        description="Painel operacional de cobranças — prestações vencidas e a vencer."
        breadcrumb={
          <Link href="/reports/finance" className="flex items-center gap-1 text-muted-foreground hover:text-foreground text-xs">
            <ChevronLeft className="size-3" /> Relatórios Financeiros
          </Link>
        }
        actions={<ExportButton reportType="collections" filters={exportFilters} />}
      />
      <div className="p-8 space-y-6">
        <IntegrityWarningBanner criticalCount={criticalCount} />

        {/* KPIs */}
        <div className="grid gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
          <StatCard
            title="Prestações Vencidas"
            value={kpis.overdueInstallments}
            icon={<AlertTriangle className="size-4" />}
          />
          <StatCard
            title="Montante Vencido"
            value={`${kpis.overdueAmount.toLocaleString("pt-PT", { minimumFractionDigits: 2 })} MZN`}
            icon={<DollarSign className="size-4" />}
          />
          <StatCard
            title="Média de Dias em Atraso"
            value={kpis.averageDaysOverdue}
            icon={<Clock className="size-4" />}
            description="dias"
          />
          <StatCard
            title="A Vencer Esta Semana"
            value={kpis.dueThisWeek}
            icon={<CalendarDays className="size-4" />}
            description="prestações"
          />
          <StatCard
            title="A Vencer Este Mês"
            value={kpis.dueThisMonth}
            icon={<Calendar className="size-4" />}
            description="prestações"
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
          <div className="flex flex-col gap-1 min-w-32">
            <label className="text-xs font-medium text-muted-foreground">Estado</label>
            <select name="installmentStatus" defaultValue={filters.installmentStatus ?? ""} className="h-8 rounded-md border border-input bg-background px-2 text-xs">
              <option value="">Todos</option>
              {INSTALLMENT_STATUSES.map((s) => (
                <option key={s} value={s}>{INSTALLMENT_STATUS_LABELS[s] ?? s}</option>
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
          <div className="flex flex-col gap-1 min-w-24">
            <label className="text-xs font-medium text-muted-foreground">Atraso Mín. (dias)</label>
            <input
              type="number"
              name="minDaysOverdue"
              defaultValue={filters.minDaysOverdue ?? ""}
              min={0}
              placeholder="0"
              className="h-8 rounded-md border border-input bg-background px-2 text-xs"
            />
          </div>
          <div className="flex flex-col gap-1 min-w-24">
            <label className="text-xs font-medium text-muted-foreground">Atraso Máx. (dias)</label>
            <input
              type="number"
              name="maxDaysOverdue"
              defaultValue={filters.maxDaysOverdue ?? ""}
              min={0}
              placeholder="∞"
              className="h-8 rounded-md border border-input bg-background px-2 text-xs"
            />
          </div>
          <div className="flex flex-col gap-1 flex-1 min-w-40">
            <label className="text-xs font-medium text-muted-foreground">Pesquisar</label>
            <input type="text" name="search" defaultValue={filters.search ?? ""} placeholder="Aluno, nº fatura..." className="h-8 rounded-md border border-input bg-background px-2 text-xs" />
          </div>
          <Button type="submit" size="sm">Filtrar</Button>
          <Button asChild variant="ghost" size="sm">
            <Link href="/reports/finance/collections">Limpar</Link>
          </Button>
        </form>

        <CollectionsTable queryString={queryString} />
      </div>
    </div>
  );
}
