import {
  findManyByOrganization,
  findByIdInOrganization,
  findStudentByUserId,
  countByStatus,
  listActiveBranches,
  countNewStudentsThisMonth,
  countStudentsWithPendingInvoices,
  countStudentsAtAcademicRisk,
  countStudentsWithLowAttendance,
  findTopCoursesByEnrollment,
  findTopClassGroupsByOccupancy,
  findRiskWatchlistStudents,
  type ListStudentsParams,
} from "@/modules/students/repositories/student.repository";
import { countEnrollmentsByStatus } from "@/modules/enrollments/repositories/enrollment.repository";
import { NotFoundError } from "@/shared/lib/command";
import type { RiskStudent, TopCourseEnrollment, TopClassGroup } from "@/modules/students/types";

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

/** Returns null (not NotFoundError) — an unlinked account is an expected state for the Student Portal's blocked view, not an error. */
export async function getStudentByUserId(organizationId: string, userId: string) {
  return findStudentByUserId(organizationId, userId);
}

export async function getStudentStats(organizationId: string) {
  return countByStatus(organizationId);
}

export async function getActiveBranches(organizationId: string) {
  return listActiveBranches(organizationId);
}

// =============================================================================
// DASHBOARD SERVICES
// =============================================================================

export async function countNewStudents(organizationId: string): Promise<number> {
  return countNewStudentsThisMonth(organizationId);
}

export async function getStudentsWithPendingPayments(organizationId: string): Promise<number> {
  return countStudentsWithPendingInvoices(organizationId);
}

export async function getStudentsAtAcademicRisk(organizationId: string): Promise<number> {
  return countStudentsAtAcademicRisk(organizationId);
}

export async function getStudentsWithLowAttendance(organizationId: string): Promise<number> {
  return countStudentsWithLowAttendance(organizationId);
}

export async function getTopCoursesByStudents(organizationId: string): Promise<TopCourseEnrollment[]> {
  return findTopCoursesByEnrollment(organizationId);
}

export async function getTopClassGroupsByOccupancy(organizationId: string): Promise<TopClassGroup[]> {
  return findTopClassGroupsByOccupancy(organizationId);
}

export async function getRiskWatchlist(organizationId: string): Promise<RiskStudent[]> {
  return findRiskWatchlistStudents(organizationId);
}

export async function getPendingEnrollmentsCount(organizationId: string): Promise<number> {
  const counts = await countEnrollmentsByStatus(organizationId);
  return counts["PENDING"] ?? 0;
}
