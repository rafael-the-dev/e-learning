import { redirect } from "next/navigation";
import Link from "next/link";
import { PageHeader } from "@/shared/components/layout/page-header";
import { Button } from "@/shared/components/ui/button";
import { requirePermission } from "@/server/auth/context";
import { getUserPermissions, createAbility } from "@/server/auth/rbac";
import { PERMISSIONS } from "@/server/auth/permissions";
import {
  getClassGroupsByOrganization,
  getClassGroupStats,
} from "@/modules/class-groups/services/class-group.service";
import { ClassGroupsTable } from "@/modules/class-groups/components/class-groups-table";
import { normalizePaginationParams } from "@/shared/lib/pagination";
import { getDb } from "@/server/db";
import { Plus } from "lucide-react";
import { StatCard } from "@/shared/components/layout/stat-card";
import { CLASS_GROUP_STATUS_LABELS } from "@/modules/class-groups/types";
import type { AuthContext } from "@/server/auth/context";

export const metadata = { title: "Turmas" };

async function getFormOptions(organizationId: string) {
  const db = await getDb();
  const [courses, branches, academicYears] = await Promise.all([
    db.course.findMany({
      where: { organizationId, deletedAt: null, status: { not: "ARCHIVED" } },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    db.branch.findMany({
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
  return { courses, branches, academicYears };
}

export default async function ClassGroupsPage({
  searchParams,
}: {
  searchParams: Promise<{
    page?: string;
    search?: string;
    status?: string;
    courseId?: string;
    branchId?: string;
    yearId?: string;
  }>;
}) {
  let context: AuthContext;
  try {
    context = await requirePermission(PERMISSIONS.CLASS_GROUPS_READ);
  } catch {
    redirect("/forbidden");
  }

  const { page, search, status, courseId, branchId, yearId } = await searchParams;
  const pagination = normalizePaginationParams(page);

  const perms = await getUserPermissions(context.userId, context.organizationId);
  const ability = createAbility(perms);
  const canCreate = ability.can(PERMISSIONS.CLASS_GROUPS_CREATE);
  const canEdit = ability.can(PERMISSIONS.CLASS_GROUPS_UPDATE);
  const canArchive = ability.can(PERMISSIONS.CLASS_GROUPS_ARCHIVE);
  const canDelete = ability.can(PERMISSIONS.CLASS_GROUPS_DELETE);

  const [result, stats, { courses, branches, academicYears }] = await Promise.all([
    getClassGroupsByOrganization(context.organizationId, {
      ...pagination,
      search,
      status,
      courseId,
      branchId,
      academicYearId: yearId,
    }),
    getClassGroupStats(context.organizationId),
    getFormOptions(context.organizationId),
  ]);

  const totalForming = stats["FORMING"] ?? 0;
  const totalActive = stats["ACTIVE"] ?? 0;
  const totalCompleted = stats["COMPLETED"] ?? 0;

  return (
    <>
      <PageHeader
        title="Turmas"
        description="Gerir os grupos de alunos por curso e nível."
        actions={
          canCreate ? (
            <Button asChild size="sm">
              <Link href="/class-groups/new">
                <Plus className="size-4 mr-1.5" />
                Nova Turma
              </Link>
            </Button>
          ) : undefined
        }
      />

      <div className="p-8 space-y-6">
        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <StatCard title="Total" value={result.total} />
          <StatCard title={CLASS_GROUP_STATUS_LABELS["FORMING"]!} value={totalForming} />
          <StatCard title={CLASS_GROUP_STATUS_LABELS["ACTIVE"]!} value={totalActive} />
          <StatCard title={CLASS_GROUP_STATUS_LABELS["COMPLETED"]!} value={totalCompleted} />
        </div>

        <ClassGroupsTable
          result={result}
          courses={courses}
          branches={branches}
          academicYears={academicYears}
          defaultSearch={search}
          defaultStatus={status}
          defaultCourseId={courseId}
          defaultBranchId={branchId}
          defaultAcademicYearId={yearId}
          canEdit={canEdit}
          canArchive={canArchive}
          canDelete={canDelete}
        />
      </div>
    </>
  );
}

