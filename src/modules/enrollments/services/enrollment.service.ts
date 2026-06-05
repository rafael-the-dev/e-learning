import {
  findEnrollmentsByOrganization,
  findEnrollmentByIdInOrganization,
  findEnrollmentHistory,
  countEnrollmentsByStatus,
  type ListEnrollmentsParams,
} from "@/modules/enrollments/repositories/enrollment.repository";
import { NotFoundError } from "@/shared/lib/command";
import type { Enrollment, EnrollmentStatusHistory } from "@/modules/enrollments/types";
import type { PaginatedResult } from "@/shared/types/common";

export async function getEnrollmentsByOrganization(
  organizationId: string,
  params: ListEnrollmentsParams
): Promise<PaginatedResult<Enrollment>> {
  return findEnrollmentsByOrganization(organizationId, params);
}

export async function getEnrollmentById(
  enrollmentId: string,
  organizationId: string
): Promise<Enrollment> {
  const enrollment = await findEnrollmentByIdInOrganization(enrollmentId, organizationId);
  if (!enrollment) throw new NotFoundError("Matrícula", enrollmentId);
  return enrollment;
}

export async function getEnrollmentHistory(
  enrollmentId: string,
  organizationId: string
): Promise<EnrollmentStatusHistory[]> {
  return findEnrollmentHistory(enrollmentId, organizationId);
}

export async function getEnrollmentStats(
  organizationId: string
): Promise<Record<string, number>> {
  return countEnrollmentsByStatus(organizationId);
}
