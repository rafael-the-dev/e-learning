import { getUnreadCount, getLatestForUser } from "@/modules/notifications/services/notification.service";
import type { Notification } from "@/modules/notifications/types";

// =============================================================================
// GUARDIAN PORTAL — NOTIFICATIONS
// A guardian only ever sees notifications addressed to THEIR OWN user
// (recipientUserId = guardianUserId). A child's private notifications are never
// surfaced here unless they were explicitly sent (copied) to the guardian's
// user. For v1 this is simply "the guardian's own notification inbox".
// =============================================================================

export interface GuardianNotifications {
  notifications: Notification[];
  unreadCount: number;
}

export async function getGuardianNotifications(
  organizationId: string,
  guardianUserId: string,
  limit: number
): Promise<GuardianNotifications> {
  const [unreadCount, notifications] = await Promise.all([
    getUnreadCount(organizationId, guardianUserId),
    getLatestForUser(organizationId, guardianUserId, limit),
  ]);
  return { notifications, unreadCount };
}
