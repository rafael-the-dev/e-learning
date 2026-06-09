import { redirect } from "next/navigation";
import Link from "next/link";
import { PageHeader } from "@/shared/components/layout/page-header";
import { Button } from "@/shared/components/ui/button";
import { StatCard } from "@/shared/components/layout/stat-card";
import { requirePermission } from "@/server/auth/context";
import { getUserPermissions, createAbility } from "@/server/auth/rbac";
import { PERMISSIONS } from "@/server/auth/permissions";
import {
  getEnrollmentsByOrganization,
  getEnrollmentStats,
} from "@/modules/enrollments/services/enrollment.service";
import { EnrollmentsTable } from "@/modules/enrollments/components/enrollments-table";
import { normalizePaginationParams } from "@/shared/lib/pagination";
import { getDb } from "@/server/db";
import { Plus } from "lucide-react";
import { ENROLLMENT_STATUS_LABELS } from "@/modules/enrollments/types";
import type { AuthContext } from "@/server/auth/context";

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
  }>;
}) {
  let context: AuthContext;
  try {
    context = await requirePermission(PERMISSIONS.ENROLLMENTS_VIEW);
  } catch {
    redirect("/forbidden");
  }

  const { page, search, status, courseId, branchId, classGroupId, yearId } = await searchParams;
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

  const [result, stats, filterOptions] = await Promise.all([
    getEnrollmentsByOrganization(context.organizationId, {
      ...pagination,
      search,
      status,
      courseId,
      branchId,
      classGroupId,
      academicYearId: yearId,
    }),
    getEnrollmentStats(context.organizationId),
    getFilterOptions(context.organizationId),
  ]);

  return (
    <>
      <PageHeader
        title="Matrículas"
        description="Gerir as matrículas de alunos em cursos."
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

      <div className="p-8 space-y-6">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <StatCard title="Total" value={result.total} />
          <StatCard
            title={ENROLLMENT_STATUS_LABELS["ACTIVE"]!}
            value={stats["ACTIVE"] ?? 0}
          />
          <StatCard
            title={ENROLLMENT_STATUS_LABELS["PENDING_PAYMENT"]!}
            value={stats["PENDING_PAYMENT"] ?? 0}
          />
          <StatCard
            title={ENROLLMENT_STATUS_LABELS["SUSPENDED"]!}
            value={stats["SUSPENDED"] ?? 0}
          />
        </div>

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
          canEdit={canEdit}
          canActivate={canActivate}
          canSuspend={canSuspend}
          canCancel={canCancel}
          canComplete={canComplete}
          canDelete={canDelete}
        />
      </div>
    </>
  );
}
