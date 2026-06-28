import {
  findInvoicesDueSoon,
  findClassGroupDeadlines,
  findUpcomingAssessments,
  findUpcomingAcademicEvents,
} from "@/modules/secretary-portal/repositories/secretary-portal.repository";
import type { SecretaryDeadline } from "@/modules/secretary-portal/types";

// =============================================================================
// SECRETARY PORTAL — UPCOMING DEADLINES (next 14 days)
// Merges invoices due, class-group start/end, assessments and academic events
// into one chronologically-sorted, capped list.
// =============================================================================

export const DEADLINE_WINDOW_DAYS = 14;
export const DEADLINE_PER_SOURCE_LIMIT = 15;
export const DEADLINE_TOTAL_LIMIT = 20;

/** Pure: merge → sort ascending by date → cap. */
export function mergeAndSortDeadlines(
  sources: SecretaryDeadline[][],
  limit: number
): SecretaryDeadline[] {
  return sources
    .flat()
    .sort((a, b) => a.date.getTime() - b.date.getTime())
    .slice(0, limit);
}

export async function getSecretaryUpcomingDeadlines(
  organizationId: string,
  now: Date
): Promise<SecretaryDeadline[]> {
  const until = new Date(now.getTime() + DEADLINE_WINDOW_DAYS * 86_400_000);

  const [invoices, classGroups, assessments, events] = await Promise.all([
    findInvoicesDueSoon(organizationId, now, until, DEADLINE_PER_SOURCE_LIMIT),
    findClassGroupDeadlines(organizationId, now, until, DEADLINE_PER_SOURCE_LIMIT),
    findUpcomingAssessments(organizationId, now, until, DEADLINE_PER_SOURCE_LIMIT),
    findUpcomingAcademicEvents(organizationId, now, until, DEADLINE_PER_SOURCE_LIMIT),
  ]);

  return mergeAndSortDeadlines([invoices, classGroups, assessments, events], DEADLINE_TOTAL_LIMIT);
}
