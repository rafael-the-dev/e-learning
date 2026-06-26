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
import { getDb } from "@/server/db";
import { normalizePaginationParams } from "@/shared/lib/pagination";
import {
  getGradeKPIs,
  getAcademicTrend,
  getGradeStatusDistribution,
  getCoursePerformance,
  getTopRiskSubjects,
  listGradeResults,
} from "@/modules/grades/services/grade-metrics.service";
import { getGradeInsights } from "@/modules/grades/services/grade-insights.service";
import { getGradeWatchlist } from "@/modules/grades/services/grade-watchlist.service";
import { getAcademicRiskStats } from "@/modules/grades/services/academic-risk.service";
import { GradeActionBar } from "@/modules/grades/components/grade-action-bar";
import { GradeTableFilters } from "@/modules/grades/components/grade-table-filters";
import { GradesTable } from "@/modules/grades/components/grades-table";
import { GradeWatchlist } from "@/modules/grades/components/grade-watchlist";
import {
  ClipboardList,
  GraduationCap,
  CheckCircle2,
  FileEdit,
  AlertTriangle,
  TrendingUp,
  ShieldAlert,
  Users,
} from "lucide-react";

export const metadata = { title: "Desempenho Académico" };

const SUBJECT_STATUS_LABELS: Record<string, string> = {
  NOT_STARTED: "Não Iniciado",
  IN_PROGRESS: "Em Progresso",
  PASSED: "Aprovado",
  FAILED: "Reprovado",
  INCOMPLETE: "Incompleto",
  BLOCKED: "Bloqueado",
};

const SUBJECT_STATUS_COLORS: Record<string, string> = {
  PASSED: "#22c55e",
  FAILED: "#ef4444",
  IN_PROGRESS: "#f59e0b",
  NOT_STARTED: "#94a3b8",
  INCOMPLETE: "#6366f1",
  BLOCKED: "#78716c",
};

export default async function GradesPage({
  searchParams,
}: {
  searchParams: Promise<{
    page?: string;
    search?: string;
    subjectId?: string;
    classGroupId?: string;
    status?: string;
  }>;
}) {
  const context = await requirePermissionOrRedirect(PERMISSIONS.GRADES_VIEW);
  // Teacher-scoped users never see this org-wide page — routed to their scoped Portal. See docs/teacher-access-scope.md.
  await redirectIfTeacherScoped(context);

  const sp = await searchParams;
  const pagination = normalizePaginationParams(sp.page);
  const db = await getDb();
  const { organizationId } = context;

  const perms = await getUserPermissions(context.userId, organizationId);
  const ability = createAbility(perms);
  const canGrade = ability.can(PERMISSIONS.GRADES_CREATE);

  const [subjects, classGroups] = await Promise.all([
    db.subject.findMany({
      where: { organizationId, deletedAt: null },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    db.classGroup.findMany({
      where: { organizationId, deletedAt: null },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  const [kpis, trend, statusDist, coursePerf, riskSubjects, insights, watchlist, riskStats, gradeResults] =
    await Promise.all([
      getGradeKPIs(organizationId),
      getAcademicTrend(organizationId),
      getGradeStatusDistribution(organizationId),
      getCoursePerformance(organizationId),
      getTopRiskSubjects(organizationId),
      getGradeInsights(organizationId),
      getGradeWatchlist(organizationId),
      getAcademicRiskStats(organizationId),
      listGradeResults(organizationId, {
        page: pagination.page,
        pageSize: pagination.pageSize,
        subjectId: sp.subjectId,
        classGroupId: sp.classGroupId,
        status: sp.status,
        search: sp.search,
      }),
    ]);

  // Chart DTOs
  const trendLineData = {
    categories: trend.map((t) => t.month),
    series: [{ name: "Média das Notas (%)", data: trend.map((t) => t.avgGrade) }],
    colors: ["#6366f1"],
  };

  const approvalDonutData = {
    labels: statusDist.map((s) => SUBJECT_STATUS_LABELS[s.status] ?? s.status),
    series: statusDist.map((s) => s.count),
    colors: statusDist.map((s) => SUBJECT_STATUS_COLORS[s.status] ?? "#94a3b8"),
  };

  const maxCourseGrade = coursePerf[0]?.avgGrade ?? 100;

  return (
    <>
      <PageHeader
        title="Desempenho Académico"
        description="Visão geral das notas, aprovações, riscos académicos e performance por curso."
        actions={
          canGrade ? (
            <Button asChild size="sm">
              <Link href="/grades/entry">
                <ClipboardList className="size-4 mr-1.5" />
                Lançar Notas
              </Link>
            </Button>
          ) : undefined
        }
      />

      <GradeActionBar
        draftCount={kpis.draftCount}
        submittedCount={kpis.submittedCount}
        failedSubjectCount={kpis.failedSubjectCount}
      />

      <div className="p-4 sm:p-8 space-y-6">

        {/* KPI Cards */}
        <ExecutiveKpiGrid>
          <StatCard
            title="Total de Notas"
            value={kpis.totalResults}
            icon={<ClipboardList className="size-4 text-muted-foreground" />}
            description="registos de avaliação"
          />
          <StatCard
            title="Classificadas"
            value={kpis.gradedCount}
            icon={<CheckCircle2 className="size-4 text-emerald-500" />}
            description="notas finalizadas"
          />
          <StatCard
            title="Por Classificar"
            value={kpis.draftCount}
            icon={<FileEdit className="size-4 text-amber-500" />}
            description="em rascunho"
          />
          <StatCard
            title="Aguardam Revisão"
            value={kpis.submittedCount}
            icon={<ClipboardList className="size-4 text-blue-500" />}
            description="submetidas"
          />
          <StatCard
            title="Média Geral"
            value={kpis.avgNormalizedGrade != null ? `${kpis.avgNormalizedGrade.toLocaleString("pt-PT")}%` : "—"}
            icon={<TrendingUp className="size-4 text-indigo-500" />}
            description="nota normalizada"
          />
          <StatCard
            title="Taxa de Aprovação"
            value={`${kpis.approvalRate.toLocaleString("pt-PT")}%`}
            icon={<GraduationCap className="size-4 text-green-500" />}
            description="disciplinas aprovadas"
          />
          <StatCard
            title="Alunos em Risco"
            value={riskStats.atRiskStudentCount}
            icon={<AlertTriangle className="size-4 text-red-500" />}
            description="com disciplina reprovada"
          />
          <StatCard
            title="Reprovações Este Mês"
            value={riskStats.failedThisMonth}
            icon={<ShieldAlert className="size-4 text-orange-500" />}
            description="disciplinas reprovadas"
          />
        </ExecutiveKpiGrid>

        {/* Academic performance trend — full width */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <TrendingUp className="size-4 text-muted-foreground" />
              <CardTitle className="text-sm font-medium">Evolução do Desempenho Académico</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <ApexLineChart data={trendLineData} height={220} smooth />
          </CardContent>
        </Card>

        {/* Two-column main content */}
        <ExecutiveMainGrid>

          {/* LEFT: Watchlist + Table */}
          <ExecutiveLeftColumn>

            {watchlist.length > 0 && (
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <ShieldAlert className="size-4 text-muted-foreground" />
                      <CardTitle className="text-sm font-medium">Watchlist Académica</CardTitle>
                    </div>
                    <Badge variant="destructive" className="text-xs">{watchlist.length}</Badge>
                  </div>
                </CardHeader>
                <CardContent className="p-0 pb-2">
                  <GradeWatchlist items={watchlist} />
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <ClipboardList className="size-4 text-muted-foreground" />
                    <CardTitle className="text-sm font-medium">Registos de Notas</CardTitle>
                  </div>
                  <Badge variant="secondary" className="text-xs">
                    {gradeResults.total.toLocaleString("pt-PT")}
                  </Badge>
                </div>
                <GradeTableFilters
                  subjects={subjects}
                  classGroups={classGroups}
                  defaultSearch={sp.search}
                  defaultSubjectId={sp.subjectId}
                  defaultClassGroupId={sp.classGroupId}
                  defaultStatus={sp.status}
                />
              </CardHeader>
              <CardContent className="p-0 sm:px-4 sm:pb-4">
                <GradesTable result={gradeResults} />
              </CardContent>
            </Card>

          </ExecutiveLeftColumn>

          {/* RIGHT: Insights + Tabbed analysis + Approval donut */}
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

            {/* Tabbed analysis */}
            <Card>
              <Tabs defaultValue="courses">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Análise</CardTitle>
                  <TabsList className="w-full mt-2 grid grid-cols-2 h-8">
                    <TabsTrigger value="courses" className="text-xs">Cursos</TabsTrigger>
                    <TabsTrigger value="subjects" className="text-xs">Disciplinas</TabsTrigger>
                  </TabsList>
                </CardHeader>
                <CardContent className="pt-0">

                  <TabsContent value="courses" className="mt-0">
                    {coursePerf.length > 0 ? (
                      <div className="space-y-3 pt-1">
                        {coursePerf.map((c) => {
                          const pct = maxCourseGrade > 0 ? Math.round((c.avgGrade / maxCourseGrade) * 100) : 0;
                          return (
                            <div key={c.courseName} className="space-y-1">
                              <div className="flex items-center justify-between text-xs">
                                <span className="truncate">{c.courseName}</span>
                                <span className="font-medium tabular-nums shrink-0 ml-2">
                                  {c.avgGrade.toLocaleString("pt-PT")}%
                                </span>
                              </div>
                              <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                                <div className="h-full rounded-full bg-indigo-500" style={{ width: `${pct}%` }} />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground py-4 text-center">Sem dados de cursos.</p>
                    )}
                  </TabsContent>

                  <TabsContent value="subjects" className="mt-0">
                    {riskSubjects.length > 0 ? (
                      <div className="space-y-3 pt-1">
                        {riskSubjects.map((s) => (
                          <div key={s.subjectName} className="space-y-1">
                            <div className="flex items-center justify-between text-xs">
                              <span className="truncate">{s.subjectName}</span>
                              <span className="font-medium tabular-nums shrink-0 ml-2 text-red-600">
                                {s.failureRate}%
                              </span>
                            </div>
                            <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                              <div
                                className="h-full rounded-full bg-red-500"
                                style={{ width: `${s.failureRate}%` }}
                              />
                            </div>
                            <p className="text-[10px] text-muted-foreground">
                              {s.failureCount} de {s.totalCount} aluno(s)
                            </p>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground py-4 text-center">Sem disciplinas em risco.</p>
                    )}
                  </TabsContent>

                </CardContent>
              </Tabs>
            </Card>

            {/* Approval rate donut */}
            <DashboardSideCard
              title="Progressão por Estado"
              icon={<Users className="size-4" />}
            >
              {approvalDonutData.series.length > 0 ? (
                <ApexDonutChart data={approvalDonutData} height={200} />
              ) : (
                <p className="text-sm text-muted-foreground py-4 text-center">Sem dados de progressão.</p>
              )}
            </DashboardSideCard>

          </ExecutiveRightColumn>
        </ExecutiveMainGrid>
      </div>
    </>
  );
}
