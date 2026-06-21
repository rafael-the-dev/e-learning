import { findUpcomingDeadlines } from "@/modules/dashboard/repositories/dashboard-deadlines.repository";
import type { UpcomingDeadline } from "@/modules/dashboard/types";

export async function getUpcomingDeadlines(organizationId: string): Promise<UpcomingDeadline[]> {
  return findUpcomingDeadlines(organizationId);
}
