import {
  findManyByOrganization,
  findByIdInOrganization,
  findByIdWithSubjects,
  countByStatus,
  listActiveBranches,
  type ListTeachersParams,
} from "@/modules/teachers/repositories/teacher.repository";
import { NotFoundError } from "@/shared/lib/command";

// =============================================================================
// TEACHERS SERVICE
// Read-only wrappers — no auth checks here, only data access.
// Authorization happens in Commands.
// =============================================================================

export async function getTeachersByOrganization(
  organizationId: string,
  params: ListTeachersParams
) {
  return findManyByOrganization(organizationId, params);
}

export async function getTeacherById(id: string, organizationId: string) {
  const teacher = await findByIdInOrganization(id, organizationId);
  if (!teacher) throw new NotFoundError("Professor", id);
  return teacher;
}

export async function getTeacherWithSubjects(id: string, organizationId: string) {
  const teacher = await findByIdWithSubjects(id, organizationId);
  if (!teacher) throw new NotFoundError("Professor", id);
  return teacher;
}

export async function getTeacherStats(organizationId: string) {
  return countByStatus(organizationId);
}

export async function getActiveBranches(organizationId: string) {
  return listActiveBranches(organizationId);
}
