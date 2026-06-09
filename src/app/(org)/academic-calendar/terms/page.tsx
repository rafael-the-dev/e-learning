import { redirect } from "next/navigation";
import { PageHeader } from "@/shared/components/layout/page-header";
import { StatCard } from "@/shared/components/layout/stat-card";
import { requirePermission } from "@/server/auth/context";
import { getUserPermissions, createAbility } from "@/server/auth/rbac";
import { PERMISSIONS } from "@/server/auth/permissions";
import {
  getAcademicTermsByOrganization,
  getAllAcademicYears,
} from "@/modules/academic-calendar/services/academic-calendar.service";
import { AcademicTermsTable } from "@/modules/academic-calendar/components/academic-terms-table";
import { normalizePaginationParams } from "@/shared/lib/pagination";
import type { AuthContext } from "@/server/auth/context";

export const metadata = { title: "Períodos Letivos" };

export default async function AcademicTermsPage({
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
    getAcademicTermsByOrganization(context.organizationId, {
      ...pagination,
      academicYearId: sp.yearId,
      search: sp.search,
      status: sp.status,
    }),
    getAllAcademicYears(context.organizationId),
  ]);

  const activeCount = result.data.filter((t) => t.status === "ACTIVE").length;

  return (
    <>
      <PageHeader
        title="Períodos Letivos"
        description="Gerir os períodos associados a cada ano letivo."
      />

      <div className="p-8 space-y-6">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <StatCard title="Total" value={result.total} />
          <StatCard title="Ativos" value={activeCount} />
          <StatCard title="Anos Letivos" value={allYears.length} />
        </div>

        <AcademicTermsTable
          result={result}
          years={allYears}
          defaultSearch={sp.search}
          defaultStatus={sp.status}
          defaultYearId={sp.yearId}
          canCreate={ability.can(PERMISSIONS.ACADEMIC_TERMS_CREATE)}
          canEdit={ability.can(PERMISSIONS.ACADEMIC_TERMS_UPDATE)}
          canArchive={ability.can(PERMISSIONS.ACADEMIC_TERMS_ARCHIVE)}
          canDelete={ability.can(PERMISSIONS.ACADEMIC_TERMS_DELETE)}
          showYear
        />
      </div>
    </>
  );
}
