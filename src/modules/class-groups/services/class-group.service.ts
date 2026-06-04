import {
  findClassGroupsByOrganization,
  findClassGroupById,
  countClassGroupsByStatus,
  type ListClassGroupsParams,
} from "@/modules/class-groups/repositories/class-group.repository";
import { NotFoundError } from "@/shared/lib/command";
import { getDb } from "@/server/db";

// =============================================================================
// CLASS GROUPS SERVICE
// Read-only wrappers — authorization happens in Commands.
// =============================================================================

export async function getClassGroupsByOrganization(
  organizationId: string,
  params: ListClassGroupsParams
) {
  return findClassGroupsByOrganization(organizationId, params);
}

export async function getClassGroupById(id: string, organizationId: string) {
  const group = await findClassGroupById(id, organizationId);
  if (!group) throw new NotFoundError("Turma", id);
  return group;
}


export async function getClassGroupStats(organizationId: string) {
  return countClassGroupsByStatus(organizationId);
}

export async function getClassGroupFormReferenceData(organizationId: string) {
  const db = await getDb();
  const [courses, levels, teachers, branches] = await Promise.all([
    db.course.findMany({
      where: { organizationId, deletedAt: null, status: { not: "ARCHIVED" } },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    db.courseLevel.findMany({
      where: { course: { organizationId, deletedAt: null } },
      select: { id: true, name: true, courseId: true },
      orderBy: [{ courseId: "asc" }, { order: "asc" }],
    }),
    db.teacher.findMany({
      where: { organizationId, deletedAt: null, status: "ACTIVE" },
      select: { id: true, firstName: true, lastName: true },
      orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
    }),
    db.branch.findMany({
      where: { organizationId, deletedAt: null },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);
  return { courses, levels, teachers, branches };
}
