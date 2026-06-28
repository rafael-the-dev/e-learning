import {
  findPendingEnrollments,
  findAttentionInvoices,
  findDocumentsPendingReview,
  findRecentStudents,
} from "@/modules/secretary-portal/repositories/secretary-portal.repository";
import type { SecretaryOperationalQueues } from "@/modules/secretary-portal/types";

// =============================================================================
// SECRETARY PORTAL — OPERATIONAL QUEUES
// Top-N bounded lists. Each query is independent so they run concurrently.
// =============================================================================

export const QUEUE_LIMIT = 10;

export async function getSecretaryOperationalQueues(
  organizationId: string,
  now: Date
): Promise<SecretaryOperationalQueues> {
  const [pendingEnrollments, attentionInvoices, documentsToReview, recentStudents] = await Promise.all([
    findPendingEnrollments(organizationId, QUEUE_LIMIT),
    findAttentionInvoices(organizationId, now, QUEUE_LIMIT),
    findDocumentsPendingReview(organizationId, now, QUEUE_LIMIT),
    findRecentStudents(organizationId, QUEUE_LIMIT),
  ]);

  return { pendingEnrollments, attentionInvoices, documentsToReview, recentStudents };
}
