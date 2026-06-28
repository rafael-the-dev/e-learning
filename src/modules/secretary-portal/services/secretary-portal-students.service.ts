import {
  countActiveStudentsWithoutPortalAccount,
  countActiveStudentsMissingEmail,
  countInactiveStudentsWithActiveEnrollment,
  countActiveEnrollmentsWithoutClassGroup,
  countActiveEnrollmentsWithoutLevel,
  findActiveStudentsWithoutPortalAccount,
} from "@/modules/secretary-portal/repositories/secretary-portal.repository";
import type { SecretaryStudentAdministration } from "@/modules/secretary-portal/types";

// =============================================================================
// SECRETARY PORTAL — STUDENT ADMINISTRATION
// Data-hygiene queues: missing portal accounts, missing email, mismatched
// student/enrollment status, enrollments missing class group / level.
// Duplicate-contact detection is intentionally omitted — there is no reliable
// schema signal for it yet, so faking it would be misleading.
// =============================================================================

export const WITHOUT_ACCOUNT_LIST_LIMIT = 8;

export async function getSecretaryStudentAdministration(
  organizationId: string
): Promise<SecretaryStudentAdministration> {
  const [
    withoutPortalAccount,
    missingEmail,
    inactiveWithActiveEnrollment,
    enrollmentWithoutClassGroup,
    enrollmentWithoutLevel,
    studentsWithoutPortalAccount,
  ] = await Promise.all([
    countActiveStudentsWithoutPortalAccount(organizationId),
    countActiveStudentsMissingEmail(organizationId),
    countInactiveStudentsWithActiveEnrollment(organizationId),
    countActiveEnrollmentsWithoutClassGroup(organizationId),
    countActiveEnrollmentsWithoutLevel(organizationId),
    findActiveStudentsWithoutPortalAccount(organizationId, WITHOUT_ACCOUNT_LIST_LIMIT),
  ]);

  return {
    withoutPortalAccount,
    missingEmail,
    inactiveWithActiveEnrollment,
    enrollmentWithoutClassGroup,
    enrollmentWithoutLevel,
    studentsWithoutPortalAccount,
  };
}
