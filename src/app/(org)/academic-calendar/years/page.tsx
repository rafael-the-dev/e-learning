import { PageHeader } from "@/shared/components/layout/page-header";
import { StatCard } from "@/shared/components/layout/stat-card";
import { requirePermissionOrRedirect } from "@/server/auth/context";
import { getUserPermissions, createAbility } from "@/server/auth/rbac";
import { PERMISSIONS } from "@/server/auth/permissions";
import { getAcademicYearsByOrganization } from "@/modules/academic-calendar/services/academic-calendar.service";
import { AcademicYearsTable } from "@/modules/academic-calendar/components/academic-years-table";
import { normalizePaginationParams } from "@/shared/lib/pagination";

export const metadata = { title: "Anos Letivos" };

export default async function AcademicYearsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; search?: string; status?: string }>;
}) {
  const context = await requirePermissionOrRedirect(PERMISSIONS.ACADEMIC_CALENDAR_VIEW);

  const sp = await searchParams;
  const pagination = normalizePaginationParams(sp.page);

  const perms = await getUserPermissions(context.userId, context.organizationId);
  const ability = createAbility(perms);

  const result = await getAcademicYearsByOrganization(context.organizationId, {
    ...pagination,
    search: sp.search,
    status: sp.status,
  });

  const activeCount = result.data.filter((y) => y.status === "ACTIVE").length;
  const defaultYear = result.data.find((y) => y.isDefault);

  return (
    <>
      <PageHeader
        title="Anos Letivos"
        description="Gerir os anos letivos da organização."
      />

      <div className="p-8 space-y-6">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <StatCard title="Total" value={result.total} />
          <StatCard title="Ativos" value={activeCount} />
          <StatCard title="Predefinido" value={defaultYear?.name ?? "—"} />
          <StatCard title="Períodos" value={result.data.reduce((s, y) => s + (y.termsCount ?? 0), 0)} />
        </div>

        <AcademicYearsTable
          result={result}
          defaultSearch={sp.search}
          defaultStatus={sp.status}
          canCreate={ability.can(PERMISSIONS.ACADEMIC_YEARS_CREATE)}
          canEdit={ability.can(PERMISSIONS.ACADEMIC_YEARS_UPDATE)}
          canSetDefault={ability.can(PERMISSIONS.ACADEMIC_YEARS_SET_DEFAULT)}
          canArchive={ability.can(PERMISSIONS.ACADEMIC_YEARS_ARCHIVE)}
          canDelete={ability.can(PERMISSIONS.ACADEMIC_YEARS_DELETE)}
        />
      </div>
    </>
  );
}
