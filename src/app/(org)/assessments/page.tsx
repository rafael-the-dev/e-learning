import Link from "next/link";
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
import { ApexLineChart } from "@/shared/components/charts/apex-line-chart";
import { ApexDonutChart } from "@/shared/components/charts/apex-donut-chart";
import { requirePermissionOrRedirect } from "@/server/auth/context";
import { resolveDataAccessScope } from "@/server/auth/teacher-scope";
import { getUserPermissions, createAbility } from "@/server/auth/rbac";
import { PERMISSIONS } from "@/server/auth/permissions";
import { normalizePaginationParams } from "@/shared/lib/pagination";
import {
  getAssessmentKPIs,
  getAssessmentTrend,
  getAssessmentStatusDistribution,
  getComponentTypeDistribution,
  getTeacherPendingGrading,
  getPublicationStatusDistribution,
  listAssessmentsForDashboard,
} from "@/modules/assessments/services/assessment-metrics.service";
import { getAssessmentInsights } from "@/modules/assessments/services/assessment-insights.service";
import { getAssessmentWatchlist } from "@/modules/assessments/services/assessment-watchlist.service";
import { AssessmentActionBar } from "@/modules/assessments/components/assessment-action-bar";
import { AssessmentWatchlist } from "@/modules/assessments/components/assessment-watchlist";
import { AssessmentsDashboardTable } from "@/modules/assessments/components/assessments-dashboard-table";
import {
  ClipboardList,
  Calendar,
  Clock,
  CheckCircle2,
  FileEdit,
  RefreshCw,
  Send,
  TrendingUp,
  AlertTriangle,
  ShieldAlert,
} from "lucide-react";
import {
  ASSESSMENT_STATUS_LABELS,
  ASSESSMENT_PUBLICATION_STATUS_LABELS,
} from "@/modules/assessments/types";

export const metadata = { title: "Avaliações" };

const ASSESSMENT_STATUS_COLORS: Record<string, string> = {
  DRAFT: "#94a3b8",
  SCHEDULED: "#6366f1",
  OPEN: "#f59e0b",
  GRADED: "#22c55e",
  CANCELLED: "#ef4444",
  ARCHIVED: "#78716c",
};

const PUBLICATION_STATUS_COLORS: Record<string, string> = {
  DRAFT: "#94a3b8",
  READY: "#f59e0b",
  PUBLISHED: "#22c55e",
  ARCHIVED: "#78716c",
};

export default async function AssessmentsPage({
  searchParams,
}: {
  searchParams: Promise<{
    page?: string;
    search?: string;
    status?: string;
    periodId?: string;
    classGroupId?: string;
  }>;
}) {
  const context = await requirePermissionOrRedirect(PERMISSIONS.ASSESSMENTS_VIEW);

  const sp = await searchParams;
  const pagination = normalizePaginationParams(sp.page);
  const { organizationId } = context;

  const perms = await getUserPermissions(context.userId, organizationId);
  const ability = createAbility(perms);
  const canCreate = ability.can(PERMISSIONS.ASSESSMENTS_CREATE);
  const canEdit = ability.can(PERMISSIONS.ASSESSMENTS_UPDATE);
  const canCancel = ability.can(PERMISSIONS.ASSESSMENTS_CANCEL);

  // Teacher scope: a teacher sees only their own assessments, as a plain scoped
  // table — never the org-wide KPI/trend/distribution dashboard below (which
  // includes a per-teacher pending-grading breakdown). See docs/teacher-access-scope.md.
  const scope = await resolveDataAccessScope(context);
  if (scope.type === "teacher") {
    const assessments = await listAssessmentsForDashboard(organizationId, {
      page: pagination.page,
      pageSize: pagination.pageSize,
      search: sp.search,
      status: sp.status,
      assessmentPeriodId: sp.periodId,
      classGroupId: sp.classGroupId,
      teacherId: scope.teacherId,
    });

    return (
      <>
        <PageHeader
          title="Avaliações"
          description="As avaliações das suas turmas."
          actions={
            canCreate ? (
              <Button asChild size="sm">
                <Link href="/assessments/new">
                  <ClipboardList className="size-4 mr-1.5" />
                  Nova Avaliação
                </Link>
              </Button>
            ) : undefined
          }
        />
        <div className="p-4 sm:p-8">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ClipboardList className="size-4 text-muted-foreground" />
                  <CardTitle className="text-sm font-medium">Registo de Avaliações</CardTitle>
                </div>
                <Badge variant="secondary" className="text-xs">{assessments.total.toLocaleString("pt-PT")}</Badge>
              </div>
            </CardHeader>
            <CardContent className="p-0 sm:px-4 sm:pb-4">
              <AssessmentsDashboardTable
                result={assessments}
                defaultSearch={sp.search}
                defaultStatus={sp.status}
                canEdit={canEdit}
                canCancel={canCancel}
              />
            </CardContent>
          </Card>
        </div>
      </>
    );
  }

  const [
    kpis,
    trend,
    statusDist,
    componentDist,
    teacherPending,
    publicationDist,
    insights,
    watchlist,
    assessments,
  ] = await Promise.all([
    getAssessmentKPIs(organizationId),
    getAssessmentTrend(organizationId),
    getAssessmentStatusDistribution(organizationId),
    getComponentTypeDistribution(organizationId),
    getTeacherPendingGrading(organizationId),
    getPublicationStatusDistribution(organizationId),
    getAssessmentInsights(organizationId),
    getAssessmentWatchlist(organizationId),
    listAssessmentsForDashboard(organizationId, {
      page: pagination.page,
      pageSize: pagination.pageSize,
      search: sp.search,
      status: sp.status,
      assessmentPeriodId: sp.periodId,
      classGroupId: sp.classGroupId,
    }),
  ]);

  // Chart DTOs
  const trendLineData = {
    categories: trend.map((t) => t.month),
    series: [
      { name: "Agendadas", data: trend.map((t) => t.scheduled) },
      { name: "Classificadas", data: trend.map((t) => t.graded) },
      { name: "Publicadas", data: trend.map((t) => t.published) },
    ],
    colors: ["#6366f1", "#22c55e", "#3b82f6"],
  };

  const statusDonutData = {
    labels: statusDist.map((s) => ASSESSMENT_STATUS_LABELS[s.status] ?? s.status),
    series: statusDist.map((s) => s.count),
    colors: statusDist.map((s) => ASSESSMENT_STATUS_COLORS[s.status] ?? "#94a3b8"),
  };

  const maxComponentCount = componentDist[0]?.count ?? 1;
  const maxTeacherCount = teacherPending[0]?.openCount ?? 1;

  return (
    <>
      <PageHeader
        title="Avaliações"
        description="Visão executiva das avaliações, progresso de classificação, publicações e risco académico."
        actions={
          canCreate ? (
            <Button asChild size="sm">
              <Link href="/assessments/new">
                <ClipboardList className="size-4 mr-1.5" />
                Nova Avaliação
              </Link>
            </Button>
          ) : undefined
        }
      />

      <AssessmentActionBar
        openCount={kpis.openCount}
        scheduledCount={kpis.scheduledCount}
        pendingRetakesCount={kpis.pendingRetakesCount}
        readyToPublishCount={kpis.readyToPublishCount}
      />

      <div className="p-4 sm:p-8 space-y-6">

        <ExecutiveKpiGrid>
          <StatCard
            title="Total de Avaliações"
            value={kpis.totalAssessments}
            icon={<ClipboardList className="size-4 text-muted-foreground" />}
            description="registos de avaliação"
          />
          <StatCard
            title="Agendadas"
            value={kpis.scheduledCount}
            icon={<Calendar className="size-4 text-indigo-500" />}
            description="a aguardar realização"
          />
          <StatCard
            title="Em Curso"
            value={kpis.openCount}
            icon={<Clock className="size-4 text-amber-500" />}
            description="abertas para classificação"
          />
          <StatCard
            title="Classificadas"
            value={kpis.gradedCount}
            icon={<CheckCircle2 className="size-4 text-emerald-500" />}
            description="avaliações concluídas"
          />
          <StatCard
            title="A Classificar"
            value={kpis.awaitingGradingCount}
            icon={<FileEdit className="size-4 text-orange-500" />}
            description="avaliações OPEN incompletas"
          />
          <StatCard
            title="Repetições Pendentes"
            value={kpis.pendingRetakesCount}
            icon={<RefreshCw className="size-4 text-red-500" />}
            description="pedidos por aprovar"
          />
          <StatCard
            title="Prontas a Publicar"
            value={kpis.readyToPublishCount}
            icon={<Send className="size-4 text-blue-500" />}
            description="resultados READY"
          />
          <StatCard
            title="Média Geral"
            value={
              kpis.avgNormalizedScore != null
                ? `${kpis.avgNormalizedScore.toLocaleString("pt-PT")}%`
                : "—"
            }
            icon={<TrendingUp className="size-4 text-violet-500" />}
            description="notas classificadas"
          />
        </ExecutiveKpiGrid>

        {/* Multi-series trend — full width */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <TrendingUp className="size-4 text-muted-foreground" />
              <CardTitle className="text-sm font-medium">Evolução das Avaliações</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <ApexLineChart data={trendLineData} height={320} smooth />
          </CardContent>
        </Card>

        <ExecutiveMainGrid className="xl:grid-cols-1">

          <ExecutiveRightColumn className="box-border grid gap-6 space-y-0 lg:grid-cols-3!">

            {insights.length > 0 && (
              <DashboardSideCard
                title="Informações e Alertas"
                icon={<AlertTriangle className="size-4" />}
                badge={<span className="text-xs text-muted-foreground">{insights.length}</span>}
              >
                <div className="space-y-2">
                  {insights.map((i) => (
                    <DashboardInsightRow key={i.id} insight={i} />
                  ))}
                </div>
              </DashboardSideCard>
            )}

            {/* Tabbed analysis */}
            <Card>
              <Tabs defaultValue="components">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Análise</CardTitle>
                  <TabsList className="w-full mt-2 grid grid-cols-3 h-8">
                    <TabsTrigger value="components" className="text-xs">Componentes</TabsTrigger>
                    <TabsTrigger value="teachers" className="text-xs">Professores</TabsTrigger>
                    <TabsTrigger value="publication" className="text-xs">Publicação</TabsTrigger>
                  </TabsList>
                </CardHeader>
                <CardContent className="pt-0">

                  {/* Componentes: distribution by component type */}
                  <TabsContent value="components" className="mt-0">
                    {componentDist.length > 0 ? (
                      <div className="space-y-3 pt-1">
                        {componentDist.map((c) => {
                          const pct = Math.round((c.count / maxComponentCount) * 100);
                          return (
                            <div key={c.componentType} className="space-y-1">
                              <div className="flex items-center justify-between text-xs">
                                <span className="truncate">{c.label}</span>
                                <span className="font-medium tabular-nums shrink-0 ml-2">
                                  {c.count}
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
                      <p className="text-sm text-muted-foreground py-4 text-center">
                        Sem dados de componentes.
                      </p>
                    )}
                  </TabsContent>

                  {/* Professores: open assessment count per teacher */}
                  <TabsContent value="teachers" className="mt-0">
                    {teacherPending.length > 0 ? (
                      <div className="space-y-3 pt-1">
                        {teacherPending.map((t) => {
                          const pct = Math.round((t.openCount / maxTeacherCount) * 100);
                          return (
                            <div key={t.teacherName} className="space-y-1">
                              <div className="flex items-center justify-between text-xs">
                                <span className="truncate">{t.teacherName}</span>
                                <span className="font-medium tabular-nums shrink-0 ml-2">
                                  {t.openCount}
                                </span>
                              </div>
                              <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                                <div
                                  className="h-full rounded-full bg-violet-500"
                                  style={{ width: `${pct}%` }}
                                />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground py-4 text-center">
                        Sem avaliações em curso.
                      </p>
                    )}
                  </TabsContent>

                  {/* Publicação: distribution by publication status */}
                  <TabsContent value="publication" className="mt-0">
                    {publicationDist.length > 0 ? (
                      <div className="space-y-2 pt-1">
                        {publicationDist.map((p) => (
                          <div
                            key={p.status}
                            className="flex items-center justify-between text-xs py-1.5 border-b last:border-0"
                          >
                            <span className="text-muted-foreground">
                              {ASSESSMENT_PUBLICATION_STATUS_LABELS[p.status] ?? p.status}
                            </span>
                            <span
                              className="font-semibold tabular-nums"
                              style={{
                                color: PUBLICATION_STATUS_COLORS[p.status] ?? "#94a3b8",
                              }}
                            >
                              {p.count}
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground py-4 text-center">
                        Sem publicações registadas.
                      </p>
                    )}
                  </TabsContent>

                </CardContent>
              </Tabs>
            </Card>

            {/* Status distribution donut */}
            <DashboardSideCard
              title="Estado das Avaliações"
              icon={<ClipboardList className="size-4" />}
            >
              {statusDonutData.series.length > 0 ? (
                <ApexDonutChart data={statusDonutData} height={200} />
              ) : (
                <p className="text-sm text-muted-foreground py-4 text-center">
                  Sem dados de estado.
                </p>
              )}
            </DashboardSideCard>

          </ExecutiveRightColumn>

           <ExecutiveLeftColumn className="grid gap-6 space-y-0 lg:grid-cols-1">

            {watchlist.length > 0 && (
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <ShieldAlert className="size-4 text-muted-foreground" />
                      <CardTitle className="text-sm font-medium">Watchlist de Avaliações</CardTitle>
                    </div>
                    <Badge variant="destructive" className="text-xs">{watchlist.length}</Badge>
                  </div>
                </CardHeader>
                <CardContent className="p-0 pb-2">
                  <AssessmentWatchlist items={watchlist} />
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <ClipboardList className="size-4 text-muted-foreground" />
                    <CardTitle className="text-sm font-medium">Registo de Avaliações</CardTitle>
                  </div>
                  <Badge variant="secondary" className="text-xs">
                    {assessments.total.toLocaleString("pt-PT")}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="p-0 sm:px-4 sm:pb-4">
                <AssessmentsDashboardTable
                  result={assessments}
                  defaultSearch={sp.search}
                  defaultStatus={sp.status}
                  canEdit={canEdit}
                  canCancel={canCancel}
                />
              </CardContent>
            </Card>

          </ExecutiveLeftColumn>

        </ExecutiveMainGrid>
      </div>
    </>
  );
}
