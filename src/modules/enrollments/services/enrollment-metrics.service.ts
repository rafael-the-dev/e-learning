import {
  countEnrollmentsByStatus,
  countActiveEnrollmentsWithoutClassGroup,
  countEnrollmentsWithOverdueInvoices,
  countActiveEnrollmentsWithoutInvoice,
  countStudentsWithWalletCredit,
  findTopCoursesByActiveEnrollments,
  findEnrollmentMonthlyTrend,
  findEnrollmentBranchDistribution,
} from "@/modules/enrollments/repositories/enrollment.repository";
import type {
  EnrollmentDashboardKPIs,
  EnrollmentCourseDistribution,
  EnrollmentMonthlyTrend,
  EnrollmentBranchDistribution,
} from "@/modules/enrollments/types";

export async function getEnrollmentDashboardKPIs(
  organizationId: string,
  options?: { includePaymentMetrics?: boolean }
): Promise<EnrollmentDashboardKPIs> {
  const include = options?.includePaymentMetrics ?? false;

  const [statusCounts, awaitingClassAssignment, overdueAccounts, studentsWithWalletCredit, activeWithoutInvoice] =
    await Promise.all([
      countEnrollmentsByStatus(organizationId),
      countActiveEnrollmentsWithoutClassGroup(organizationId),
      include ? countEnrollmentsWithOverdueInvoices(organizationId) : Promise.resolve(0),
      include ? countStudentsWithWalletCredit(organizationId) : Promise.resolve(0),
      include ? countActiveEnrollmentsWithoutInvoice(organizationId) : Promise.resolve(0),
    ]);

  const total = Object.values(statusCounts).reduce((a, b) => a + b, 0);

  return {
    total,
    active: statusCounts["ACTIVE"] ?? 0,
    pendingPayment: statusCounts["PENDING_PAYMENT"] ?? 0,
    draft: statusCounts["DRAFT"] ?? 0,
    suspended: statusCounts["SUSPENDED"] ?? 0,
    completed: statusCounts["COMPLETED"] ?? 0,
    cancelled: statusCounts["CANCELLED"] ?? 0,
    awaitingClassAssignment,
    overdueAccounts,
    studentsWithWalletCredit,
    activeWithoutInvoice,
  };
}

export async function getEnrollmentCourseDistribution(
  organizationId: string
): Promise<EnrollmentCourseDistribution[]> {
  return findTopCoursesByActiveEnrollments(organizationId);
}

export async function getEnrollmentMonthlyTrend(
  organizationId: string
): Promise<EnrollmentMonthlyTrend[]> {
  return findEnrollmentMonthlyTrend(organizationId);
}

export async function getEnrollmentBranchDistribution(
  organizationId: string
): Promise<EnrollmentBranchDistribution[]> {
  return findEnrollmentBranchDistribution(organizationId);
}
