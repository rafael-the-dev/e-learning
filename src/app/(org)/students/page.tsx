import { redirect } from "next/navigation";
import Link from "next/link";
import { PageHeader } from "@/shared/components/layout/page-header";
import { StatCard } from "@/shared/components/layout/stat-card";
import { Button } from "@/shared/components/ui/button";
import { StatusBadge } from "@/shared/components/data/status-badge";
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
  AlertTriangle,
  Clock,
  Lightbulb,
  ShieldAlert,
  Users,
  BookOpen,
  BarChart2,
} from "lucide-react";
import type { AuthContext } from "@/server/auth/context";
import type { TopCourseEnrollment, TopClassGroup } from "@/modules/students/types";

export const metadata = { title: "Alunos" };

export default async function StudentsPage({
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
    getStudentsByOrganization(context.organizationId, {
      ...pagination,
      search,
      status,
      branchId,
    }),
    getActiveBranches(context.organizationId),
    canViewEnrollments
      ? getPendingEnrollmentsCount(context.organizationId)
      : Promise.resolve(0),
    canViewPayments
      ? getStudentsWithPendingPayments(context.organizationId)
      : Promise.resolve(0),
    getStudentsAtAcademicRisk(context.organizationId),
    getStudentsWithLowAttendance(context.organizationId),
  ]);

  const totalStudents = Object.values(statusCounts).reduce((a, b) => a + b, 0);
  const activeStudents = statusCounts["ACTIVE"] ?? 0;
  const pendingStudents = statusCounts["PENDING"] ?? 0;
  const suspendedStudents = statusCounts["SUSPENDED"] ?? 0;
  const activePct = totalStudents > 0 ? Math.round((activeStudents / totalStudents) * 100) : 0;

  // Build insights list
  const insights: { id: string; message: string; severity: "info" | "warning" | "critical"; href?: string }[] = [];
  if (withPendingPayments > 0)
    insights.push({
      id: "payments",
      message: `${withPendingPayments} aluno(s) têm pagamentos pendentes ou em atraso`,
      severity: "warning",
      href: "/finance/invoices?status=PENDING",
    });
  if (withLowAttendance > 0)
    insights.push({
      id: "attendance",
      message: `${withLowAttendance} aluno(s) estão abaixo da presença mínima`,
      severity: "critical",
    });
  if (pendingStudents > 0)
    insights.push({
      id: "pending",
      message: `${pendingStudents} aluno(s) ainda não têm matrícula ativa`,
      severity: "warning",
      href: `/students?status=PENDING`,
    });
  if (atAcademicRisk > 0)
    insights.push({
      id: "risk",
      message: `${atAcademicRisk} aluno(s) em risco académico (disciplinas reprovadas)`,
      severity: "critical",
    });
  if (topClassGroups[0]?.occupancyPct >= 90)
    insights.push({
      id: "capacity",
      message: `Turma "${topClassGroups[0].name}" está com ${topClassGroups[0].occupancyPct}% da capacidade`,
      severity: "info",
    });
  if (topCourses[0])
    insights.push({
      id: "top-course",
      message: `"${topCourses[0].courseName}" é o curso com mais alunos ativos (${topCourses[0].activeCount})`,
      severity: "info",
    });

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

      <div className="p-8 space-y-8">
        {/* ── KPI Cards ─────────────────────────────────────────── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <StatCard
            title="Total de Alunos"
            value={totalStudents}
            icon={<GraduationCap className="size-5" />}
            description={`${activePct}% estão ativos`}
          />
          <StatCard
            title="Alunos Ativos"
            value={activeStudents}
            icon={<UserCheck className="size-5" />}
            description="com acesso ativo"
          />
          <StatCard
            title="Novos Este Mês"
            value={newThisMonth}
            icon={<UserPlus className="size-5" />}
            description="registados este mês"
          />
          <StatCard
            title="Suspensos"
            value={suspendedStudents}
            icon={<UserX className="size-5" />}
            description="acesso suspenso"
          />
          {canViewEnrollments && (
            <StatCard
              title="Matrículas Pendentes"
              value={pendingEnrollments}
              icon={<ClipboardList className="size-5" />}
              description="aguardam confirmação"
            />
          )}
          {canViewPayments && (
            <StatCard
              title="Pag. Pendentes"
              value={withPendingPayments}
              icon={<AlertCircle className="size-5" />}
              description="faturas por liquidar"
            />
          )}
          <StatCard
            title="Presença Abaixo"
            value={withLowAttendance}
            icon={<Clock className="size-5" />}
            description="abaixo de 75%"
          />
          <StatCard
            title="Risco Académico"
            value={atAcademicRisk}
            icon={<AlertTriangle className="size-5" />}
            description="com disciplinas reprovadas"
          />
        </div>

        {/* ── Insights ──────────────────────────────────────────── */}
        {insights.length > 0 && (
          <div className="rounded-xl border p-5 space-y-3">
            <div className="flex items-center gap-2">
              <Lightbulb className="size-4 text-muted-foreground" />
              <h3 className="text-sm font-semibold">Atenção Necessária</h3>
              <span className="ml-auto text-xs text-muted-foreground">
                {insights.length} alerta(s)
              </span>
            </div>
            <div className="space-y-2">
              {insights.map((insight) => (
                <InsightRow key={insight.id} insight={insight} />
              ))}
            </div>
          </div>
        )}

        {/* ── Breakdown + Top Courses + Top Classes ─────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <StatusBreakdownCard statusCounts={statusCounts} total={totalStudents} />
          <TopCoursesCard courses={topCourses} />
          <TopClassGroupsCard classGroups={topClassGroups} />
        </div>

        {/* ── Risk Watchlist ────────────────────────────────────── */}
        {riskStudents.length > 0 && (
          <div className="rounded-xl border">
            <div className="flex items-center gap-2 px-5 py-4 border-b">
              <ShieldAlert className="size-4 text-muted-foreground" />
              <h3 className="text-sm font-semibold">Watchlist de Risco</h3>
              <span className="ml-auto text-xs text-muted-foreground">
                {riskStudents.length} aluno(s)
              </span>
            </div>
            <RiskWatchlist students={riskStudents} />
          </div>
        )}

        {/* ── Students Table ────────────────────────────────────── */}
        <div className="rounded-xl border p-5 space-y-4">
          <div className="flex items-center gap-2">
            <Users className="size-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold">Lista de Alunos</h3>
            <span className="ml-auto text-xs text-muted-foreground">
              {result.total} aluno(s)
            </span>
          </div>
          <StudentsTable
            result={result}
            branches={branches}
            defaultSearch={search}
            defaultStatus={status}
            defaultBranchId={branchId}
          />
        </div>
      </div>
    </>
  );
}

// =============================================================================
// LOCAL HELPER COMPONENTS
// =============================================================================

const INSIGHT_STYLES = {
  info: "bg-blue-50 border-blue-200 text-blue-800",
  warning: "bg-amber-50 border-amber-200 text-amber-800",
  critical: "bg-red-50 border-red-200 text-red-800",
} as const;

const INSIGHT_DOT = {
  info: "bg-blue-500",
  warning: "bg-amber-500",
  critical: "bg-red-500",
} as const;

function InsightRow({
  insight,
}: {
  insight: { id: string; message: string; severity: "info" | "warning" | "critical"; href?: string };
}) {
  const content = (
    <div
      className={cn(
        "flex items-center gap-2.5 rounded-lg border px-4 py-2.5 text-sm font-medium transition-colors",
        INSIGHT_STYLES[insight.severity],
        insight.href && "hover:opacity-80 cursor-pointer"
      )}
    >
      <span className={cn("size-2 rounded-full shrink-0", INSIGHT_DOT[insight.severity])} />
      {insight.message}
    </div>
  );

  if (insight.href) {
    return <Link href={insight.href}>{content}</Link>;
  }
  return content;
}

function StatusBreakdownCard({
  statusCounts,
  total,
}: {
  statusCounts: Record<string, number>;
  total: number;
}) {
  const LABELS: Record<string, string> = {
    ACTIVE: "Ativo",
    PENDING: "Pendente",
    SUSPENDED: "Suspenso",
    COMPLETED: "Concluído",
    DROPPED: "Abandonado",
  };
  const BAR_COLORS: Record<string, string> = {
    ACTIVE: "bg-emerald-500",
    PENDING: "bg-amber-500",
    SUSPENDED: "bg-red-500",
    COMPLETED: "bg-blue-500",
    DROPPED: "bg-slate-400",
  };

  const entries = Object.entries(statusCounts).sort((a, b) => b[1] - a[1]);

  return (
    <div className="rounded-xl border p-5 space-y-4">
      <div className="flex items-center gap-2">
        <BarChart2 className="size-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold">Alunos por Estado</h3>
      </div>
      {entries.length === 0 ? (
        <p className="text-xs text-muted-foreground italic">Sem dados</p>
      ) : (
        <div className="space-y-3">
          {entries.map(([status, count]) => {
            const pct = total > 0 ? Math.round((count / total) * 100) : 0;
            return (
              <div key={status} className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">
                    {LABELS[status] ?? status}
                  </span>
                  <span className="font-medium tabular-nums">
                    {count}{" "}
                    <span className="text-muted-foreground font-normal">({pct}%)</span>
                  </span>
                </div>
                <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                  <div
                    className={cn("h-full rounded-full", BAR_COLORS[status] ?? "bg-primary")}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function TopCoursesCard({ courses }: { courses: TopCourseEnrollment[] }) {
  return (
    <div className="rounded-xl border p-5 space-y-4">
      <div className="flex items-center gap-2">
        <BookOpen className="size-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold">Cursos com Mais Alunos</h3>
      </div>
      {courses.length === 0 ? (
        <p className="text-xs text-muted-foreground italic">
          Nenhuma matrícula ativa registada.
        </p>
      ) : (
        <div className="space-y-2">
          {courses.map((c, i) => (
            <div key={c.courseId} className="flex items-center gap-3">
              <span className="text-xs text-muted-foreground w-4 tabular-nums shrink-0">
                {i + 1}.
              </span>
              <Link
                href={`/courses/${c.courseId}`}
                className="text-sm truncate flex-1 hover:underline"
              >
                {c.courseName}
              </Link>
              <span className="text-xs font-semibold tabular-nums shrink-0">
                {c.activeCount}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function TopClassGroupsCard({ classGroups }: { classGroups: TopClassGroup[] }) {
  return (
    <div className="rounded-xl border p-5 space-y-4">
      <div className="flex items-center gap-2">
        <Users className="size-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold">Turmas Mais Cheias</h3>
      </div>
      {classGroups.length === 0 ? (
        <p className="text-xs text-muted-foreground italic">
          Nenhuma turma ativa registada.
        </p>
      ) : (
        <div className="space-y-3">
          {classGroups.map((cg) => (
            <div key={cg.id} className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <Link
                  href={`/class-groups/${cg.id}`}
                  className="text-sm truncate hover:underline"
                >
                  {cg.name}
                </Link>
                <span className="font-medium tabular-nums shrink-0 ml-2">
                  {cg.currentCount}/{cg.capacity}
                </span>
              </div>
              <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                <div
                  className={cn(
                    "h-full rounded-full",
                    cg.occupancyPct >= 90
                      ? "bg-red-500"
                      : cg.occupancyPct >= 70
                        ? "bg-amber-500"
                        : "bg-emerald-500"
                  )}
                  style={{ width: `${cg.occupancyPct}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
