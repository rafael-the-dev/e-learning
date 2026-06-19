import Link from "next/link";
import {
  ChevronLeft, RefreshCcw, FileText, Percent, Calculator, Crown, AlertTriangle, XCircle, Timer,
} from "lucide-react";
import { PageHeader } from "@/shared/components/layout/page-header";
import { StatCard } from "@/shared/components/layout/stat-card";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/shared/components/ui/card";
import { Button } from "@/shared/components/ui/button";
import { Alert, AlertDescription } from "@/shared/components/ui/alert";
import { requirePermission } from "@/server/auth/context";
import { PERMISSIONS } from "@/server/auth/permissions";
import { getDb } from "@/server/db";
import { getRefundAnalysisReport } from "@/modules/reports/finance/services/financial-reports.service";
import { ExportButton } from "@/modules/reports/finance/components/export-button";
import { RefundTrendChart } from "@/modules/reports/finance/components/refund-trend-chart";
import { RefundAmountTrendChart } from "@/modules/reports/finance/components/refund-amount-trend-chart";
import { RefundByBranchChart } from "@/modules/reports/finance/components/refund-by-branch-chart";
import { RefundByCourseChart } from "@/modules/reports/finance/components/refund-by-course-chart";
import { RefundByStatusChart } from "@/modules/reports/finance/components/refund-by-status-chart";
import { RefundProcessingTimeChart } from "@/modules/reports/finance/components/refund-processing-time-chart";
import { RefundWatchlistTable } from "@/modules/reports/finance/components/refund-watchlist-table";
import { RefundAnalysisTable } from "@/modules/reports/finance/components/refund-analysis-table";
import { REFUND_STATUS_LABELS } from "@/modules/finance/types";
import type { RefundAnalysisFilters, RefundAnalysisSortBy } from "@/modules/reports/finance/types";

export const metadata = { title: "Análise de Reembolsos" };

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

function fmtMzn(value: number): string {
  return `${value.toLocaleString("pt-PT", { minimumFractionDigits: 2 })} MZN`;
}

export default async function RefundAnalysisPage({
  searchParams,
}: {
  searchParams: Record<string, string | undefined>;
}) {
  const context = await requirePermission(PERMISSIONS.FINANCIAL_REPORTS_VIEW);
  const { organizationId } = context;

  const page = Math.max(1, parseInt(searchParams.page ?? "1", 10));
  const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.pageSize ?? "20", 10)));

  const filters: RefundAnalysisFilters = {
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
    status: searchParams.status,
    minAmount: searchParams.minAmount ? parseFloat(searchParams.minAmount) : undefined,
    sortBy: searchParams.sortBy as RefundAnalysisSortBy | undefined,
    sortDir: searchParams.sortDir as "asc" | "desc" | undefined,
  };

  const [report, filterOptions] = await Promise.all([
    getRefundAnalysisReport(filters),
    getFilterOptions(organizationId),
  ]);

  const { kpis, watchlist, trend, amountTrend, byBranch, byCourse, byStatus, processingTimeTrend, hasCriticalIntegrityIssue } = report;

  const exportFilters = Object.fromEntries(
    Object.entries({
      branchId: filters.branchId,
      courseId: filters.courseId,
      studentId: filters.studentId,
      academicYearId: filters.academicYearId,
      academicTermId: filters.academicTermId,
      dateFrom: filters.dateFrom,
      dateTo: filters.dateTo,
      status: filters.status,
      minAmount: filters.minAmount,
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
        title="Análise de Reembolsos"
        description="Tendências, exposição financeira e desempenho operacional dos reembolsos."
        breadcrumb={
          <Link href="/reports/finance" className="flex items-center gap-1 text-muted-foreground hover:text-foreground text-xs">
            <ChevronLeft className="size-3" /> Relatórios Financeiros
          </Link>
        }
        actions={
          <div className="flex items-center gap-2">
            <Button asChild variant="outline" size="sm">
              <Link href="/reports/finance/refunds">Ver Lista de Reembolsos</Link>
            </Button>
            <ExportButton reportType="refund-analysis" filters={exportFilters} />
          </div>
        }
      />
      <div className="p-8 space-y-6">
        {hasCriticalIntegrityIssue && (
          <Alert variant="destructive">
            <AlertTriangle className="size-4" />
            <AlertDescription>
              Existem inconsistências financeiras críticas. Os números de reembolsos podem não reflectir a realidade.{" "}
              <Link href="/reports/finance/integrity" className="underline font-medium">
                Ver problemas de integridade
              </Link>
            </AlertDescription>
          </Alert>
        )}

        {/* KPIs */}
        <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
          <StatCard title="Total Reembolsado" value={fmtMzn(kpis.totalRefunded)} icon={<RefreshCcw className="size-4" />} />
          <StatCard title="Pedidos de Reembolso" value={kpis.refundRequests} icon={<FileText className="size-4" />} />
          <StatCard title="Taxa de Reembolso" value={`${kpis.refundRate.toFixed(1)}%`} icon={<Percent className="size-4" />} description="vs. total cobrado" />
          <StatCard title="Valor Médio de Reembolso" value={fmtMzn(kpis.averageRefundAmount)} icon={<Calculator className="size-4" />} />
          <StatCard title="Maior Reembolso" value={fmtMzn(kpis.largestRefund)} icon={<Crown className="size-4" />} />
          <StatCard title="Exposição Pendente" value={fmtMzn(kpis.pendingRefundExposure)} icon={<AlertTriangle className="size-4" />} description="solicitados + aprovados" />
          <StatCard title="Taxa de Rejeição" value={`${kpis.rejectedRefundRate.toFixed(1)}%`} icon={<XCircle className="size-4" />} />
          <StatCard title="Tempo Médio de Processamento" value={`${kpis.averageProcessingDays.toFixed(1)} dias`} icon={<Timer className="size-4" />} />
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
            <select name="status" defaultValue={filters.status ?? ""} className="h-8 rounded-md border border-input bg-background px-2 text-xs">
              <option value="">Todos</option>
              {Object.entries(REFUND_STATUS_LABELS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-muted-foreground">ID do Aluno</label>
            <input type="text" name="studentId" defaultValue={filters.studentId ?? ""} className="h-8 rounded-md border border-input bg-background px-2 text-xs" />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-muted-foreground">Valor Mínimo</label>
            <input type="number" name="minAmount" defaultValue={filters.minAmount ?? ""} className="h-8 w-28 rounded-md border border-input bg-background px-2 text-xs" />
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
            <Link href="/reports/finance/refund-analysis">Limpar</Link>
          </Button>
        </form>

        {/* Full-width charts */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Tendência de Reembolsos</CardTitle>
            <CardDescription className="text-xs">Pedidos por mês de criação, por estado actual — solicitados, aprovados, concluídos e rejeitados.</CardDescription>
          </CardHeader>
          <CardContent>
            <RefundTrendChart rows={trend} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Tendência de Valor de Reembolso</CardTitle>
            <CardDescription className="text-xs">Valor reembolsado (concluído) e exposição pendente, por mês.</CardDescription>
          </CardHeader>
          <CardContent>
            <RefundAmountTrendChart rows={amountTrend} />
          </CardContent>
        </Card>

        {/* Main grid — 70/30 */}
        <div className="grid grid-cols-1 lg:grid-cols-10 gap-6">
          {/* Left column — 70% */}
          <div className="lg:col-span-7 space-y-6">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Lista de Vigilância de Reembolsos</CardTitle>
                <CardDescription className="text-xs">Reembolsos pendentes ou aprovados que exigem atenção — por valor ou tempo de espera.</CardDescription>
              </CardHeader>
              <CardContent>
                <RefundWatchlistTable items={watchlist} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Detalhe de Reembolsos</CardTitle>
              </CardHeader>
              <CardContent>
                <RefundAnalysisTable queryString={queryString} pageSize={pageSize} />
              </CardContent>
            </Card>
          </div>

          {/* Right column — 30% */}
          <div className="lg:col-span-3 space-y-6">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Reembolsos por Filial</CardTitle>
              </CardHeader>
              <CardContent>
                <RefundByBranchChart rows={byBranch} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Reembolsos por Curso</CardTitle>
              </CardHeader>
              <CardContent>
                <RefundByCourseChart rows={byCourse} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Reembolsos por Estado</CardTitle>
              </CardHeader>
              <CardContent>
                <RefundByStatusChart rows={byStatus} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Tendência de Tempo de Processamento</CardTitle>
              </CardHeader>
              <CardContent>
                <RefundProcessingTimeChart rows={processingTimeTrend} />
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
