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
import { getUserPermissions, createAbility } from "@/server/auth/rbac";
import { PERMISSIONS } from "@/server/auth/permissions";
import { getDb } from "@/server/db";
import { normalizePaginationParams } from "@/shared/lib/pagination";
import {
  getClassGroupKPIs,
  getClassGroupTrend,
  getClassGroupStatusDistribution,
  getOccupancyAnalysis,
  getTeacherDistribution,
  getOperationalIssues,
} from "@/modules/class-groups/services/class-group-metrics.service";
import { getClassGroupInsights } from "@/modules/class-groups/services/class-group-insights.service";
import { getClassGroupWatchlist } from "@/modules/class-groups/services/class-group-watchlist.service";
import { getClassGroupsByOrganization } from "@/modules/class-groups/services/class-group.service";
import { ClassGroupActionBar } from "@/modules/class-groups/components/class-group-action-bar";
import { ClassGroupsTable } from "@/modules/class-groups/components/class-groups-table";
import { ClassGroupWatchlist } from "@/modules/class-groups/components/class-group-watchlist";
import {
  Users,
  CheckCircle2,
  Clock,
  GraduationCap,
  BookOpen,
  TrendingUp,
  AlertTriangle,
  ShieldAlert,
  Plus,
} from "lucide-react";
import { CLASS_GROUP_STATUS_LABELS } from "@/modules/class-groups/types";

export const metadata = { title: "Turmas" };

const STATUS_COLORS: Record<string, string> = {
  ACTIVE: "#22c55e",
  FORMING: "#f59e0b",
  COMPLETED: "#6366f1",
  CANCELLED: "#ef4444",
  ARCHIVED: "#94a3b8",
};

export default async function ClassGroupsPage({
  searchParams,
}: {
  searchParams: Promise<{
    page?: string;
    search?: string;
    status?: string;
    courseId?: string;
    branchId?: string;
    yearId?: string;
  }>;
}) {
  const context = await requirePermissionOrRedirect(PERMISSIONS.CLASS_GROUPS_READ);

  const sp = await searchParams;
  const pagination = normalizePaginationParams(sp.page);
  const { organizationId } = context;

  const perms = await getUserPermissions(context.userId, organizationId);
  const ability = createAbility(perms);
  const canCreate = ability.can(PERMISSIONS.CLASS_GROUPS_CREATE);
  const canEdit = ability.can(PERMISSIONS.CLASS_GROUPS_UPDATE);
  const canArchive = ability.can(PERMISSIONS.CLASS_GROUPS_ARCHIVE);
  const canDelete = ability.can(PERMISSIONS.CLASS_GROUPS_DELETE);

  const db = await getDb();
  const [courses, branches, academicYears] = await Promise.all([
    db.course.findMany({
      where: { organizationId, deletedAt: null, status: { not: "ARCHIVED" } },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    db.branch.findMany({
      where: { organizationId, deletedAt: null },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    db.academicYear.findMany({
      where: { organizationId, deletedAt: null, status: { not: "ARCHIVED" } },
      select: { id: true, name: true },
      orderBy: { startDate: "desc" },
    }),
  ]);

  const [
    kpis,
    trend,
    statusDist,
    occupancy,
    teacherDist,
    operational,
    insights,
    watchlist,
    classGroups,
  ] = await Promise.all([
    getClassGroupKPIs(organizationId),
    getClassGroupTrend(organizationId),
    getClassGroupStatusDistribution(organizationId),
    getOccupancyAnalysis(organizationId),
    getTeacherDistribution(organizationId),
    getOperationalIssues(organizationId),
    getClassGroupInsights(organizationId),
    getClassGroupWatchlist(organizationId),
    getClassGroupsByOrganization(organizationId, {
      page: pagination.page,
      pageSize: pagination.pageSize,
      search: sp.search,
      status: sp.status,
      courseId: sp.courseId,
      branchId: sp.branchId,
      academicYearId: sp.yearId,
    }),
  ]);

  const trendLineData = {
    categories: trend.map((t) => t.month),
    series: [{ name: "Turmas Criadas", data: trend.map((t) => t.count) }],
    colors: ["#6366f1"],
  };

  const statusDonutData = {
    labels: statusDist.map((s) => CLASS_GROUP_STATUS_LABELS[s.status] ?? s.status),
    series: statusDist.map((s) => s.count),
    colors: statusDist.map((s) => STATUS_COLORS[s.status] ?? "#94a3b8"),
  };

  const maxTeacherGroups = teacherDist[0]?.groupCount ?? 1;

  return (
    <>
      <PageHeader
        title="Turmas"
        description="Visão geral das turmas, ocupação, professores e alertas operacionais."
        actions={
          canCreate ? (
            <Button asChild size="sm">
              <Link href="/class-groups/new">
                <Plus className="size-4 mr-1.5" />
                Nova Turma
              </Link>
            </Button>
          ) : undefined
        }
      />

      <ClassGroupActionBar
        formingCount={kpis.formingCount}
        lowOccupancyCount={kpis.lowOccupancyCount}
        pendingOperationalIssues={kpis.pendingOperationalIssues}
      />

      <div className="p-4 sm:p-8 space-y-6">

        <ExecutiveKpiGrid>
          <StatCard
            title="Total de Turmas"
            value={kpis.totalGroups}
            icon={<Users className="size-4 text-muted-foreground" />}
            description="grupos de alunos"
          />
          <StatCard
            title="Turmas Ativas"
            value={kpis.activeCount}
            icon={<CheckCircle2 className="size-4 text-emerald-500" />}
            description="em funcionamento"
          />
          <StatCard
            title="Em Formação"
            value={kpis.formingCount}
            icon={<Clock className="size-4 text-amber-500" />}
            description="a aguardar alunos"
          />
          <StatCard
            title="Concluídas"
            value={kpis.completedCount}
            icon={<GraduationCap className="size-4 text-indigo-500" />}
            description="turmas terminadas"
          />
          <StatCard
            title="Total de Inscrições"
            value={kpis.totalEnrollments.toLocaleString("pt-PT")}
            icon={<BookOpen className="size-4 text-blue-500" />}
            description="em turmas não arquivadas"
          />
          <StatCard
            title="Taxa de Ocupação"
            value={`${kpis.occupancyRate.toLocaleString("pt-PT")}%`}
            icon={<TrendingUp className="size-4 text-green-500" />}
            description="inscritos / capacidade total"
          />
          <StatCard
            title="Baixa Ocupação"
            value={kpis.lowOccupancyCount}
            icon={<AlertTriangle className="size-4 text-orange-500" />}
            description="turmas ativas abaixo de 50%"
          />
          <StatCard
            title="Problemas Operacionais"
            value={kpis.pendingOperationalIssues}
            icon={<ShieldAlert className="size-4 text-red-500" />}
            description="sem professor, horário ou sala"
          />
        </ExecutiveKpiGrid>

        {/* Growth trend — full width */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <TrendingUp className="size-4 text-muted-foreground" />
              <CardTitle className="text-sm font-medium">Evolução de Turmas Criadas</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <ApexLineChart data={trendLineData} height={220} smooth />
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
                      <CardTitle className="text-sm font-medium">Watchlist de Turmas</CardTitle>
                    </div>
                    <Badge variant="destructive" className="text-xs">{watchlist.length}</Badge>
                  </div>
                </CardHeader>
                <CardContent className="p-0 pb-2">
                  <ClassGroupWatchlist items={watchlist} />
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Users className="size-4 text-muted-foreground" />
                    <CardTitle className="text-sm font-medium">Registo de Turmas</CardTitle>
                  </div>
                  <Badge variant="secondary" className="text-xs">
                    {classGroups.total.toLocaleString("pt-PT")}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="p-0 sm:px-4 sm:pb-4">
                <ClassGroupsTable
                  result={classGroups}
                  courses={courses}
                  branches={branches}
                  academicYears={academicYears}
                  defaultSearch={sp.search}
                  defaultStatus={sp.status}
                  defaultCourseId={sp.courseId}
                  defaultBranchId={sp.branchId}
                  defaultAcademicYearId={sp.yearId}
                  canEdit={canEdit}
                  canArchive={canArchive}
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

            {/* Tabbed analysis */}
            <Card>
              <Tabs defaultValue="occupancy">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Análise</CardTitle>
                  <TabsList className="w-full mt-2 grid grid-cols-3 h-8">
                    <TabsTrigger value="occupancy" className="text-xs">Ocupação</TabsTrigger>
                    <TabsTrigger value="teachers" className="text-xs">Professores</TabsTrigger>
                    <TabsTrigger value="operational" className="text-xs">Operacional</TabsTrigger>
                  </TabsList>
                </CardHeader>
                <CardContent className="pt-0">

                  {/* Ocupação: weighted % per active group */}
                  <TabsContent value="occupancy" className="mt-0">
                    {occupancy.length > 0 ? (
                      <div className="space-y-3 pt-1">
                        {occupancy.map((g) => (
                          <div key={g.id} className="space-y-1">
                            <div className="flex items-center justify-between text-xs">
                              <span className="truncate">{g.name}</span>
                              <span className="font-medium tabular-nums shrink-0 ml-2">
                                {g.enrolled}/{g.capacity}
                              </span>
                            </div>
                            <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                              <div
                                className="h-full rounded-full bg-indigo-500"
                                style={{ width: `${Math.min(g.occupancyRate, 100)}%` }}
                              />
                            </div>
                            <p className="text-[10px] text-muted-foreground">
                              {g.occupancyRate}% de ocupação
                            </p>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground py-4 text-center">Sem turmas ativas.</p>
                    )}
                  </TabsContent>

                  {/* Professores: group count per teacher */}
                  <TabsContent value="teachers" className="mt-0">
                    {teacherDist.length > 0 ? (
                      <div className="space-y-3 pt-1">
                        {teacherDist.map((t) => {
                          const pct = maxTeacherGroups > 0
                            ? Math.round((t.groupCount / maxTeacherGroups) * 100)
                            : 0;
                          return (
                            <div key={t.teacherName} className="space-y-1">
                              <div className="flex items-center justify-between text-xs">
                                <span className="truncate">{t.teacherName}</span>
                                <span className="font-medium tabular-nums shrink-0 ml-2">
                                  {t.groupCount}
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
                      <p className="text-sm text-muted-foreground py-4 text-center">Sem professores atribuídos.</p>
                    )}
                  </TabsContent>

                  {/* Operacional: issue counts with affected group names */}
                  <TabsContent value="operational" className="mt-0">
                    <div className="space-y-4 pt-1">

                      <OperationalIssueGroup
                        label="Sem Professor"
                        count={operational.noTeacherCount}
                        groups={operational.noTeacherGroups}
                        accentClass="text-red-600"
                      />
                      <OperationalIssueGroup
                        label="Sem Horário"
                        count={operational.noScheduleCount}
                        groups={operational.noScheduleGroups}
                        accentClass="text-orange-600"
                      />
                      <OperationalIssueGroup
                        label="Sem Sala"
                        count={operational.noClassroomCount}
                        groups={operational.noClassroomGroups}
                        accentClass="text-amber-600"
                      />

                      {operational.noTeacherCount === 0 &&
                        operational.noScheduleCount === 0 &&
                        operational.noClassroomCount === 0 && (
                          <p className="text-sm text-muted-foreground py-2 text-center">
                            Sem problemas operacionais.
                          </p>
                        )}
                    </div>
                  </TabsContent>

                </CardContent>
              </Tabs>
            </Card>

            {/* Status distribution donut */}
            <DashboardSideCard
              title="Estado das Turmas"
              icon={<Users className="size-4" />}
            >
              {statusDonutData.series.length > 0 ? (
                <ApexDonutChart data={statusDonutData} height={200} />
              ) : (
                <p className="text-sm text-muted-foreground py-4 text-center">Sem dados de estado.</p>
              )}
            </DashboardSideCard>

          </ExecutiveRightColumn>

        </ExecutiveMainGrid>
      </div>
    </>
  );
}

// ─── Operational Issue Group (inline sub-component) ───────────────────────────

function OperationalIssueGroup({
  label,
  count,
  groups,
  accentClass,
}: {
  label: string;
  count: number;
  groups: Array<{ id: string; name: string }>;
  accentClass: string;
}) {
  if (count === 0) return null;
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium">{label}</span>
        <span className={`font-semibold tabular-nums ${accentClass}`}>{count}</span>
      </div>
      <div className="space-y-0.5 pl-2 border-l-2 border-muted">
        {groups.slice(0, 5).map((g) => (
          <Link
            key={g.id}
            href={`/class-groups/${g.id}`}
            className="block text-[11px] text-muted-foreground hover:text-foreground hover:underline truncate"
          >
            {g.name}
          </Link>
        ))}
        {groups.length > 5 && (
          <span className="text-[11px] text-muted-foreground">+{groups.length - 5} mais</span>
        )}
      </div>
    </div>
  );
}
