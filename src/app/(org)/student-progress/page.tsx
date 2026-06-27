import { PageHeader } from "@/shared/components/layout/page-header";
import { StatCard } from "@/shared/components/layout/stat-card";
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
import { redirectIfStudentScoped } from "@/server/auth/student-scope";
import { getTeacherOwnedSubjectIds } from "@/server/auth/teacher-access";
import { PERMISSIONS } from "@/server/auth/permissions";
import { EmptyState } from "@/shared/components/layout/empty-state";
import { normalizePaginationParams } from "@/shared/lib/pagination";
import {
  getProgressKPIs,
  getProgressTrend,
  getProgressStatusDistribution,
  getCourseProgressDistribution,
  getLevelBlockDistribution,
  getActiveCoursesForFilter,
  getTeacherProgressKPIs,
  getTeacherCoursesForFilter,
  listProgressForDashboard,
} from "@/modules/grades/services/progress-dashboard-metrics.service";
import { getProgressInsights } from "@/modules/grades/services/progress-dashboard-insights.service";
import { getProgressWatchlist } from "@/modules/grades/services/progress-dashboard-watchlist.service";
import { ProgressWatchlist } from "@/modules/grades/components/progress-watchlist";
import { StudentProgressDashboardTable } from "@/modules/grades/components/student-progress-dashboard-table";
import {
  GraduationCap,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ShieldAlert,
  BarChart3,
  TrendingUp,
  Users,
  BookOpen,
  Lock,
  Star,
} from "lucide-react";

export const metadata = { title: "Progresso dos Alunos" };

const PROGRESS_STATUS_LABELS: Record<string, string> = {
  NOT_STARTED: "Não Iniciado",
  IN_PROGRESS: "Em Progresso",
  PASSED: "Aprovado",
  COMPLETED: "Concluído",
  FAILED: "Reprovado",
  RECOVERY_REQUIRED: "Em Recuperação",
};

const PROGRESS_STATUS_COLORS: Record<string, string> = {
  NOT_STARTED: "#94a3b8",
  IN_PROGRESS: "#6366f1",
  PASSED: "#22c55e",
  COMPLETED: "#10b981",
  FAILED: "#ef4444",
  RECOVERY_REQUIRED: "#f97316",
};

export default async function StudentProgressPage({
  searchParams,
}: {
  searchParams: Promise<{
    page?: string;
    search?: string;
    status?: string;
    courseId?: string;
  }>;
}) {
  const context = await requirePermissionOrRedirect(PERMISSIONS.STUDENT_COURSE_PROGRESS_VIEW);
  // A student-scoped user sees only their own progress, on /student — never this
  // org-wide list. See student-scope.ts.
  await redirectIfStudentScoped(context);

  const sp = await searchParams;
  const pagination = normalizePaginationParams(sp.page);
  const { organizationId } = context;

  // Teacher scope: a teacher sees only the progress of students in their own
  // class groups, as a scoped "Progresso dos Meus Alunos" workspace — never the
  // org-wide executive dashboard below. The scope's teacherId is resolved
  // server-side from currentUser.id, never a query param. Subject/progress data
  // is restricted to the teacher's class groups. See docs/teacher-access-scope.md.
  const scope = await resolveDataAccessScope(context);
  if (scope.type === "teacher") {
    const { teacherId } = scope;
    const hasFilters = Boolean(sp.search || sp.status || sp.courseId);

    // Subject-level KPIs count only the teacher's own subjects; the student table
    // shows students in the teacher's class groups (see docs/teacher-access-scope.md).
    const ownedSubjectIds = await getTeacherOwnedSubjectIds(organizationId, teacherId);

    const [kpis, courses, progressRows] = await Promise.all([
      getTeacherProgressKPIs(organizationId, teacherId, ownedSubjectIds),
      getTeacherCoursesForFilter(organizationId, teacherId),
      listProgressForDashboard(organizationId, {
        page: pagination.page,
        pageSize: pagination.pageSize,
        search: sp.search,
        status: sp.status,
        courseId: sp.courseId,
        teacherId,
      }),
    ]);

    return (
      <>
        <PageHeader
          title="Progresso dos Meus Alunos"
          description="O progresso académico dos alunos das suas turmas."
        />

        <div className="p-4 sm:p-8 space-y-6">
          <ExecutiveKpiGrid>
            <StatCard
              title="Alunos em Curso"
              value={kpis.inProgressCount}
              icon={<GraduationCap className="size-4 text-indigo-500" />}
              description="progressos em curso ativo"
            />
            <StatCard
              title="Disciplinas Aprovadas"
              value={kpis.subjectPassedCount}
              icon={<CheckCircle2 className="size-4 text-emerald-500" />}
              description="aprovações ao nível de disciplina"
            />
            <StatCard
              title="Disciplinas Reprovadas"
              value={kpis.subjectFailedCount}
              icon={<XCircle className="size-4 text-red-500" />}
              description="reprovações por disciplina"
            />
            <StatCard
              title="Em Recuperação"
              value={kpis.recoveryCount}
              icon={<AlertTriangle className="size-4 text-orange-500" />}
              description="aguardam resolução"
            />
            <StatCard
              title="Bloqueados"
              value={kpis.blockedCount}
              icon={<Lock className="size-4 text-red-600" />}
              description="não podem avançar de nível"
            />
            <StatCard
              title="Baixa Frequência"
              value={kpis.lowAttendanceCount}
              icon={<BarChart3 className="size-4 text-amber-500" />}
              description="presença abaixo de 75%"
            />
            <StatCard
              title="Sem Avaliação"
              value={kpis.noAssessmentCount}
              icon={<BookOpen className="size-4 text-slate-500" />}
              description="matrículas sem resultado"
            />
            <StatCard
              title="Elegíveis para Intervenção"
              value={kpis.interventionCount}
              icon={<ShieldAlert className="size-4 text-rose-500" />}
              description="alunos em risco a acompanhar"
            />
          </ExecutiveKpiGrid>

          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Users className="size-4 text-muted-foreground" />
                  <CardTitle className="text-sm font-medium">Progresso dos Alunos</CardTitle>
                </div>
                <Badge variant="secondary" className="text-xs">
                  {progressRows.total.toLocaleString("pt-PT")}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="p-0 sm:px-4 sm:pb-4">
              {progressRows.total === 0 && !hasFilters ? (
                <EmptyState
                  icon={<GraduationCap className="size-8" />}
                  title="Sem alunos"
                  description="Não existem alunos associados às suas turmas."
                />
              ) : (
                <StudentProgressDashboardTable
                  result={progressRows}
                  courses={courses}
                  defaultSearch={sp.search}
                  defaultStatus={sp.status}
                  defaultCourseId={sp.courseId}
                />
              )}
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
    courseProgressDist,
    levelBlockDist,
    courses,
    insights,
    watchlist,
    progressRows,
  ] = await Promise.all([
    getProgressKPIs(organizationId),
    getProgressTrend(organizationId),
    getProgressStatusDistribution(organizationId),
    getCourseProgressDistribution(organizationId),
    getLevelBlockDistribution(organizationId),
    getActiveCoursesForFilter(organizationId),
    getProgressInsights(organizationId),
    getProgressWatchlist(organizationId),
    listProgressForDashboard(organizationId, {
      page: pagination.page,
      pageSize: pagination.pageSize,
      search: sp.search,
      status: sp.status,
      courseId: sp.courseId,
    }),
  ]);

  const trendLineData = {
    categories: trend.map((t) => t.month),
    series: [
      { name: "Iniciados", data: trend.map((t) => t.started) },
      { name: "Concluídos", data: trend.map((t) => t.completed) },
      { name: "Em Recuperação", data: trend.map((t) => t.recovery) },
      { name: "Reprovados", data: trend.map((t) => t.failed) },
    ],
    colors: ["#6366f1", "#22c55e", "#f97316", "#ef4444"],
  };

  const statusDonutData = {
    labels: statusDist.map((s) => PROGRESS_STATUS_LABELS[s.status] ?? s.status),
    series: statusDist.map((s) => s.count),
    colors: statusDist.map((s) => PROGRESS_STATUS_COLORS[s.status] ?? "#94a3b8"),
  };

  const maxCourseCount = courseProgressDist[0]?.inProgressCount ?? 1;
  const maxLevelCount = levelBlockDist[0]?.issueCount ?? 1;

  return (
    <>
      <PageHeader
        title="Progresso dos Alunos"
        description="Visão executiva do progresso académico, reprovações, bloqueios e elegibilidades."
      />

      <div className="p-4 sm:p-8 space-y-6">

        <ExecutiveKpiGrid>
          <StatCard
            title="Em Curso"
            value={kpis.inProgressCount}
            icon={<GraduationCap className="size-4 text-indigo-500" />}
            description="progressos em curso ativo"
          />
          <StatCard
            title="Concluídos"
            value={kpis.completedCount}
            icon={<CheckCircle2 className="size-4 text-emerald-500" />}
            description="aprovados ou completos"
          />
          <StatCard
            title="Reprovados"
            value={kpis.failedCount}
            icon={<XCircle className="size-4 text-red-500" />}
            description="requerem acompanhamento"
          />
          <StatCard
            title="Em Recuperação"
            value={kpis.recoveryRequiredCount}
            icon={<AlertTriangle className="size-4 text-orange-500" />}
            description="aguardam resolução"
          />
          <StatCard
            title="Bloqueados"
            value={kpis.blockedCount}
            icon={<Lock className="size-4 text-red-600" />}
            description="não podem avançar de nível"
          />
          <StatCard
            title="Aguardam Progressão"
            value={kpis.eligibleCount}
            icon={<Star className="size-4 text-amber-500" />}
            description="elegíveis sem promoção ainda"
          />
          <StatCard
            title="Falhas em Disciplinas"
            value={kpis.subjectFailedCount}
            icon={<BookOpen className="size-4 text-orange-600" />}
            description="reprovações ao nível de disciplina"
          />
          <StatCard
            title="Taxa de Aprovação"
            value={`${kpis.passRate}%`}
            icon={<BarChart3 className="size-4 text-violet-500" />}
            description="aprovados vs. total com resultado"
          />
        </ExecutiveKpiGrid>

        {/* Trend — full width */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <TrendingUp className="size-4 text-muted-foreground" />
              <CardTitle className="text-sm font-medium">Evolução do Progresso</CardTitle>
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
                      <CardTitle className="text-sm font-medium">Watchlist de Alunos</CardTitle>
                    </div>
                    <Badge variant="destructive" className="text-xs">{watchlist.length}</Badge>
                  </div>
                </CardHeader>
                <CardContent className="p-0 pb-2">
                  <ProgressWatchlist items={watchlist} />
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Users className="size-4 text-muted-foreground" />
                    <CardTitle className="text-sm font-medium">Registo de Progresso</CardTitle>
                  </div>
                  <Badge variant="secondary" className="text-xs">
                    {progressRows.total.toLocaleString("pt-PT")}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="p-0 sm:px-4 sm:pb-4">
                <StudentProgressDashboardTable
                  result={progressRows}
                  courses={courses}
                  defaultSearch={sp.search}
                  defaultStatus={sp.status}
                  defaultCourseId={sp.courseId}
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
              <Tabs defaultValue="courses">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Análise</CardTitle>
                  <TabsList className="w-full mt-2 grid grid-cols-3 h-8">
                    <TabsTrigger value="courses" className="text-xs">Por Curso</TabsTrigger>
                    <TabsTrigger value="status" className="text-xs">Por Estado</TabsTrigger>
                    <TabsTrigger value="levels" className="text-xs">Por Nível</TabsTrigger>
                  </TabsList>
                </CardHeader>
                <CardContent className="pt-0">

                  <TabsContent value="courses" className="mt-0">
                    {courseProgressDist.length > 0 ? (
                      <div className="space-y-3 pt-1">
                        {courseProgressDist.map((c) => {
                          const pct = Math.round((c.inProgressCount / maxCourseCount) * 100);
                          return (
                            <div key={c.courseId} className="space-y-1">
                              <div className="flex items-center justify-between text-xs">
                                <span className="truncate">{c.courseName}</span>
                                <span className="font-medium tabular-nums shrink-0 ml-2">
                                  {c.inProgressCount}
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
                        Sem progressos ativos por curso.
                      </p>
                    )}
                  </TabsContent>

                  <TabsContent value="status" className="mt-0">
                    {statusDonutData.series.length > 0 ? (
                      <ApexDonutChart data={statusDonutData} height={200} />
                    ) : (
                      <p className="text-sm text-muted-foreground py-4 text-center">
                        Sem dados de estado.
                      </p>
                    )}
                  </TabsContent>

                  <TabsContent value="levels" className="mt-0">
                    {levelBlockDist.length > 0 ? (
                      <div className="space-y-3 pt-1">
                        {levelBlockDist.map((l) => {
                          const pct = Math.round((l.issueCount / maxLevelCount) * 100);
                          return (
                            <div key={l.courseLevelId} className="space-y-1">
                              <div className="flex items-center justify-between text-xs">
                                <span className="truncate">{l.levelName}</span>
                                <span className="font-medium tabular-nums shrink-0 ml-2 text-red-600">
                                  {l.issueCount}
                                </span>
                              </div>
                              <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                                <div
                                  className="h-full rounded-full bg-red-500"
                                  style={{ width: `${pct}%` }}
                                />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground py-4 text-center">
                        Sem bloqueios ou reprovações por nível.
                      </p>
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
