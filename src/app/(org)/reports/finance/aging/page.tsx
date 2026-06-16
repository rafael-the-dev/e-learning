import Link from "next/link";
import { ChevronLeft, Clock, DollarSign } from "lucide-react";
import { PageHeader } from "@/shared/components/layout/page-header";
import { StatCard } from "@/shared/components/layout/stat-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui/card";
import { Button } from "@/shared/components/ui/button";
import { requirePermission } from "@/server/auth/context";
import { PERMISSIONS } from "@/server/auth/permissions";
import { getDb } from "@/server/db";
import { getAgingKPIs } from "@/modules/reports/finance/repositories/aging.repository";
import { AgingBucketsChart } from "@/modules/reports/finance/components/aging-buckets-chart";
import { AgingTable } from "@/modules/reports/finance/components/aging-table";
import { ExportButton } from "@/modules/reports/finance/components/export-button";
import { IntegrityWarningBanner } from "@/modules/reports/finance/components/integrity-warning-banner";
import type { AgingFilters } from "@/modules/reports/finance/types";

export const metadata = { title: "Análise de Aging" };

async function getFilterOptions(organizationId: string) {
  const db = await getDb();
  const branches = await db.branch.findMany({
    where: { organizationId, deletedAt: null },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
  return { branches };
}

async function getCriticalCount(organizationId: string) {
  const db = await getDb();
  return db.financialIntegrityIssue.count({
    where: { organizationId, severity: "CRITICAL", status: "OPEN" },
  });
}

export default async function AgingPage({
  searchParams,
}: {
  searchParams: Record<string, string | undefined>;
}) {
  const context = await requirePermission(PERMISSIONS.FINANCIAL_REPORTS_VIEW);
  const { organizationId } = context;

  const filters: Omit<AgingFilters, "page" | "pageSize"> = {
    organizationId,
    branchId: searchParams.branchId,
    courseId: searchParams.courseId,
    agingBucket: searchParams.agingBucket as AgingFilters["agingBucket"],
    search: searchParams.search,
  };

  const [{ kpis, buckets }, filterOptions, criticalCount] = await Promise.all([
    getAgingKPIs(filters),
    getFilterOptions(organizationId),
    getCriticalCount(organizationId),
  ]);

  const exportFilters = Object.fromEntries(
    Object.entries({ branchId: filters.branchId, courseId: filters.courseId, agingBucket: filters.agingBucket, search: filters.search }).filter(([, v]) => v != null)
  ) as Record<string, string>;

  const queryParams = new URLSearchParams();
  for (const [k, v] of Object.entries(filters)) {
    if (v != null && k !== "organizationId") queryParams.set(k, String(v));
  }
  const queryString = queryParams.toString();

  return (
    <div className="flex flex-col min-h-full">
      <PageHeader
        title="Análise de Aging"
        description="Antiguidade da dívida por escalão temporal."
        breadcrumb={
          <Link href="/reports/finance" className="flex items-center gap-1 text-muted-foreground hover:text-foreground text-xs">
            <ChevronLeft className="size-3" /> Relatórios Financeiros
          </Link>
        }
        actions={<ExportButton reportType="aging" filters={exportFilters} />}
      />
      <div className="p-8 space-y-6">
        <IntegrityWarningBanner criticalCount={criticalCount} />

        {/* KPIs */}
        <div className="grid gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
          <StatCard
            title="Total em Dívida"
            value={`${kpis.totalOutstanding.toLocaleString("pt-PT", { minimumFractionDigits: 0 })} MZN`}
            icon={<DollarSign className="size-4" />}
          />
          <StatCard title="Corrente" value={`${kpis.current.toLocaleString("pt-PT", { minimumFractionDigits: 0 })} MZN`} description="não vencido" />
          <StatCard title="1–30 dias" value={`${kpis.bucket1to30.toLocaleString("pt-PT", { minimumFractionDigits: 0 })} MZN`} />
          <StatCard title="31–60 dias" value={`${kpis.bucket31to60.toLocaleString("pt-PT", { minimumFractionDigits: 0 })} MZN`} />
          <StatCard title="61–90 dias" value={`${kpis.bucket61to90.toLocaleString("pt-PT", { minimumFractionDigits: 0 })} MZN`} />
          <StatCard title="Mais de 90 dias" value={`${kpis.bucket90plus.toLocaleString("pt-PT", { minimumFractionDigits: 0 })} MZN`} icon={<Clock className="size-4" />} />
        </div>

        {/* Aging chart */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Saldo por Escalão de Atraso</CardTitle>
          </CardHeader>
          <CardContent>
            <AgingBucketsChart buckets={buckets} />
          </CardContent>
        </Card>

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
          <div className="flex flex-col gap-1 flex-1 min-w-40">
            <label className="text-xs font-medium text-muted-foreground">Pesquisar</label>
            <input type="text" name="search" defaultValue={filters.search ?? ""} placeholder="Nº fatura, aluno..." className="h-8 rounded-md border border-input bg-background px-2 text-xs" />
          </div>
          <Button type="submit" size="sm">Filtrar</Button>
          <Button asChild variant="ghost" size="sm"><Link href="/reports/finance/aging">Limpar</Link></Button>
        </form>

        <AgingTable queryString={queryString} />
      </div>
    </div>
  );
}
