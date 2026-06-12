import { redirect } from "next/navigation";
import Link from "next/link";
import { PageHeader } from "@/shared/components/layout/page-header";
import { StatCard } from "@/shared/components/layout/stat-card";
import { Button } from "@/shared/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui/card";
import {
  ExecutiveMainGrid,
  ExecutiveLeftColumn,
  ExecutiveRightColumn,
  ExecutiveKpiGrid,
  DashboardSideCard,
  DashboardInsightRow,
  QuickActionTile,
} from "@/shared/components/layout/executive-dashboard";
import { ApexDonutChart, ApexBarChart, ApexLineChart } from "@/shared/components/charts";
import { requirePermission } from "@/server/auth/context";
import { getUserPermissions, createAbility } from "@/server/auth/rbac";
import { PERMISSIONS } from "@/server/auth/permissions";
import {
  getStudentsByOrganization,
  getActiveBranches,
  getStudentStats,
  countNewStudents,
  getStudentsWithPendingPayments,
  getStudentsAtAcademicRisk,
  getStudentsWithLowAttendance,
  getTopCoursesByStudents,
  getTopClassGroupsByOccupancy,
  getRiskWatchlist,
  getPendingEnrollmentsCount,
} from "@/modules/students/services/student.service";
import { StudentsTable } from "@/modules/students/components/students-table";
import { RiskWatchlist } from "@/modules/students/components/risk-watchlist";
import { normalizePaginationParams } from "@/shared/lib/pagination";
import { cn } from "@/shared/lib/utils";
import {
  GraduationCap,
  UserCheck,
  UserPlus,
  UserX,
  ClipboardList,
  AlertCircle,
  Clock,
  AlertTriangle,
  ShieldAlert,
  Users,
  Lightbulb,
  Eye,
  LayoutGrid,
} from "lucide-react";
import type { AuthContext } from "@/server/auth/context";

export const metadata = { title: "Alunos" };

const STATUS_LABELS: Record<string, string> = {
  ACTIVE: "Ativo",
  PENDING: "Pendente",
  SUSPENDED: "Suspenso",
  COMPLETED: "Concluído",
  DROPPED: "Abandonado",
};

const STATUS_COLORS: Record<string, string> = {
  ACTIVE: "#22c55e",
  PENDING: "#f59e0b",
  SUSPENDED: "#ef4444",
  COMPLETED: "#3b82f6",
  DROPPED: "#94a3b8",
};

export default async function StudentsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; search?: string; status?: string; branchId?: string }>;
}) {
  let context: AuthContext;
  try {
    context = await requirePermission(PERMISSIONS.STUDENTS_READ);
  } catch {
    redirect("/forbidden");
  }

  const { page, search, status, branchId } = await searchParams;
  const pagination = normalizePaginationParams(page);

  const perms = await getUserPermissions(context.userId, context.organizationId);
  const ability = createAbility(perms);
  const canCreateStudents = ability.can(PERMISSIONS.STUDENTS_CREATE);
  const canCreateEnrollments = ability.can(PERMISSIONS.ENROLLMENTS_CREATE);
  const canViewEnrollments = ability.can(PERMISSIONS.ENROLLMENTS_VIEW);
  const canViewPayments = ability.can(PERMISSIONS.PAYMENTS_VIEW);

  const [
    statusCounts,
    newThisMonth,
    riskStudents,
    topCourses,
    topClassGroups,
    result,
    branches,
    pendingEnrollments,
    withPendingPayments,
    atAcademicRisk,
    withLowAttendance,
  ] = await Promise.all([
    getStudentStats(context.organizationId),
    countNewStudents(context.organizationId),
    getRiskWatchlist(context.organizationId),
    getTopCoursesByStudents(context.organizationId),
    getTopClassGroupsByOccupancy(context.organizationId),
    getStudentsByOrganization(context.organizationId, { ...pagination, search, status, branchId }),
    getActiveBranches(context.organizationId),
    canViewEnrollments ? getPendingEnrollmentsCount(context.organizationId) : Promise.resolve(0),
    canViewPayments ? getStudentsWithPendingPayments(context.organizationId) : Promise.resolve(0),
    getStudentsAtAcademicRisk(context.organizationId),
    getStudentsWithLowAttendance(context.organizationId),
  ]);

  const totalStudents = Object.values(statusCounts).reduce((a, b) => a + b, 0);
  const activeStudents = statusCounts["ACTIVE"] ?? 0;
  const suspendedStudents = statusCounts["SUSPENDED"] ?? 0;
  const activePct = totalStudents > 0 ? Math.round((activeStudents / totalStudents) * 100) : 0;

  // Build insights
  const insights: { id: string; message: string; severity: "info" | "warning" | "critical"; linkHref?: string; linkLabel?: string }[] = [];
  if (withPendingPayments > 0)
    insights.push({ id: "payments", message: `${withPendingPayments} aluno(s) têm pagamentos pendentes ou em atraso`, severity: "warning", linkHref: "/invoices?status=PENDING", linkLabel: "Ver faturas" });
  if (withLowAttendance > 0)
    insights.push({ id: "attendance", message: `${withLowAttendance} aluno(s) estão abaixo da presença mínima`, severity: "critical" });
  if (atAcademicRisk > 0)
    insights.push({ id: "risk", message: `${atAcademicRisk} aluno(s) em risco académico (disciplinas reprovadas)`, severity: "critical" });
  if (statusCounts["PENDING"] > 0)
    insights.push({ id: "pending", message: `${statusCounts["PENDING"]} aluno(s) ainda não têm matrícula ativa`, severity: "warning", linkHref: `/students?status=PENDING`, linkLabel: "Ver pendentes" });
  if (topClassGroups[0]?.occupancyPct >= 90)
    insights.push({ id: "capacity", message: `Turma "${topClassGroups[0].name}" está com ${topClassGroups[0].occupancyPct}% da capacidade`, severity: "info" });

  // Chart DTOs
  const statusEntries = Object.entries(statusCounts).filter(([, v]) => v > 0);
  const statusDonut = {
    labels: statusEntries.map(([k]) => STATUS_LABELS[k] ?? k),
    series: statusEntries.map(([, v]) => v),
    colors: statusEntries.map(([k]) => STATUS_COLORS[k] ?? "#94a3b8"),
  };

  const coursesBar = {
    categories: topCourses.slice(0, 8).map((c) => c.courseName),
    series: [{ name: "Alunos Ativos", data: topCourses.slice(0, 8).map((c) => c.activeCount) }],
    colors: ["#6366f1"],
  };

  return (
    <>
      <PageHeader
        title="Alunos"
        description="Visão geral dos alunos, matrículas, risco académico e situação financeira."
        actions={
          <div className="flex items-center gap-2">
            {canCreateEnrollments && (
              <Button asChild size="sm" variant="outline">
                <Link href="/enrollments/new">
                  <ClipboardList className="size-4 mr-1.5" />
                  Nova Matrícula
                </Link>
              </Button>
            )}
            {canCreateStudents && (
              <Button asChild size="sm">
                <Link href="/students/new">
                  <UserPlus className="size-4 mr-1.5" />
                  Novo Aluno
                </Link>
              </Button>
            )}
          </div>
        }
      />

      <div className="p-4 sm:p-8 space-y-6">

        {/* KPI Cards */}
        <ExecutiveKpiGrid>
          <StatCard title="Total de Alunos" value={totalStudents} icon={<GraduationCap className="size-5" />} description={`${activePct}% estão ativos`} />
          <StatCard title="Alunos Ativos" value={activeStudents} icon={<UserCheck className="size-5" />} description="com acesso ativo" />
          <StatCard title="Novos Este Mês" value={newThisMonth} icon={<UserPlus className="size-5" />} description="registados este mês" />
          <StatCard title="Suspensos" value={suspendedStudents} icon={<UserX className="size-5" />} description="acesso suspenso" />
          {canViewEnrollments && (
            <StatCard title="Matrículas Pendentes" value={pendingEnrollments} icon={<ClipboardList className="size-5" />} description="aguardam confirmação" />
          )}
          {canViewPayments && (
            <StatCard title="Pag. Pendentes" value={withPendingPayments} icon={<AlertCircle className="size-5" />} description="faturas por liquidar" />
          )}
          <StatCard title="Presença Abaixo" value={withLowAttendance} icon={<Clock className="size-5" />} description="abaixo de 75%" />
          <StatCard title="Risco Académico" value={atAcademicRisk} icon={<AlertTriangle className="size-5" />} description="com disciplinas reprovadas" />
        </ExecutiveKpiGrid>

        {/* Two-column main content */}
        <ExecutiveMainGrid>

          {/* LEFT: Watchlist + Table */}
          <ExecutiveLeftColumn>
            {riskStudents.length > 0 && (
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-center gap-2">
                    <ShieldAlert className="size-4 text-muted-foreground" />
                    <CardTitle className="text-sm font-medium">Watchlist de Risco</CardTitle>
                    <span className="ml-auto text-xs text-muted-foreground">{riskStudents.length} aluno(s)</span>
                  </div>
                </CardHeader>
                <CardContent className="p-0 pb-2">
                  <RiskWatchlist students={riskStudents} />
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                  <Users className="size-4 text-muted-foreground" />
                  <CardTitle className="text-sm font-medium">Lista de Alunos</CardTitle>
                  <span className="ml-auto text-xs text-muted-foreground">{result.total} aluno(s)</span>
                </div>
              </CardHeader>
              <CardContent className="p-0 sm:px-4 sm:pb-4">
                <StudentsTable
                  result={result}
                  branches={branches}
                  defaultSearch={search}
                  defaultStatus={status}
                  defaultBranchId={branchId}
                />
              </CardContent>
            </Card>
          </ExecutiveLeftColumn>

          {/* RIGHT: Insights + Quick Actions + Charts */}
          <ExecutiveRightColumn>

            {insights.length > 0 && (
              <DashboardSideCard
                title="Alertas"
                icon={<Lightbulb className="size-4" />}
                badge={<span className="text-xs text-muted-foreground">{insights.length}</span>}
              >
                <div className="space-y-2">
                  {insights.map((i) => <DashboardInsightRow key={i.id} insight={i} />)}
                </div>
              </DashboardSideCard>
            )}

            <DashboardSideCard title="Ações Rápidas" icon={<LayoutGrid className="size-4" />}>
              <div className="space-y-2">
                {canCreateStudents && (
                  <QuickActionTile href="/students/new" icon={<UserPlus className="size-4" />} label="Novo Aluno" variant="success" />
                )}
                {canCreateEnrollments && (
                  <QuickActionTile href="/enrollments/new" icon={<ClipboardList className="size-4" />} label="Nova Matrícula" />
                )}
                {canViewPayments && (
                  <QuickActionTile
                    href="/invoices?status=PENDING"
                    icon={<AlertCircle className="size-4" />}
                    label="Pagamentos Pendentes"
                    description={`${withPendingPayments} alunos`}
                    variant={withPendingPayments > 0 ? "warning" : "default"}
                  />
                )}
                <QuickActionTile
                  href="/students"
                  icon={<Eye className="size-4" />}
                  label="Ver Todos os Alunos"
                  description={`${totalStudents} registados`}
                />
              </div>
            </DashboardSideCard>

            <DashboardSideCard title="Alunos por Estado" icon={<GraduationCap className="size-4" />}>
              <ApexDonutChart data={statusDonut} height={220} />
            </DashboardSideCard>

            {topCourses.length > 0 && (
              <DashboardSideCard title="Alunos por Curso" icon={<Users className="size-4" />}>
                <ApexBarChart data={coursesBar} height={200} horizontal />
              </DashboardSideCard>
            )}

            {topClassGroups.length > 0 && (
              <DashboardSideCard title="Turmas por Ocupação">
                <div className="space-y-3">
                  {topClassGroups.map((cg) => (
                    <div key={cg.id} className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <Link href={`/class-groups/${cg.id}`} className="truncate hover:underline">
                          {cg.name}
                        </Link>
                        <span className="font-medium tabular-nums shrink-0 ml-2">
                          {cg.currentCount}/{cg.capacity}
                        </span>
                      </div>
                      <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                        <div
                          className={cn("h-full rounded-full", cg.occupancyPct >= 90 ? "bg-red-500" : cg.occupancyPct >= 70 ? "bg-amber-500" : "bg-emerald-500")}
                          style={{ width: `${cg.occupancyPct}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </DashboardSideCard>
            )}

          </ExecutiveRightColumn>
        </ExecutiveMainGrid>
      </div>
    </>
  );
}
