import Link from "next/link";
import { PageHeader } from "@/shared/components/layout/page-header";
import { Button } from "@/shared/components/ui/button";
import { StatCard } from "@/shared/components/layout/stat-card";
import { requirePermissionOrRedirect } from "@/server/auth/context";
import { redirectIfTeacherScoped } from "@/server/auth/teacher-scope";
import { getUserPermissions, createAbility } from "@/server/auth/rbac";
import { PERMISSIONS } from "@/server/auth/permissions";
import {
  getClassroomsByOrganization,
  getClassroomStats,
} from "@/modules/classrooms/services/classroom.service";
import { ClassroomsTable } from "@/modules/classrooms/components/classrooms-table";
import { normalizePaginationParams } from "@/shared/lib/pagination";
import { getDb } from "@/server/db";
import { Plus } from "lucide-react";
import { CLASSROOM_STATUS_LABELS } from "@/modules/classrooms/types";

export const metadata = { title: "Salas" };

async function getBranches(organizationId: string) {
  const db = await getDb();
  return db.branch.findMany({
    where: { organizationId, deletedAt: null },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
}

export default async function ClassroomsPage({
  searchParams,
}: {
  searchParams: Promise<{
    page?: string;
    search?: string;
    status?: string;
    type?: string;
    branchId?: string;
  }>;
}) {
  const context = await requirePermissionOrRedirect(PERMISSIONS.CLASSROOMS_VIEW);
  // Org-wide reference page — blocked for teacher-scoped users (strict policy).
  // See docs/teacher-access-scope.md.
  await redirectIfTeacherScoped(context);

  const { page, search, status, type, branchId } = await searchParams;
  const pagination = normalizePaginationParams(page);

  const perms = await getUserPermissions(context.userId, context.organizationId);
  const ability = createAbility(perms);
  const canCreate = ability.can(PERMISSIONS.CLASSROOMS_CREATE);
  const canEdit = ability.can(PERMISSIONS.CLASSROOMS_UPDATE);
  const canArchive = ability.can(PERMISSIONS.CLASSROOMS_ARCHIVE);

  const [result, stats, branches] = await Promise.all([
    getClassroomsByOrganization(context.organizationId, {
      ...pagination,
      search,
      status,
      classroomType: type,
      branchId,
    }),
    getClassroomStats(context.organizationId),
    getBranches(context.organizationId),
  ]);

  return (
    <>
      <PageHeader
        title="Salas"
        description="Gerir as salas físicas e online da organização."
        actions={
          canCreate ? (
            <Button asChild size="sm">
              <Link href="/classrooms/new">
                <Plus className="size-4 mr-1.5" />
                Nova Sala
              </Link>
            </Button>
          ) : undefined
        }
      />
      <div className="p-8 space-y-6">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <StatCard title="Total" value={result.total} />
          <StatCard title={CLASSROOM_STATUS_LABELS["ACTIVE"]!} value={stats["ACTIVE"] ?? 0} />
          <StatCard title={CLASSROOM_STATUS_LABELS["MAINTENANCE"]!} value={stats["MAINTENANCE"] ?? 0} />
          <StatCard title={CLASSROOM_STATUS_LABELS["INACTIVE"]!} value={stats["INACTIVE"] ?? 0} />
        </div>

        <ClassroomsTable
          result={result}
          branches={branches}
          defaultSearch={search}
          defaultStatus={status}
          defaultType={type}
          defaultBranchId={branchId}
          canEdit={canEdit}
          canArchive={canArchive}
        />
      </div>
    </>
  );
}
