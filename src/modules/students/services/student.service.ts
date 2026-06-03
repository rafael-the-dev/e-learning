import {
  findManyByOrganization,
  findByIdInOrganization,
  countByStatus,
  listActiveBranches,
  type ListStudentsParams,
} from "@/modules/students/repositories/student.repository";
import { NotFoundError } from "@/shared/lib/command";

// =============================================================================
// STUDENTS SERVICE
// Read-only wrappers — no auth checks here, only data access.
// Authorization happens in Commands.
// =============================================================================

export async function getStudentsByOrganization(
  organizationId: string,
  params: ListStudentsParams
) {
  return findManyByOrganization(organizationId, params);
}

export async function getStudentById(id: string, organizationId: string) {
  const student = await findByIdInOrganization(id, organizationId);
  if (!student) throw new NotFoundError("Aluno", id);
  return student;
}

export async function getStudentStats(organizationId: string) {
  return countByStatus(organizationId);
}

export async function getActiveBranches(organizationId: string) {
  return listActiveBranches(organizationId);
}
