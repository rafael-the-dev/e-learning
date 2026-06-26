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
import { redirectIfTeacherScoped } from "@/server/auth/teacher-scope";
import { getUserPermissions, createAbility } from "@/server/auth/rbac";
import { PERMISSIONS } from "@/server/auth/permissions";
import { normalizePaginationParams } from "@/shared/lib/pagination";
import { getActiveCategoriesByOrganization } from "@/modules/courses/services/course.service";
import {
  getCourseKPIs,
  getCourseTrend,
  getCourseStatusDistribution,
  getCategoryDistribution,
  getLevelDistribution,
  getEnrollmentDistribution,
  listCoursesForDashboard,
} from "@/modules/courses/services/course-metrics.service";
import { getCourseInsights } from "@/modules/courses/services/course-insights.service";
import { getCourseWatchlist } from "@/modules/courses/services/course-watchlist.service";
import { CourseActionBar } from "@/modules/courses/components/course-action-bar";
import { CourseWatchlist } from "@/modules/courses/components/course-watchlist";
import { CoursesDashboardTable } from "@/modules/courses/components/courses-dashboard-table";
import {
  BookMarked,
  CheckCircle2,
  FileEdit,
  Layers,
  BookOpen,
  Users,
  GraduationCap,
  Tag,
  TrendingUp,
  ShieldAlert,
  AlertTriangle,
  Plus,
  Tags,
} from "lucide-react";
import { COURSE_STATUS_LABELS } from "@/modules/courses/types";

export const metadata = { title: "Cursos" };

const COURSE_STATUS_COLORS: Record<string, string> = {
  ACTIVE: "#22c55e",
  DRAFT: "#3b82f6",
  INACTIVE: "#94a3b8",
  ARCHIVED: "#64748b",
};

export default async function CoursesPage({
  searchParams,
}: {
  searchParams: Promise<{
    page?: string;
    search?: string;
    status?: string;
    categoryId?: string;
  }>;
}) {
  const context = await requirePermissionOrRedirect(PERMISSIONS.COURSES_READ);
  // Teacher-scoped users never see this org-wide page — routed to their scoped Portal. See docs/teacher-access-scope.md.
  await redirectIfTeacherScoped(context);

  const sp = await searchParams;
  const pagination = normalizePaginationParams(sp.page);
  const { organizationId } = context;

  const perms = await getUserPermissions(context.userId, organizationId);
  const ability = createAbility(perms);
  const canCreate = ability.can(PERMISSIONS.COURSES_CREATE);
  const canEdit = ability.can(PERMISSIONS.COURSES_UPDATE);
  const canArchive = ability.can(PERMISSIONS.COURSES_ARCHIVE);

  const [
    kpis,
    trend,
    statusDist,
    categoryDist,
    levelDist,
    enrollmentDist,
    insights,
    watchlist,
    courses,
    categories,
  ] = await Promise.all([
    getCourseKPIs(organizationId),
    getCourseTrend(organizationId),
    getCourseStatusDistribution(organizationId),
    getCategoryDistribution(organizationId),
    getLevelDistribution(organizationId),
    getEnrollmentDistribution(organizationId),
    getCourseInsights(organizationId),
    getCourseWatchlist(organizationId),
    listCoursesForDashboard(organizationId, {
      page: pagination.page,
      pageSize: pagination.pageSize,
      search: sp.search,
      status: sp.status,
      categoryId: sp.categoryId,
    }),
    getActiveCategoriesByOrganization(organizationId),
  ]);

  const trendLineData = {
    categories: trend.map((t) => t.month),
    series: [
      { name: "Cursos Criados", data: trend.map((t) => t.registered) },
      { name: "Matrículas Ativas", data: trend.map((t) => t.activeEnrollments) },
      { name: "Turmas Ativas", data: trend.map((t) => t.activeClassGroups) },
    ],
    colors: ["#6366f1", "#22c55e", "#f59e0b"],
  };

  const statusDonutData = {
    labels: statusDist.map((s) => COURSE_STATUS_LABELS[s.status] ?? s.status),
    series: statusDist.map((s) => s.count),
    colors: statusDist.map((s) => COURSE_STATUS_COLORS[s.status] ?? "#94a3b8"),
  };

  const maxCategoryCount = categoryDist[0]?.courseCount ?? 1;
  const maxLevelCount = levelDist[0]?.levelCount ?? 1;
  const maxEnrollmentCount = enrollmentDist[0]?.enrollmentCount ?? 1;

  return (
    <>
      <PageHeader
        title="Cursos"
        description="Visão executiva do catálogo de cursos, estrutura curricular e adoção operacional."
        actions={
          <div className="flex items-center gap-2">
            <Button asChild variant="outline" size="sm">
              <Link href="/courses/categories">
                <Tags className="size-4 mr-1.5" />
                Categorias
              </Link>
            </Button>
            {canCreate && (
              <Button asChild size="sm">
                <Link href="/courses/new">
                  <Plus className="size-4 mr-1.5" />
                  Novo Curso
                </Link>
              </Button>
            )}
          </div>
        }
      />

      <CourseActionBar
        noLevelsCount={kpis.noLevelsCount}
        noSubjectsCount={kpis.noSubjectsCount}
        noClassGroupCount={kpis.noClassGroupCount}
        noEnrollmentsCount={kpis.noEnrollmentsCount}
        staleDraftCount={kpis.staleDraftCount}
      />

      <div className="p-4 sm:p-8 space-y-6">

        <ExecutiveKpiGrid>
          <StatCard
            title="Total de Cursos"
            value={kpis.totalCourses}
            icon={<BookMarked className="size-4 text-muted-foreground" />}
            description="registados na organização"
          />
          <StatCard
            title="Ativos"
            value={kpis.activeCount}
            icon={<CheckCircle2 className="size-4 text-emerald-500" />}
            description="cursos publicados"
          />
          <StatCard
            title="Rascunhos"
            value={kpis.draftCount}
            icon={<FileEdit className="size-4 text-blue-500" />}
            description="a aguardar publicação"
          />
          <StatCard
            title="Sem Nível"
            value={kpis.noLevelsCount}
            icon={<Layers className="size-4 text-red-500" />}
            description="ativos sem estrutura"
          />
          <StatCard
            title="Sem Disciplina"
            value={kpis.noSubjectsCount}
            icon={<BookOpen className="size-4 text-orange-500" />}
            description="ativos sem disciplinas"
          />
          <StatCard
            title="Sem Turma Ativa"
            value={kpis.noClassGroupCount}
            icon={<Users className="size-4 text-amber-500" />}
            description="ativos sem turma associada"
          />
          <StatCard
            title="Matrículas Ativas"
            value={kpis.activeEnrollmentsCount}
            icon={<GraduationCap className="size-4 text-indigo-500" />}
            description="alunos inscritos em cursos ativos"
          />
          <StatCard
            title="Cursos Operacionais"
            value={kpis.operationalCount}
            icon={<Tag className="size-4 text-violet-500" />}
            description="ativos com turma e matrículas"
          />
        </ExecutiveKpiGrid>

        {/* Trend — full width */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <TrendingUp className="size-4 text-muted-foreground" />
              <CardTitle className="text-sm font-medium">Evolução de Registos</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <ApexLineChart data={trendLineData} height={200} smooth />
          </CardContent>
        </Card>

        <ExecutiveMainGrid>

          <ExecutiveLeftColumn>

            {watchlist.length > 0 && (
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <ShieldAlert className="size-4 text-muted-foreground" />
                      <CardTitle className="text-sm font-medium">Watchlist de Cursos</CardTitle>
                    </div>
                    <Badge variant="destructive" className="text-xs">{watchlist.length}</Badge>
                  </div>
                </CardHeader>
                <CardContent className="p-0 pb-2">
                  <CourseWatchlist items={watchlist} />
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <BookMarked className="size-4 text-muted-foreground" />
                    <CardTitle className="text-sm font-medium">Registo de Cursos</CardTitle>
                  </div>
                  <Badge variant="secondary" className="text-xs">
                    {courses.total.toLocaleString("pt-PT")}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="p-0 sm:px-4 sm:pb-4">
                <CoursesDashboardTable
                  result={courses}
                  categories={categories}
                  defaultSearch={sp.search}
                  defaultStatus={sp.status}
                  defaultCategoryId={sp.categoryId}
                  canEdit={canEdit}
                  canArchive={canArchive}
                />
              </CardContent>
            </Card>

          </ExecutiveLeftColumn>

          <ExecutiveRightColumn>

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

            <Card>
              <Tabs defaultValue="categories">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Análise</CardTitle>
                  <TabsList className="w-full mt-2 grid grid-cols-3 h-8">
                    <TabsTrigger value="categories" className="text-xs">Categorias</TabsTrigger>
                    <TabsTrigger value="levels" className="text-xs">Níveis</TabsTrigger>
                    <TabsTrigger value="enrollments" className="text-xs">Matrículas</TabsTrigger>
                  </TabsList>
                </CardHeader>
                <CardContent className="pt-0">

                  <TabsContent value="categories" className="mt-0">
                    {categoryDist.length > 0 ? (
                      <div className="space-y-3 pt-1">
                        {categoryDist.map((c) => {
                          const pct = Math.round((c.courseCount / maxCategoryCount) * 100);
                          return (
                            <div key={c.categoryId} className="space-y-1">
                              <div className="flex items-center justify-between text-xs">
                                <span className="truncate">{c.categoryName}</span>
                                <span className="font-medium tabular-nums shrink-0 ml-2">
                                  {c.courseCount}
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
                        Sem categorias atribuídas.
                      </p>
                    )}
                  </TabsContent>

                  <TabsContent value="levels" className="mt-0">
                    {levelDist.length > 0 ? (
                      <div className="space-y-3 pt-1">
                        {levelDist.map((l) => {
                          const pct = Math.round((l.levelCount / maxLevelCount) * 100);
                          return (
                            <div key={l.courseName} className="space-y-1">
                              <div className="flex items-center justify-between text-xs">
                                <span className="truncate">{l.courseName}</span>
                                <span className="font-medium tabular-nums shrink-0 ml-2">
                                  {l.levelCount}
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
                        Sem níveis configurados.
                      </p>
                    )}
                  </TabsContent>

                  <TabsContent value="enrollments" className="mt-0">
                    {enrollmentDist.length > 0 ? (
                      <div className="space-y-3 pt-1">
                        {enrollmentDist.map((e) => {
                          const pct = Math.round((e.enrollmentCount / maxEnrollmentCount) * 100);
                          return (
                            <div key={e.courseName} className="space-y-1">
                              <div className="flex items-center justify-between text-xs">
                                <span className="truncate">{e.courseName}</span>
                                <span className="font-medium tabular-nums shrink-0 ml-2">
                                  {e.enrollmentCount}
                                </span>
                              </div>
                              <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                                <div
                                  className="h-full rounded-full bg-emerald-500"
                                  style={{ width: `${pct}%` }}
                                />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground py-4 text-center">
                        Sem matrículas ativas.
                      </p>
                    )}
                  </TabsContent>

                </CardContent>
              </Tabs>
            </Card>

            <DashboardSideCard
              title="Estado dos Cursos"
              icon={<BookMarked className="size-4" />}
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

        </ExecutiveMainGrid>
      </div>
    </>
  );
}
