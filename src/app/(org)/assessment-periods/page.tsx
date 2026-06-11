import { redirect } from "next/navigation";
import { PageHeader } from "@/shared/components/layout/page-header";
import { StatCard } from "@/shared/components/layout/stat-card";
import { requirePermission } from "@/server/auth/context";
import { getUserPermissions, createAbility } from "@/server/auth/rbac";
import { PERMISSIONS } from "@/server/auth/permissions";
import { normalizePaginationParams } from "@/shared/lib/pagination";
import { findAssessmentPeriodsByOrganization } from "@/modules/assessments/repositories/assessment-period.repository";
import { AssessmentPeriodsTable } from "@/modules/assessments/components/assessment-periods-table";
import { NewAssessmentPeriodButton } from "@/modules/assessments/components/new-assessment-period-button";
import { getDb } from "@/server/db";
import type { AuthContext } from "@/server/auth/context";

export const metadata = { title: "Períodos de Avaliação" };

export default async function AssessmentPeriodsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; search?: string; status?: string }>;
}) {
  let context: AuthContext;
  try {
    context = await requirePermission(PERMISSIONS.ASSESSMENT_PERIODS_VIEW);
  } catch {
    redirect("/forbidden");
  }

  const { page, search, status } = await searchParams;
  const pagination = normalizePaginationParams(page);

  const perms = await getUserPermissions(context.userId, context.organizationId);
  const ability = createAbility(perms);
  const canCreate = ability.can(PERMISSIONS.ASSESSMENT_PERIODS_CREATE);
  const canEdit = ability.can(PERMISSIONS.ASSESSMENT_PERIODS_UPDATE);
  const canArchive = ability.can(PERMISSIONS.ASSESSMENT_PERIODS_ARCHIVE);

  const db = await getDb();
  const [result, academicYears] = await Promise.all([
    findAssessmentPeriodsByOrganization(context.organizationId, {
      ...pagination,
      search,
      status,
    }),
    db.academicYear.findMany({
      where: { organizationId: context.organizationId, deletedAt: null },
      select: { id: true, name: true },
      orderBy: { name: "desc" },
    }),
  ]);

  const active = result.data.filter((p) => p.status === "ACTIVE").length;
  const upcoming = result.data.filter((p) => p.status === "UPCOMING").length;

  return (
    <>
      <PageHeader
        title="Períodos de Avaliação"
        description="Gerir os períodos letivos de avaliação."
        actions={
          canCreate ? (
            <NewAssessmentPeriodButton academicYears={academicYears} />
          ) : undefined
        }
      />
      <div className="p-8 space-y-6">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <StatCard title="Total" value={result.total} />
          <StatCard title="Ativos" value={active} />
          <StatCard title="Futuros" value={upcoming} />
        </div>

        <AssessmentPeriodsTable
          result={result}
          defaultSearch={search}
          canEdit={canEdit}
          canArchive={canArchive}
          academicYears={academicYears}
        />
      </div>
    </>
  );
}
