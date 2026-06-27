import Link from "next/link";
import { PageHeader } from "@/shared/components/layout/page-header";
import { Button } from "@/shared/components/ui/button";
import { StatCard } from "@/shared/components/layout/stat-card";
import { requirePermissionOrRedirect } from "@/server/auth/context";
import { redirectIfTeacherScoped } from "@/server/auth/teacher-scope";
import { redirectIfStudentScoped } from "@/server/auth/student-scope";
import { getUserPermissions, createAbility } from "@/server/auth/rbac";
import { PERMISSIONS } from "@/server/auth/permissions";
import { getClassroomBookingsByOrganization } from "@/modules/classrooms/services/classroom.service";
import { ClassroomBookingsTable } from "@/modules/classrooms/components/classroom-bookings-table";
import { normalizePaginationParams } from "@/shared/lib/pagination";
import { getDb } from "@/server/db";
import { Plus } from "lucide-react";

export const metadata = { title: "Reservas de Sala" };

export default async function ClassroomBookingsPage({
  searchParams,
}: {
  searchParams: Promise<{
    page?: string;
    classroomId?: string;
    yearId?: string;
    status?: string;
  }>;
}) {
  const context = await requirePermissionOrRedirect(PERMISSIONS.CLASSROOM_BOOKINGS_VIEW);
  // Teacher-scoped users never see this org-wide page — routed to their scoped Portal. See docs/teacher-access-scope.md.
  await redirectIfTeacherScoped(context);
  // ...and a student-scoped user is routed to their own /student Portal.
  await redirectIfStudentScoped(context);

  const { page, classroomId, yearId, status } = await searchParams;
  const pagination = normalizePaginationParams(page);

  const perms = await getUserPermissions(context.userId, context.organizationId);
  const ability = createAbility(perms);
  const canCreate = ability.can(PERMISSIONS.CLASSROOM_BOOKINGS_CREATE);
  const canCancel = ability.can(PERMISSIONS.CLASSROOM_BOOKINGS_CANCEL);

  const db = await getDb();
  const [result, classrooms, academicYears] = await Promise.all([
    getClassroomBookingsByOrganization(context.organizationId, {
      ...pagination,
      classroomId,
      academicYearId: yearId,
      status,
    }),
    db.classroom.findMany({
      where: { organizationId: context.organizationId, deletedAt: null },
      select: { id: true, name: true, code: true },
      orderBy: [{ code: "asc" }],
    }),
    db.academicYear.findMany({
      where: { organizationId: context.organizationId, deletedAt: null },
      select: { id: true, name: true },
      orderBy: { startDate: "desc" },
    }),
  ]);

  const active = result.data.filter((b) => b.status === "ACTIVE").length;
  const completed = result.data.filter((b) => b.status === "COMPLETED").length;
  const cancelled = result.data.filter((b) => b.status === "CANCELLED").length;

  return (
    <>
      <PageHeader
        title="Reservas de Sala"
        description="Gerir as reservas de salas por turma e período."
        actions={
          canCreate ? (
            <Button asChild size="sm">
              <Link href="/classroom-bookings/new">
                <Plus className="size-4 mr-1.5" />
                Nova Reserva
              </Link>
            </Button>
          ) : undefined
        }
      />
      <div className="p-8 space-y-6">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <StatCard title="Total" value={result.total} />
          <StatCard title="Ativas" value={active} />
          <StatCard title="Concluídas" value={completed} />
          <StatCard title="Canceladas" value={cancelled} />
        </div>

        <ClassroomBookingsTable
          result={result}
          classrooms={classrooms}
          academicYears={academicYears}
          defaultClassroomId={classroomId}
          defaultAcademicYearId={yearId}
          defaultStatus={status}
          canCancel={canCancel}
        />
      </div>
    </>
  );
}
