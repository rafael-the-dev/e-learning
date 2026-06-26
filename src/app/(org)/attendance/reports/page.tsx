import { PageHeader } from "@/shared/components/layout/page-header";
import { requirePermissionOrRedirect } from "@/server/auth/context";
import { redirectIfTeacherScoped } from "@/server/auth/teacher-scope";
import { PERMISSIONS } from "@/server/auth/permissions";
import { AttendanceReportsView } from "@/modules/attendance/components/attendance-reports-view";
import { getDb } from "@/server/db";

export const metadata = { title: "Relatórios de Presença" };

async function getReportFilterOptions(organizationId: string) {
  const db = await getDb();
  const [classGroups, academicYears] = await Promise.all([
    db.classGroup.findMany({
      where: { organizationId, deletedAt: null },
      select: {
        id: true,
        name: true,
        courseLevelId: true,
        academicYearId: true,
        academicTermId: true,
      },
      orderBy: { name: "asc" },
    }),
    db.academicYear.findMany({
      where: { organizationId, deletedAt: null, status: { not: "ARCHIVED" } },
      select: { id: true, name: true },
      orderBy: { startDate: "desc" },
    }),
  ]);
  return { classGroups, academicYears };
}

export default async function AttendanceReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ classGroupId?: string; academicYearId?: string }>;
}) {
  const context = await requirePermissionOrRedirect(PERMISSIONS.ATTENDANCE_SESSIONS_VIEW);
  // Org-wide attendance rates across all students — never shown to a teacher-scoped
  // user; they're routed to their scoped Portal. See docs/teacher-access-scope.md.
  await redirectIfTeacherScoped(context);

  const { classGroupId, academicYearId } = await searchParams;
  const options = await getReportFilterOptions(context.organizationId);

  return (
    <>
      <PageHeader
        title="Relatórios de Presença"
        description="Taxas de presença por aluno e disciplina."
      />
      <div className="p-8">
        <AttendanceReportsView
          organizationId={context.organizationId}
          classGroups={options.classGroups}
          academicYears={options.academicYears}
          defaultClassGroupId={classGroupId}
          defaultAcademicYearId={academicYearId}
        />
      </div>
    </>
  );
}
