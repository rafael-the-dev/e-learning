import { redirect } from "next/navigation";
import { PageHeader } from "@/shared/components/layout/page-header";
import { StatCard } from "@/shared/components/layout/stat-card";
import { requirePermission } from "@/server/auth/context";
import { getUserPermissions, createAbility } from "@/server/auth/rbac";
import { PERMISSIONS } from "@/server/auth/permissions";
import {
  getAcademicHolidaysByOrganization,
  getAllAcademicYears,
} from "@/modules/academic-calendar/services/academic-calendar.service";
import { AcademicHolidaysTable } from "@/modules/academic-calendar/components/academic-holidays-table";
import { normalizePaginationParams } from "@/shared/lib/pagination";
import type { AuthContext } from "@/server/auth/context";

export const metadata = { title: "Feriados Académicos" };

export default async function AcademicHolidaysPage({
  searchParams,
}: {
  searchParams: Promise<{
    page?: string;
    search?: string;
    status?: string;
    yearId?: string;
  }>;
}) {
  let context: AuthContext;
  try {
    context = await requirePermission(PERMISSIONS.ACADEMIC_CALENDAR_VIEW);
  } catch {
    redirect("/forbidden");
  }

  const sp = await searchParams;
  const pagination = normalizePaginationParams(sp.page);

  const perms = await getUserPermissions(context.userId, context.organizationId);
  const ability = createAbility(perms);

  const [result, allYears] = await Promise.all([
    getAcademicHolidaysByOrganization(context.organizationId, {
      ...pagination,
      academicYearId: sp.yearId,
      search: sp.search,
      status: sp.status,
    }),
    getAllAcademicYears(context.organizationId),
  ]);

  const recurringCount = result.data.filter((h) => h.isRecurring).length;

  return (
    <>
      <PageHeader
        title="Feriados Académicos"
        description="Gerir feriados e ausências no calendário da organização."
      />

      <div className="p-8 space-y-6">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <StatCard title="Total" value={result.total} />
          <StatCard title="Recorrentes" value={recurringCount} />
          <StatCard title="Anos Letivos" value={allYears.length} />
        </div>

        <AcademicHolidaysTable
          result={result}
          years={allYears}
          defaultSearch={sp.search}
          defaultStatus={sp.status}
          defaultYearId={sp.yearId}
          canCreate={ability.can(PERMISSIONS.ACADEMIC_HOLIDAYS_CREATE)}
          canEdit={ability.can(PERMISSIONS.ACADEMIC_HOLIDAYS_UPDATE)}
          canArchive={ability.can(PERMISSIONS.ACADEMIC_HOLIDAYS_ARCHIVE)}
          canDelete={ability.can(PERMISSIONS.ACADEMIC_HOLIDAYS_DELETE)}
        />
      </div>
    </>
  );
}
