import { redirect } from "next/navigation";
import Link from "next/link";
import {
  BookOpen,
  CheckCircle2,
  Clock,
  Users,
  AlertTriangle,
  XCircle,
  BadgeCheck,
  Wallet,
  UserX,
  TrendingUp,
  Plus,
  FileText,
  CreditCard,
  LayoutGrid,
  Eye,
  AlertCircle,
} from "lucide-react";
import { PageHeader } from "@/shared/components/layout/page-header";
import { StatCard } from "@/shared/components/layout/stat-card";
import { Button } from "@/shared/components/ui/button";
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
import { cn } from "@/shared/lib/utils";
import { ENROLLMENT_STATUS_LABELS } from "@/modules/enrollments/types";
import type { AuthContext } from "@/server/auth/context";
import type {
  EnrollmentDashboardKPIs,
  EnrollmentCourseDistribution,
  EnrollmentMonthlyTrend,
  EnrollmentBranchDistribution,
  EnrollmentInsight,
} from "@/modules/enrollments/types";

export const metadata = { title: "Matrículas" };

async function getFilterOptions(organizationId: string) {
  const db = await getDb();
  const [courses, branches, classGroups, academicYears] = await Promise.all([
    db.course.findMany({
      where: { organizationId, deletedAt: null, status: "ACTIVE" },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    db.branch.findMany({
      where: { organizationId, deletedAt: null },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    db.classGroup.findMany({
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
  return { courses, branches, classGroups, academicYears };
}

export default async function EnrollmentsPage({
  searchParams,
}: {
  searchParams: Promise<{
    page?: string;
    search?: string;
    status?: string;
    courseId?: string;
    branchId?: string;
    classGroupId?: string;
    yearId?: string;
    financialStatus?: string;
  }>;
}) {
  let context: AuthContext;
  try {
    context = await requirePermission(PERMISSIONS.ENROLLMENTS_VIEW);
  } catch {
    redirect("/forbidden");
  }

  const { page, search, status, courseId, branchId, classGroupId, yearId, financialStatus } =
    await searchParams;
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
      getEnrollmentsByOrganization(org, {
        ...pagination,
        search,
        status,
        courseId,
        branchId,
        classGroupId,
        academicYearId: yearId,
        financialStatus,
      }),
      getFilterOptions(org),
    ]);

  const insights = generateEnrollmentInsights(kpis, courseDistribution);

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

      <div className="p-8 space-y-8">
        {/* ============================================================
            SECTION 1 — EXECUTIVE KPI CARDS
            ============================================================ */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <StatCard
            title="Total de Matrículas"
            value={kpis.total}
            description="Todas as matrículas registadas"
            icon={<BookOpen className="size-4 text-muted-foreground" />}
          />
          <StatCard
            title={ENROLLMENT_STATUS_LABELS["ACTIVE"]!}
            value={kpis.active}
            description="Matrículas activas"
            icon={<CheckCircle2 className="size-4 text-green-500" />}
          />
          <StatCard
            title="Aguarda Pagamento"
            value={kpis.pendingPayment}
            description="Aguardam pagamento obrigatório"
            icon={<Clock className="size-4 text-amber-500" />}
          />
          <StatCard
            title="Sem Turma"
            value={kpis.awaitingClassAssignment}
            description="Activas sem turma atribuída"
            icon={<Users className="size-4 text-blue-500" />}
          />
          {canViewPayments && (
            <StatCard
              title="Contas Vencidas"
              value={kpis.overdueAccounts}
              description="Com faturas vencidas"
              icon={<AlertTriangle className="size-4 text-red-500" />}
            />
          )}
          {canViewPayments && (
            <StatCard
              title="Crédito em Carteira"
              value={kpis.studentsWithWalletCredit}
              description="Alunos com saldo disponível"
              icon={<Wallet className="size-4 text-emerald-500" />}
            />
          )}
          <StatCard
            title={ENROLLMENT_STATUS_LABELS["SUSPENDED"]!}
            value={kpis.suspended}
            description="Matrículas suspensas"
            icon={<XCircle className="size-4 text-orange-500" />}
          />
          <StatCard
            title={ENROLLMENT_STATUS_LABELS["COMPLETED"]!}
            value={kpis.completed}
            description="Matrículas concluídas"
            icon={<BadgeCheck className="size-4 text-teal-500" />}
          />
        </div>

        {/* ============================================================
            SECTION 2 — OPERATIONAL INSIGHTS
            ============================================================ */}
        {insights.length > 0 && (
          <div className="rounded-lg border bg-card">
            <div className="flex items-center gap-2 px-5 py-4 border-b">
              <AlertCircle className="size-4 text-muted-foreground" />
              <h2 className="font-semibold text-sm">Insights Operacionais</h2>
              <span className="ml-auto text-xs text-muted-foreground">
                {insights.length} {insights.length === 1 ? "alerta" : "alertas"}
              </span>
            </div>
            <div className="divide-y">
              {insights.map((insight) => (
                <InsightRow key={insight.id} insight={insight} />
              ))}
            </div>
          </div>
        )}

        {/* ============================================================
            SECTION 3 — RISK & ATTENTION WATCHLIST
            ============================================================ */}
        {watchlist.length > 0 && (
          <div className="rounded-lg border bg-card">
            <div className="flex items-center gap-2 px-5 py-4 border-b">
              <UserX className="size-4 text-muted-foreground" />
              <h2 className="font-semibold text-sm">Lista de Atenção</h2>
              <span className="ml-auto text-xs text-muted-foreground">
                {watchlist.length} {watchlist.length === 1 ? "matrícula" : "matrículas"}
              </span>
            </div>
            <EnrollmentWatchlist items={watchlist} />
          </div>
        )}

        {/* ============================================================
            SECTION 4 — DISTRIBUTION
            ============================================================ */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <StatusDistributionCard kpis={kpis} />
          <TopCoursesCard courses={courseDistribution} total={kpis.active} />
          {monthlyTrend.length > 0 ? (
            <MonthlyTrendCard trend={monthlyTrend} />
          ) : (
            <BranchDistributionCard branches={branchDistribution} />
          )}
        </div>

        {/* ============================================================
            SECTION 5 — QUICK ACTIONS
            ============================================================ */}
        <div className="rounded-lg border bg-card p-5">
          <div className="flex items-center gap-2 mb-4">
            <LayoutGrid className="size-4 text-muted-foreground" />
            <h2 className="font-semibold text-sm">Ações Rápidas</h2>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2">
            {canCreate && (
              <QuickAction href="/enrollments/new" icon={<Plus className="size-4" />} label="Nova Matrícula" />
            )}
            <QuickAction
              href="/enrollments?status=PENDING_PAYMENT"
              icon={<Clock className="size-4" />}
              label="Aguardam Pagamento"
              count={kpis.pendingPayment}
            />
            {canViewPayments && (
              <QuickAction
                href="/enrollments?financialStatus=OVERDUE"
                icon={<AlertTriangle className="size-4" />}
                label="Contas Vencidas"
                count={kpis.overdueAccounts}
                variant="destructive"
              />
            )}
            {canViewPayments && (
              <QuickAction
                href="/enrollments?financialStatus=NO_INVOICE"
                icon={<FileText className="size-4" />}
                label="Sem Fatura"
                count={kpis.activeWithoutInvoice}
                variant="warning"
              />
            )}
            <QuickAction
              href="/enrollments?status=SUSPENDED"
              icon={<XCircle className="size-4" />}
              label="Suspensas"
              count={kpis.suspended}
            />
            <QuickAction
              href="/enrollments"
              icon={<Eye className="size-4" />}
              label="Ver Todas"
              count={kpis.total}
            />
          </div>
        </div>

        {/* ============================================================
            SECTION 6 — ENROLLMENTS TABLE
            ============================================================ */}
        <div className="rounded-lg border bg-card">
          <div className="flex items-center gap-2 px-5 py-4 border-b">
            <BookOpen className="size-4 text-muted-foreground" />
            <h2 className="font-semibold text-sm">Todas as Matrículas</h2>
            <span className="ml-auto text-xs text-muted-foreground">
              {result.total} {result.total === 1 ? "registo" : "registos"}
            </span>
          </div>
          <div className="p-4">
            <EnrollmentsTable
              result={result}
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
              canEdit={canEdit}
              canActivate={canActivate}
              canSuspend={canSuspend}
              canCancel={canCancel}
              canComplete={canComplete}
              canDelete={canDelete}
            />
          </div>
        </div>
      </div>
    </>
  );
}

// =============================================================================
// LOCAL HELPER COMPONENTS
// =============================================================================

function InsightRow({ insight }: { insight: EnrollmentInsight }) {
  const colorClass =
    insight.severity === "critical"
      ? "border-red-400 bg-red-50"
      : insight.severity === "warning"
        ? "border-amber-400 bg-amber-50"
        : "border-blue-400 bg-blue-50";

  const dotClass =
    insight.severity === "critical"
      ? "bg-red-500"
      : insight.severity === "warning"
        ? "bg-amber-500"
        : "bg-blue-500";

  const textClass =
    insight.severity === "critical"
      ? "text-red-800"
      : insight.severity === "warning"
        ? "text-amber-800"
        : "text-blue-800";

  const row = (
    <div className={cn("flex items-center gap-3 px-5 py-3 border-l-4", colorClass)}>
      <span className={cn("size-2 rounded-full shrink-0", dotClass)} />
      <p className={cn("text-sm flex-1", textClass)}>{insight.message}</p>
      {insight.linkLabel && (
        <span className={cn("text-xs font-medium underline shrink-0", textClass)}>
          {insight.linkLabel} →
        </span>
      )}
    </div>
  );

  if (insight.linkHref) {
    return <Link href={insight.linkHref}>{row}</Link>;
  }
  return row;
}

function StatusDistributionCard({ kpis }: { kpis: EnrollmentDashboardKPIs }) {
  const total = kpis.total;
  const items = [
    { label: "Ativo", count: kpis.active, color: "bg-green-500" },
    { label: "Aguarda Pagamento", count: kpis.pendingPayment, color: "bg-amber-500" },
    { label: "Suspenso", count: kpis.suspended, color: "bg-orange-500" },
    { label: "Rascunho", count: kpis.draft, color: "bg-slate-400" },
    { label: "Concluído", count: kpis.completed, color: "bg-teal-500" },
    { label: "Cancelado", count: kpis.cancelled, color: "bg-red-400" },
  ].filter((i) => i.count > 0);

  return (
    <div className="rounded-lg border bg-card p-5">
      <div className="flex items-center gap-2 mb-4">
        <TrendingUp className="size-4 text-muted-foreground" />
        <h3 className="font-semibold text-sm">Distribuição por Estado</h3>
      </div>
      {total === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-6">Sem matrículas registadas.</p>
      ) : (
        <div className="space-y-3">
          {items.map((item) => {
            const pct = Math.round((item.count / total) * 100);
            return (
              <div key={item.label}>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-muted-foreground">{item.label}</span>
                  <span className="font-medium tabular-nums">
                    {item.count} <span className="text-muted-foreground">({pct}%)</span>
                  </span>
                </div>
                <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                  <div
                    className={cn("h-full rounded-full transition-all", item.color)}
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

function TopCoursesCard({
  courses,
  total,
}: {
  courses: EnrollmentCourseDistribution[];
  total: number;
}) {
  return (
    <div className="rounded-lg border bg-card p-5">
      <div className="flex items-center gap-2 mb-4">
        <BookOpen className="size-4 text-muted-foreground" />
        <h3 className="font-semibold text-sm">Top Cursos (Activos)</h3>
      </div>
      {courses.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-6">Sem matrículas activas.</p>
      ) : (
        <div className="space-y-3">
          {courses.map((course, i) => {
            const pct = total > 0 ? Math.round((course.activeCount / total) * 100) : 0;
            return (
              <div key={course.courseId}>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-mono text-muted-foreground w-4 shrink-0">
                    {i + 1}.
                  </span>
                  <span className="text-xs flex-1 truncate">{course.courseName}</span>
                  <span className="text-xs font-medium tabular-nums shrink-0">
                    {course.activeCount}
                    <span className="text-muted-foreground ml-1">({pct}%)</span>
                  </span>
                </div>
                <div className="h-1.5 bg-muted rounded-full overflow-hidden ml-6">
                  <div className="h-full bg-primary/60 rounded-full" style={{ width: `${pct}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function MonthlyTrendCard({ trend }: { trend: EnrollmentMonthlyTrend[] }) {
  const max = Math.max(...trend.map((t) => t.total), 1);

  const formatMonth = (key: string) => {
    const [year, month] = key.split("-");
    const date = new Date(Number(year), Number(month) - 1, 1);
    return date.toLocaleDateString("pt-PT", { month: "short", year: "2-digit" });
  };

  return (
    <div className="rounded-lg border bg-card p-5">
      <div className="flex items-center gap-2 mb-4">
        <TrendingUp className="size-4 text-muted-foreground" />
        <h3 className="font-semibold text-sm">Tendência Mensal</h3>
        <span className="ml-auto text-xs text-muted-foreground">últimos 6 meses</span>
      </div>
      {trend.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-6">Sem dados no período.</p>
      ) : (
        <div className="space-y-2">
          {trend.map((item) => {
            const pct = Math.round((item.total / max) * 100);
            return (
              <div key={item.month}>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-muted-foreground font-mono">{formatMonth(item.month)}</span>
                  <span className="font-medium tabular-nums">{item.total}</span>
                </div>
                <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary/60 rounded-full transition-all"
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

function BranchDistributionCard({ branches }: { branches: EnrollmentBranchDistribution[] }) {
  const total = branches.reduce((s, b) => s + b.count, 0);

  return (
    <div className="rounded-lg border bg-card p-5">
      <div className="flex items-center gap-2 mb-4">
        <Users className="size-4 text-muted-foreground" />
        <h3 className="font-semibold text-sm">Distribuição por Filial</h3>
      </div>
      {branches.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-6">Sem dados.</p>
      ) : (
        <div className="space-y-3">
          {branches.map((branch) => {
            const pct = total > 0 ? Math.round((branch.count / total) * 100) : 0;
            return (
              <div key={branch.branchId ?? "none"}>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-muted-foreground truncate">{branch.branchName}</span>
                  <span className="font-medium tabular-nums shrink-0">
                    {branch.count} <span className="text-muted-foreground">({pct}%)</span>
                  </span>
                </div>
                <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary/60 rounded-full"
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

function QuickAction({
  href,
  icon,
  label,
  count,
  variant,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
  count?: number;
  variant?: "default" | "destructive" | "warning";
}) {
  const colorClass =
    variant === "destructive"
      ? "text-red-600 hover:bg-red-50 border-red-200"
      : variant === "warning"
        ? "text-amber-600 hover:bg-amber-50 border-amber-200"
        : "text-foreground hover:bg-muted/50";

  return (
    <Link
      href={href}
      className={cn(
        "flex flex-col items-center gap-1.5 rounded-lg border p-3 text-center transition-colors",
        colorClass
      )}
    >
      <span className="text-muted-foreground">{icon}</span>
      <span className="text-xs font-medium leading-tight">{label}</span>
      {count !== undefined && count > 0 && (
        <span
          className={cn(
            "text-xs font-bold tabular-nums",
            variant === "destructive" ? "text-red-600" : variant === "warning" ? "text-amber-600" : "text-primary"
          )}
        >
          {count}
        </span>
      )}
    </Link>
  );
}
