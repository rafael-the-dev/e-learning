import { PageHeader } from "@/shared/components/layout/page-header";
import { StatCard } from "@/shared/components/layout/stat-card";
import { requirePermissionOrRedirect } from "@/server/auth/context";
import { redirectIfStudentScoped } from "@/server/auth/student-scope";
import { getUserPermissions, createAbility } from "@/server/auth/rbac";
import { PERMISSIONS } from "@/server/auth/permissions";
import {
  getAcademicEventsByOrganization,
  getAllAcademicYears,
  getAcademicTermsByOrganization,
} from "@/modules/academic-calendar/services/academic-calendar.service";
import { AcademicEventsTable } from "@/modules/academic-calendar/components/academic-events-table";
import { normalizePaginationParams } from "@/shared/lib/pagination";

export const metadata = { title: "Eventos Académicos" };

export default async function AcademicEventsPage({
  searchParams,
}: {
  searchParams: Promise<{
    page?: string;
    search?: string;
    status?: string;
    yearId?: string;
    eventType?: string;
  }>;
}) {
  const context = await requirePermissionOrRedirect(PERMISSIONS.ACADEMIC_CALENDAR_VIEW);
  // A student-scoped user is routed to their own /student Portal — never org-wide/other-student data. See student-scope.ts.
  await redirectIfStudentScoped(context);

  const sp = await searchParams;
  const pagination = normalizePaginationParams(sp.page);

  const perms = await getUserPermissions(context.userId, context.organizationId);
  const ability = createAbility(perms);

  const [result, allYears, allTermsResult] = await Promise.all([
    getAcademicEventsByOrganization(context.organizationId, {
      ...pagination,
      academicYearId: sp.yearId,
      eventType: sp.eventType,
      search: sp.search,
      status: sp.status,
    }),
    getAllAcademicYears(context.organizationId),
    getAcademicTermsByOrganization(context.organizationId, { page: 1, pageSize: 200 }),
  ]);

  const activeCount = result.data.filter((e) => e.status === "ACTIVE").length;

  return (
    <>
      <PageHeader
        title="Eventos Académicos"
        description="Gerir eventos, períodos de exames e datas importantes."
      />

      <div className="p-8 space-y-6">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <StatCard title="Total" value={result.total} />
          <StatCard title="Ativos" value={activeCount} />
          <StatCard title="Anos Letivos" value={allYears.length} />
        </div>

        <AcademicEventsTable
          result={result}
          years={allYears}
          terms={allTermsResult.data}
          defaultSearch={sp.search}
          defaultStatus={sp.status}
          defaultYearId={sp.yearId}
          defaultEventType={sp.eventType}
          canCreate={ability.can(PERMISSIONS.ACADEMIC_EVENTS_CREATE)}
          canEdit={ability.can(PERMISSIONS.ACADEMIC_EVENTS_UPDATE)}
          canArchive={ability.can(PERMISSIONS.ACADEMIC_EVENTS_ARCHIVE)}
          canDelete={ability.can(PERMISSIONS.ACADEMIC_EVENTS_DELETE)}
        />
      </div>
    </>
  );
}
