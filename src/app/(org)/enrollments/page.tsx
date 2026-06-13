import { redirect } from "next/navigation";
import Link from "next/link";
import {
  BookOpen, CheckCircle2, Clock, Users, AlertTriangle, XCircle,
  BadgeCheck, Wallet, UserX, Plus, AlertCircle,
} from "lucide-react";
import { PageHeader } from "@/shared/components/layout/page-header";
import { StatCard } from "@/shared/components/layout/stat-card";
import { Button } from "@/shared/components/ui/button";
import { Badge } from "@/shared/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/shared/components/ui/tabs";
import {
  ExecutiveMainGrid,
  ExecutiveLeftColumn,
  ExecutiveRightColumn,
  ExecutiveKpiGrid,
  DashboardSideCard,
  DashboardInsightRow,
} from "@/shared/components/layout/executive-dashboard";
import { ApexDonutChart, ApexLineChart } from "@/shared/components/charts";
import { EnrollmentActionBar } from "@/modules/enrollments/components/enrollment-action-bar";
import { EnrollmentTableFilters } from "@/modules/enrollments/components/enrollment-table-filters";
import { requirePermission } from "@/server/auth/context";
import { getUserPermissions, createAbility } from "@/server/auth/rbac";
import { PERMISSIONS } from "@/server/auth/permissions";
import { getEnrollmentsByOrganization } from "@/modules/enrollments/services/enrollment.service";
import {
  getEnrollmentDashboardKPIs,
  getEnrollmentCourseDistribution,
  getEnrollmentMonthlyTrend,
  getEnrollmentBranchDistribution,
} from "@/modules/enrollments/services/enrollment-metrics.service";
import { getEnrollmentWatchlist } from "@/modules/enrollments/services/enrollment-watchlist.service";
import { generateEnrollmentInsights } from "@/modules/enrollments/services/enrollment-insights.service";
import { EnrollmentsTable } from "@/modules/enrollments/components/enrollments-table";
import { EnrollmentWatchlist } from "@/modules/enrollments/components/enrollment-watchlist";
import { normalizePaginationParams } from "@/shared/lib/pagination";
import { getDb } from "@/server/db";
import { ENROLLMENT_STATUS_LABELS } from "@/modules/enrollments/types";
import type { AuthContext } from "@/server/auth/context";

export const metadata = { title: "Matrículas" };

async function getFilterOptions(organizationId: string) {
  const db = await getDb();
  const [courses, branches, classGroups, academicYears] = await Promise.all([
    db.course.findMany({ where: { organizationId, deletedAt: null, status: "ACTIVE" }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    db.branch.findMany({ where: { organizationId, deletedAt: null }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    db.classGroup.findMany({ where: { organizationId, deletedAt: null }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    db.academicYear.findMany({ where: { organizationId, deletedAt: null, status: { not: "ARCHIVED" } }, select: { id: true, name: true }, orderBy: { startDate: "desc" } }),
  ]);
  return { courses, branches, classGroups, academicYears };
}

const MONTH_LABELS = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];

function formatMonthKey(key: string) {
  const [year, month] = key.split("-");
  return `${MONTH_LABELS[parseInt(month) - 1]} ${year?.slice(2)}`;
}

export default async function EnrollmentsPage({
  searchParams,
}: {
  searchParams: Promise<{
    page?: string; search?: string; status?: string; courseId?: string;
    branchId?: string; classGroupId?: string; yearId?: string; financialStatus?: string;
  }>;
}) {
  let context: AuthContext;
  try {
    context = await requirePermission(PERMISSIONS.ENROLLMENTS_VIEW);
  } catch {
    redirect("/forbidden");
  }

  const { page, search, status, courseId, branchId, classGroupId, yearId, financialStatus } = await searchParams;
  const pagination = normalizePaginationParams(page);

  const perms = await getUserPermissions(context.userId, context.organizationId);
  const ability = createAbility(perms);
  const canCreate = ability.can(PERMISSIONS.ENROLLMENTS_CREATE);
  const canEdit = ability.can(PERMISSIONS.ENROLLMENTS_UPDATE);
  const canActivate = ability.can(PERMISSIONS.ENROLLMENTS_ACTIVATE);
  const canSuspend = ability.can(PERMISSIONS.ENROLLMENTS_SUSPEND);
  const canCancel = ability.can(PERMISSIONS.ENROLLMENTS_CANCEL);
  const canComplete = ability.can(PERMISSIONS.ENROLLMENTS_COMPLETE);
  const canDelete = ability.can(PERMISSIONS.ENROLLMENTS_DELETE);
  const canViewPayments = ability.can(PERMISSIONS.PAYMENTS_VIEW);

  const org = context.organizationId;

  const [kpis, watchlist, courseDistribution, monthlyTrend, branchDistribution, result, filterOptions] =
    await Promise.all([
      getEnrollmentDashboardKPIs(org, { includePaymentMetrics: canViewPayments }),
      getEnrollmentWatchlist(org),
      getEnrollmentCourseDistribution(org),
      getEnrollmentMonthlyTrend(org),
      getEnrollmentBranchDistribution(org),
      getEnrollmentsByOrganization(org, { ...pagination, search, status, courseId, branchId, classGroupId, academicYearId: yearId, financialStatus }),
      getFilterOptions(org),
    ]);

  const insights = generateEnrollmentInsights(kpis, courseDistribution);

  // Chart DTOs
  const statusItems = [
    { label: ENROLLMENT_STATUS_LABELS["ACTIVE"] ?? "Ativo", count: kpis.active, color: "#22c55e" },
    { label: "Aguarda Pag.", count: kpis.pendingPayment, color: "#f59e0b" },
    { label: ENROLLMENT_STATUS_LABELS["SUSPENDED"] ?? "Suspenso", count: kpis.suspended, color: "#f97316" },
    { label: "Rascunho", count: kpis.draft, color: "#94a3b8" },
    { label: ENROLLMENT_STATUS_LABELS["COMPLETED"] ?? "Concluído", count: kpis.completed, color: "#14b8a6" },
    { label: "Cancelado", count: kpis.cancelled, color: "#ef4444" },
  ].filter((i) => i.count > 0);

  const statusDonut = {
    labels: statusItems.map((i) => i.label),
    series: statusItems.map((i) => i.count),
    colors: statusItems.map((i) => i.color),
  };

  const trendLine = {
    categories: monthlyTrend.map((m) => formatMonthKey(m.month)),
    series: [{ name: "Matrículas", data: monthlyTrend.map((m) => m.total) }],
    colors: ["#22c55e"],
  };

  const maxCourseCount = courseDistribution[0]?.activeCount ?? 1;
  const watchlistPreview = watchlist.slice(0, 5);

  return (
    <>
      <PageHeader
        title="Matrículas"
        description="Visão geral das matrículas, estado académico, situação financeira e pendências operacionais."
        actions={
          canCreate ? (
            <Button asChild size="sm">
              <Link href="/enrollments/new">
                <Plus className="size-4 mr-1.5" />
                Nova Matrícula
              </Link>
            </Button>
          ) : undefined
        }
      />

      <EnrollmentActionBar
        pendingPaymentCount={kpis.pendingPayment}
        overdueAccountsCount={kpis.overdueAccounts}
        activeWithoutInvoiceCount={kpis.activeWithoutInvoice}
        showFinancial={canViewPayments}
      />

      <div className="p-4 sm:p-8 space-y-6">

        {/* KPI Cards */}
        <ExecutiveKpiGrid>
          <StatCard title="Total de Matrículas" value={kpis.total} description="Todas as matrículas" icon={<BookOpen className="size-4 text-muted-foreground" />} />
          <StatCard title={ENROLLMENT_STATUS_LABELS["ACTIVE"]!} value={kpis.active} description="Matrículas activas" icon={<CheckCircle2 className="size-4 text-green-500" />} />
          <StatCard title="Aguarda Pagamento" value={kpis.pendingPayment} description="Aguardam pagamento" icon={<Clock className="size-4 text-amber-500" />} />
          <StatCard title="Sem Turma" value={kpis.awaitingClassAssignment} description="Activas sem turma" icon={<Users className="size-4 text-blue-500" />} />
          {canViewPayments && (
            <StatCard title="Contas Vencidas" value={kpis.overdueAccounts} description="Com faturas vencidas" icon={<AlertTriangle className="size-4 text-red-500" />} />
          )}
          {canViewPayments && (
            <StatCard title="Crédito em Carteira" value={kpis.studentsWithWalletCredit} description="Com saldo disponível" icon={<Wallet className="size-4 text-emerald-500" />} />
          )}
          <StatCard title={ENROLLMENT_STATUS_LABELS["SUSPENDED"]!} value={kpis.suspended} description="Matrículas suspensas" icon={<XCircle className="size-4 text-orange-500" />} />
          <StatCard title={ENROLLMENT_STATUS_LABELS["COMPLETED"]!} value={kpis.completed} description="Matrículas concluídas" icon={<BadgeCheck className="size-4 text-teal-500" />} />
        </ExecutiveKpiGrid>

        {/* Full-width trend chart */}
        {monthlyTrend.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium">Novas Matrículas por Mês</CardTitle>
                <span className="text-xs text-muted-foreground">Últimos 6 meses</span>
              </div>
            </CardHeader>
            <CardContent>
              <ApexLineChart data={trendLine} height={200} />
            </CardContent>
          </Card>
        )}

        {/* Two-column main content */}
        <ExecutiveMainGrid>

          {/* LEFT: Watchlist + Table */}
          <ExecutiveLeftColumn>
            {watchlist.length > 0 && (
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <UserX className="size-4 text-muted-foreground" />
                      <CardTitle className="text-sm font-medium">Lista de Atenção</CardTitle>
                    </div>
                    <div className="flex items-center gap-2">
                      {watchlist.length > 5 && (
                        <Link
                          href="/enrollments?status=PENDING_PAYMENT"
                          className="text-xs text-muted-foreground hover:underline"
                        >
                          Ver todos ({watchlist.length})
                        </Link>
                      )}
                      <Badge variant="secondary" className="text-xs">{watchlist.length}</Badge>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="p-0 pb-2">
                  <EnrollmentWatchlist items={watchlistPreview} />
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <BookOpen className="size-4 text-muted-foreground" />
                    <CardTitle className="text-sm font-medium">Matrículas</CardTitle>
                  </div>
                  <Badge variant="secondary" className="text-xs">{result.total.toLocaleString("pt-PT")}</Badge>
                </div>
                <EnrollmentTableFilters
                  courses={filterOptions.courses}
                  branches={filterOptions.branches}
                  classGroups={filterOptions.classGroups}
                  academicYears={filterOptions.academicYears}
                  defaultSearch={search}
                  defaultStatus={status}
                  defaultCourseId={courseId}
                  defaultBranchId={branchId}
                  defaultClassGroupId={classGroupId}
                  defaultAcademicYearId={yearId}
                  defaultFinancialStatus={financialStatus}
                />
              </CardHeader>
              <CardContent className="p-0 sm:px-4 sm:pb-4">
                <EnrollmentsTable
                  result={result}
                  canEdit={canEdit}
                  canActivate={canActivate}
                  canSuspend={canSuspend}
                  canCancel={canCancel}
                  canComplete={canComplete}
                  canDelete={canDelete}
                />
              </CardContent>
            </Card>
          </ExecutiveLeftColumn>

          {/* RIGHT: Insights + Tabbed analysis */}
          <ExecutiveRightColumn>

            {insights.length > 0 && (
              <DashboardSideCard
                title="Informações e Alertas"
                icon={<AlertCircle className="size-4" />}
                badge={<span className="text-xs text-muted-foreground">{insights.length}</span>}
              >
                <div className="space-y-2">
                  {insights.map((i) => <DashboardInsightRow key={i.id} insight={i} />)}
                </div>
              </DashboardSideCard>
            )}

            <Card>
              <Tabs defaultValue="status">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Análise</CardTitle>
                  <TabsList className="w-full mt-2 grid grid-cols-2 h-8">
                    <TabsTrigger value="status" className="text-xs">Estado</TabsTrigger>
                    <TabsTrigger value="courses" className="text-xs">Cursos</TabsTrigger>
                  </TabsList>
                </CardHeader>
                <CardContent className="pt-0">
                  <TabsContent value="status" className="mt-0">
                    {statusItems.length > 0 ? (
                      <ApexDonutChart data={statusDonut} height={200} />
                    ) : (
                      <p className="text-sm text-muted-foreground py-4 text-center">Sem matrículas.</p>
                    )}
                  </TabsContent>

                  <TabsContent value="courses" className="mt-0">
                    {courseDistribution.length > 0 ? (
                      <div className="space-y-3 pt-1">
                        {courseDistribution.slice(0, 8).map((c) => {
                          const pct = maxCourseCount > 0 ? Math.round((c.activeCount / maxCourseCount) * 100) : 0;
                          return (
                            <div key={c.courseId} className="space-y-1">
                              <div className="flex items-center justify-between text-xs">
                                <Link
                                  href={`/enrollments?courseId=${c.courseId}`}
                                  className="truncate hover:underline"
                                >
                                  {c.courseName}
                                </Link>
                                <span className="font-medium tabular-nums shrink-0 ml-2">
                                  {c.activeCount.toLocaleString("pt-PT")}
                                </span>
                              </div>
                              <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                                <div
                                  className="h-full rounded-full bg-indigo-500"
                                  style={{ width: `${pct}%` }}
                                />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground py-4 text-center">Sem dados de cursos.</p>
                    )}
                  </TabsContent>
                </CardContent>
              </Tabs>
            </Card>

          </ExecutiveRightColumn>
        </ExecutiveMainGrid>
      </div>
    </>
  );
}
