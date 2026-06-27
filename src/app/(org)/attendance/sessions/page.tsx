import Link from "next/link";
import { PageHeader } from "@/shared/components/layout/page-header";
import { StatCard } from "@/shared/components/layout/stat-card";
import { Button } from "@/shared/components/ui/button";
import { requirePermissionOrRedirect } from "@/server/auth/context";
import { redirectIfStudentScoped } from "@/server/auth/student-scope";
import { resolveDataAccessScope } from "@/server/auth/teacher-scope";
import { PERMISSIONS } from "@/server/auth/permissions";
import { getUserPermissions, createAbility } from "@/server/auth/rbac";
import {
  getAttendanceSessionsByOrganization,
  getAttendanceSessionStats,
} from "@/modules/attendance/services/attendance.service";
import { SessionsTable } from "@/modules/attendance/components/sessions-table";
import { normalizePaginationParams } from "@/shared/lib/pagination";
import { getDb } from "@/server/db";
import { Plus } from "lucide-react";

export const metadata = { title: "Sessões de Presença" };

async function getFilterOptions(organizationId: string) {
  const db = await getDb();
  const [classGroups, subjects] = await Promise.all([
    db.classGroup.findMany({
      where: { organizationId, deletedAt: null },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    db.subject.findMany({
      where: { organizationId, deletedAt: null },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);
  return { classGroups, subjects };
}

export default async function AttendanceSessionsPage({
  searchParams,
}: {
  searchParams: Promise<{
    page?: string;
    search?: string;
    status?: string;
    classGroupId?: string;
    subjectId?: string;
  }>;
}) {
  const context = await requirePermissionOrRedirect(PERMISSIONS.ATTENDANCE_SESSIONS_VIEW);
  // A student-scoped user is routed to their own /student Portal — never org-wide/other-student data. See student-scope.ts.
  await redirectIfStudentScoped(context);

  const { page, search, status, classGroupId, subjectId } = await searchParams;
  const pagination = normalizePaginationParams(page);

  const perms = await getUserPermissions(context.userId, context.organizationId);
  const ability = createAbility(perms);
  const canCreate = ability.can(PERMISSIONS.ATTENDANCE_SESSIONS_CREATE);
  const canComplete = ability.can(PERMISSIONS.ATTENDANCE_SESSIONS_COMPLETE);
  const canCancel = ability.can(PERMISSIONS.ATTENDANCE_SESSIONS_CANCEL);

  // Teacher scope: a teacher sees only sessions assigned to them, with a
  // class-group filter limited to their own groups — never org-wide session
  // stats. See docs/teacher-access-scope.md.
  const scope = await resolveDataAccessScope(context);
  if (scope.type === "teacher") {
    const scopedDb = await getDb();
    const [result, classGroups, subjects] = await Promise.all([
      getAttendanceSessionsByOrganization(context.organizationId, {
        ...pagination,
        search,
        status,
        classGroupId,
        subjectId,
        teacherId: scope.teacherId,
      }),
      scopedDb.classGroup.findMany({
        where: { organizationId: context.organizationId, teacherId: scope.teacherId, deletedAt: null },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      }),
      scopedDb.subject.findMany({
        where: { organizationId: context.organizationId, deletedAt: null },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      }),
    ]);

    return (
      <>
        <PageHeader title="Presenças" description="As suas sessões de presença." />
        <div className="p-8 space-y-6">
          <SessionsTable
            result={result}
            classGroups={classGroups}
            subjects={subjects}
            defaultSearch={search}
            defaultStatus={status}
            defaultClassGroupId={classGroupId}
            defaultSubjectId={subjectId}
            canComplete={canComplete}
            canCancel={canCancel}
          />
        </div>
      </>
    );
  }

  const [result, stats, filterOptions] = await Promise.all([
    getAttendanceSessionsByOrganization(context.organizationId, {
      ...pagination,
      search,
      status,
      classGroupId,
      subjectId,
    }),
    getAttendanceSessionStats(context.organizationId),
    getFilterOptions(context.organizationId),
  ]);

  return (
    <>
      <PageHeader
        title="Sessões de Presença"
        description="Gerir sessões e marcar presenças."
        actions={
          canCreate ? (
            <Button asChild size="sm">
              <Link href="/attendance/sessions/new">
                <Plus className="size-4 mr-1.5" />
                Nova Sessão
              </Link>
            </Button>
          ) : undefined
        }
      />

      <div className="p-8 space-y-6">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <StatCard title="Total" value={result.total} />
          <StatCard title="Abertas" value={stats["OPEN"] ?? 0} />
          <StatCard title="Concluídas" value={stats["COMPLETED"] ?? 0} />
          <StatCard title="Rascunhos" value={stats["DRAFT"] ?? 0} />
        </div>

        <SessionsTable
          result={result}
          classGroups={filterOptions.classGroups}
          subjects={filterOptions.subjects}
          defaultSearch={search}
          defaultStatus={status}
          defaultClassGroupId={classGroupId}
          defaultSubjectId={subjectId}
          canComplete={canComplete}
          canCancel={canCancel}
        />
      </div>
    </>
  );
}
