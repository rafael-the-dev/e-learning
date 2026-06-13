import { redirect } from "next/navigation";
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
import { requirePermission } from "@/server/auth/context";
import { getUserPermissions, createAbility } from "@/server/auth/rbac";
import { PERMISSIONS } from "@/server/auth/permissions";
import { normalizePaginationParams } from "@/shared/lib/pagination";
import { getActiveBranches } from "@/modules/teachers/services/teacher.service";
import {
  getTeacherKPIs,
  getTeacherTrend,
  getTeacherStatusDistribution,
  getSubjectDistribution,
  getWorkloadDistribution,
  getBranchDistribution,
  listTeachersForDashboard,
} from "@/modules/teachers/services/teacher-metrics.service";
import { getTeacherInsights } from "@/modules/teachers/services/teacher-insights.service";
import { getTeacherWatchlist } from "@/modules/teachers/services/teacher-watchlist.service";
import { TeacherActionBar } from "@/modules/teachers/components/teacher-action-bar";
import { TeacherWatchlist } from "@/modules/teachers/components/teacher-watchlist";
import { TeachersDashboardTable } from "@/modules/teachers/components/teachers-dashboard-table";
import {
  Users,
  UserCheck,
  UserX,
  BookOpen,
  Building2,
  AlertTriangle,
  FileEdit,
  BarChart2,
  TrendingUp,
  ShieldAlert,
  UserPlus,
} from "lucide-react";
import { TEACHER_STATUS_LABELS } from "@/modules/teachers/types";
import type { AuthContext } from "@/server/auth/context";

export const metadata = { title: "Professores" };

const TEACHER_STATUS_COLORS: Record<string, string> = {
  ACTIVE: "#22c55e",
  SUSPENDED: "#f59e0b",
  INACTIVE: "#94a3b8",
};

export default async function TeachersPage({
  searchParams,
}: {
  searchParams: Promise<{
    page?: string;
    search?: string;
    status?: string;
    branchId?: string;
  }>;
}) {
  let context: AuthContext;
  try {
    context = await requirePermission(PERMISSIONS.TEACHERS_READ);
  } catch {
    redirect("/forbidden");
  }

  const sp = await searchParams;
  const pagination = normalizePaginationParams(sp.page);
  const { organizationId } = context;

  const perms = await getUserPermissions(context.userId, organizationId);
  const ability = createAbility(perms);
  const canCreate = ability.can(PERMISSIONS.TEACHERS_CREATE);
  const canEdit = ability.can(PERMISSIONS.TEACHERS_UPDATE);
  const canSuspend = ability.can(PERMISSIONS.TEACHERS_SUSPEND);
  const canDelete = ability.can(PERMISSIONS.TEACHERS_DELETE);

  const [
    kpis,
    trend,
    statusDist,
    subjectDist,
    workloadDist,
    branchDist,
    insights,
    watchlist,
    teachers,
    branches,
  ] = await Promise.all([
    getTeacherKPIs(organizationId),
    getTeacherTrend(organizationId),
    getTeacherStatusDistribution(organizationId),
    getSubjectDistribution(organizationId),
    getWorkloadDistribution(organizationId),
    getBranchDistribution(organizationId),
    getTeacherInsights(organizationId),
    getTeacherWatchlist(organizationId),
    listTeachersForDashboard(organizationId, {
      page: pagination.page,
      pageSize: pagination.pageSize,
      search: sp.search,
      status: sp.status,
      branchId: sp.branchId,
    }),
    getActiveBranches(organizationId),
  ]);

  const trendLineData = {
    categories: trend.map((t) => t.month),
    series: [
      { name: "Registados", data: trend.map((t) => t.registered) },
      { name: "Ativos", data: trend.map((t) => t.active) },
      { name: "Com Turma Ativa", data: trend.map((t) => t.withActiveGroups) },
    ],
    colors: ["#6366f1", "#22c55e", "#f59e0b"],
  };

  const statusDonutData = {
    labels: statusDist.map((s) => TEACHER_STATUS_LABELS[s.status] ?? s.status),
    series: statusDist.map((s) => s.count),
    colors: statusDist.map((s) => TEACHER_STATUS_COLORS[s.status] ?? "#94a3b8"),
  };

  const maxSubjectCount = subjectDist[0]?.teacherCount ?? 1;
  const maxWorkloadCount = workloadDist[0]?.classGroupCount ?? 1;
  const maxBranchCount = branchDist[0]?.teacherCount ?? 1;

  return (
    <>
      <PageHeader
        title="Professores"
        description="Visão executiva do corpo docente, alocações, carga de trabalho e risco operacional."
        actions={
          canCreate ? (
            <Button asChild size="sm">
              <Link href="/teachers/new">
                <UserPlus className="size-4 mr-1.5" />
                Novo Professor
              </Link>
            </Button>
          ) : undefined
        }
      />

      <TeacherActionBar
        noSubjectsCount={kpis.noSubjectsCount}
        noClassGroupCount={kpis.noClassGroupCount}
        overdueAssessmentsCount={kpis.overdueAssessmentsCount}
      />

      <div className="p-4 sm:p-8 space-y-6">

        <ExecutiveKpiGrid>
          <StatCard
            title="Total de Professores"
            value={kpis.totalTeachers}
            icon={<Users className="size-4 text-muted-foreground" />}
            description="registados na organização"
          />
          <StatCard
            title="Ativos"
            value={kpis.activeCount}
            icon={<UserCheck className="size-4 text-emerald-500" />}
            description="em funções"
          />
          <StatCard
            title="Suspensos"
            value={kpis.suspendedCount}
            icon={<UserX className="size-4 text-amber-500" />}
            description="acesso suspenso"
          />
          <StatCard
            title="Sem Disciplinas"
            value={kpis.noSubjectsCount}
            icon={<BookOpen className="size-4 text-orange-500" />}
            description="ativos sem alocação"
          />
          <StatCard
            title="Sem Turma Ativa"
            value={kpis.noClassGroupCount}
            icon={<Building2 className="size-4 text-amber-500" />}
            description="com disciplinas mas sem turma"
          />
          <StatCard
            title="Avaliações em Atraso"
            value={kpis.overdueAssessmentsCount}
            icon={<AlertTriangle className="size-4 text-red-500" />}
            description="com OPEN fora do prazo"
          />
          <StatCard
            title="A Classificar"
            value={kpis.pendingGradingCount}
            icon={<FileEdit className="size-4 text-indigo-500" />}
            description="com resultados por lançar"
          />
          <StatCard
            title="Carga Média"
            value={kpis.avgWorkload}
            icon={<BarChart2 className="size-4 text-violet-500" />}
            description="turmas ativas por professor"
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
                      <CardTitle className="text-sm font-medium">Watchlist de Professores</CardTitle>
                    </div>
                    <Badge variant="destructive" className="text-xs">{watchlist.length}</Badge>
                  </div>
                </CardHeader>
                <CardContent className="p-0 pb-2">
                  <TeacherWatchlist items={watchlist} />
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Users className="size-4 text-muted-foreground" />
                    <CardTitle className="text-sm font-medium">Registo de Professores</CardTitle>
                  </div>
                  <Badge variant="secondary" className="text-xs">
                    {teachers.total.toLocaleString("pt-PT")}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="p-0 sm:px-4 sm:pb-4">
                <TeachersDashboardTable
                  result={teachers}
                  branches={branches}
                  defaultSearch={sp.search}
                  defaultStatus={sp.status}
                  defaultBranchId={sp.branchId}
                  canEdit={canEdit}
                  canSuspend={canSuspend}
                  canDelete={canDelete}
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
              <Tabs defaultValue="subjects">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Análise</CardTitle>
                  <TabsList className="w-full mt-2 grid grid-cols-3 h-8">
                    <TabsTrigger value="subjects" className="text-xs">Disciplinas</TabsTrigger>
                    <TabsTrigger value="workload" className="text-xs">Carga</TabsTrigger>
                    <TabsTrigger value="branches" className="text-xs">Filiais</TabsTrigger>
                  </TabsList>
                </CardHeader>
                <CardContent className="pt-0">

                  <TabsContent value="subjects" className="mt-0">
                    {subjectDist.length > 0 ? (
                      <div className="space-y-3 pt-1">
                        {subjectDist.map((s) => {
                          const pct = Math.round((s.teacherCount / maxSubjectCount) * 100);
                          return (
                            <div key={s.subjectId} className="space-y-1">
                              <div className="flex items-center justify-between text-xs">
                                <span className="truncate">{s.subjectName}</span>
                                <span className="font-medium tabular-nums shrink-0 ml-2">
                                  {s.teacherCount}
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
                        Sem disciplinas atribuídas.
                      </p>
                    )}
                  </TabsContent>

                  <TabsContent value="workload" className="mt-0">
                    {workloadDist.length > 0 ? (
                      <div className="space-y-3 pt-1">
                        {workloadDist.map((w) => {
                          const pct = Math.round((w.classGroupCount / maxWorkloadCount) * 100);
                          return (
                            <div key={w.teacherName} className="space-y-1">
                              <div className="flex items-center justify-between text-xs">
                                <span className="truncate">{w.teacherName}</span>
                                <span className="font-medium tabular-nums shrink-0 ml-2">
                                  {w.classGroupCount}
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
                        Sem turmas ativas atribuídas.
                      </p>
                    )}
                  </TabsContent>

                  <TabsContent value="branches" className="mt-0">
                    {branchDist.length > 0 ? (
                      <div className="space-y-3 pt-1">
                        {branchDist.map((b) => {
                          const pct = Math.round((b.teacherCount / maxBranchCount) * 100);
                          return (
                            <div key={b.branchName} className="space-y-1">
                              <div className="flex items-center justify-between text-xs">
                                <span className="truncate">{b.branchName}</span>
                                <span className="font-medium tabular-nums shrink-0 ml-2">
                                  {b.teacherCount}
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
                        Sem filiais configuradas.
                      </p>
                    )}
                  </TabsContent>

                </CardContent>
              </Tabs>
            </Card>

            <DashboardSideCard
              title="Estado dos Professores"
              icon={<Users className="size-4" />}
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
