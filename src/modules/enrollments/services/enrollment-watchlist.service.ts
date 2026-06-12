import { findEnrollmentWatchlist } from "@/modules/enrollments/repositories/enrollment.repository";
import type { EnrollmentWatchlistItem } from "@/modules/enrollments/types";

export async function getEnrollmentWatchlist(
  organizationId: string
): Promise<EnrollmentWatchlistItem[]> {
  return findEnrollmentWatchlist(organizationId);
}
