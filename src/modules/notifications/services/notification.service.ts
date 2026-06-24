import {
  createNotification as createNotificationRow,
  findRecentDuplicate,
  findNotificationById,
  countUnread,
  findLatestForUser as findLatestForUserRepo,
  findManyForUser,
  markAsRead as markAsReadRepo,
  markAllAsRead as markAllAsReadRepo,
  archiveNotification as archiveNotificationRepo,
} from "@/modules/notifications/repositories/notification.repository";
import { NotFoundError } from "@/shared/lib/command";
import { buildPaginationMeta } from "@/shared/lib/pagination";
import { resolveNotificationConfig } from "@/modules/notifications/services/notification-rule-engine.service";
import { renderTemplate } from "@/modules/notifications/services/notification-template-renderer";
import { createDeliveriesForNotification } from "@/modules/notifications/services/notification-delivery.service";
import { NotificationChannel } from "@/shared/types/common";
import type {
  CreateNotificationInput,
  Notification,
  NotificationFilters,
} from "@/modules/notifications/types";
import type { PaginatedResult } from "@/shared/types/common";

/**
 * Delivery rows are secondary bookkeeping, not the notification itself — a
 * failure here (DB hiccup, resolver bug) must never roll back or throw past
 * an already-committed Notification row, and must never abort a fan-out loop
 * over remaining recipients.
 */
async function safelyCreateDeliveries(
  organizationId: string,
  notification: Notification,
  channels: string[]
): Promise<void> {
  try {
    await createDeliveriesForNotification(organizationId, notification, channels);
  } catch (error) {
    console.error(`[NotificationService] Failed to create deliveries for notification ${notification.id}:`, error);
  }
}

/**
 * Creates a notification, skipping it when a recent duplicate exists.
 * Dedupe only applies when metadata.referenceId is provided — without a
 * reference there is nothing stable to compare against.
 *
 * This plain path has no NotificationEventRule to read channels from, so it
 * always creates exactly one IN_APP delivery (DELIVERED immediately) — it
 * was IN_APP-only in Phase 1 and stays that way; callers needing other
 * channels go through createNotificationFromEvent below instead.
 */
export async function createNotification(
  organizationId: string,
  input: CreateNotificationInput
): Promise<Notification | null> {
  const referenceId = input.metadata?.referenceId;
  if (typeof referenceId === "string") {
    const isDuplicate = await findRecentDuplicate(
      organizationId,
      input.recipientUserId,
      input.type,
      referenceId
    );
    if (isDuplicate) return null;
  }

  const notification = await createNotificationRow(organizationId, input);
  await safelyCreateDeliveries(organizationId, notification, [NotificationChannel.IN_APP]);
  return notification;
}

export interface CreateNotificationFromEventInput {
  eventType: string;
  recipientUserId: string;
  /** Values substituted into the resolved title/body/actionUrl templates. */
  variables: Record<string, unknown>;
  /** Drives dedupe when present; also stored as metadata.referenceId. */
  referenceId?: string;
}

/**
 * Template/rule-driven notification creation (Phase 2). Resolves the org's
 * NotificationEventRule + active NotificationTemplate (or catalog default)
 * for `eventType`, renders title/body/actionUrl from `variables`, and
 * applies the rule's own dedupeWindowMinutes instead of the fixed 24h used
 * by the plain `createNotification()` above.
 *
 * Returns null when: no rule exists, the rule is disabled, IN_APP isn't an
 * enabled channel, or a recent duplicate exists. There is no hardcoded-text
 * fallback for a missing rule — per spec, a missing rule means the
 * notification is intentionally not sent (a dev-only warning is logged by
 * the rule engine).
 */
export async function createNotificationFromEvent(
  organizationId: string,
  input: CreateNotificationFromEventInput
): Promise<Notification | null> {
  const resolved = await resolveNotificationConfig(organizationId, input.eventType, NotificationChannel.IN_APP);
  if (!resolved) return null;

  const { rule, catalogEntry, titleTemplate, bodyTemplate } = resolved;

  if (input.referenceId) {
    const isDuplicate = await findRecentDuplicate(
      organizationId,
      input.recipientUserId,
      input.eventType,
      input.referenceId,
      rule.dedupeWindowMinutes
    );
    if (isDuplicate) return null;
  }

  const { rendered: title } = renderTemplate(titleTemplate, input.variables);
  const { rendered: message } = renderTemplate(bodyTemplate, input.variables);
  const actionUrl = catalogEntry.defaultActionUrlPattern
    ? renderTemplate(catalogEntry.defaultActionUrlPattern, input.variables).rendered
    : undefined;

  const notification = await createNotificationRow(organizationId, {
    recipientUserId: input.recipientUserId,
    type: input.eventType,
    severity: catalogEntry.defaultSeverity,
    title,
    message,
    actionUrl,
    metadata: input.referenceId ? { referenceId: input.referenceId } : null,
  });

  // rule.channels always contains IN_APP here — resolveNotificationConfig
  // above already returned null otherwise — but may also list EMAIL/
  // WHATSAPP/SMS/PUSH if an admin enabled them in the Rules tab, in which
  // case a PENDING/FAILED delivery row is created for each (see
  // createDeliveriesForNotification — no provider sends anything yet).
  await safelyCreateDeliveries(organizationId, notification, rule.channels);

  return notification;
}

export async function createManyNotifications(
  organizationId: string,
  inputs: CreateNotificationInput[]
): Promise<Notification[]> {
  const created: Notification[] = [];
  for (const input of inputs) {
    const notification = await createNotification(organizationId, input);
    if (notification) created.push(notification);
  }
  return created;
}

export async function createManyNotificationsFromEvent(
  organizationId: string,
  inputs: CreateNotificationFromEventInput[]
): Promise<Notification[]> {
  const created: Notification[] = [];
  for (const input of inputs) {
    const notification = await createNotificationFromEvent(organizationId, input);
    if (notification) created.push(notification);
  }
  return created;
}

export async function getUnreadCount(organizationId: string, userId: string): Promise<number> {
  return countUnread(organizationId, userId);
}

export async function getLatestForUser(
  organizationId: string,
  userId: string,
  limit = 10
): Promise<Notification[]> {
  return findLatestForUserRepo(organizationId, userId, limit);
}

export async function listForCurrentUser(
  organizationId: string,
  userId: string,
  filters: NotificationFilters
): Promise<PaginatedResult<Notification>> {
  const page = filters.page ?? 1;
  const pageSize = filters.pageSize ?? 20;
  const { data, total } = await findManyForUser(organizationId, userId, {
    ...filters,
    page,
    pageSize,
  });
  return buildPaginationMeta(data, total, { page, pageSize });
}

export async function markAsRead(organizationId: string, notificationId: string): Promise<Notification> {
  const notification = await findNotificationById(notificationId, organizationId);
  if (!notification) throw new NotFoundError("Notification", notificationId);
  if (notification.status !== "ARCHIVED") {
    await markAsReadRepo(notificationId, organizationId);
  }
  return (await findNotificationById(notificationId, organizationId)) ?? notification;
}

export async function markAllAsRead(organizationId: string, userId: string): Promise<number> {
  return markAllAsReadRepo(organizationId, userId);
}

export async function archive(organizationId: string, notificationId: string): Promise<Notification> {
  const notification = await findNotificationById(notificationId, organizationId);
  if (!notification) throw new NotFoundError("Notification", notificationId);
  await archiveNotificationRepo(notificationId, organizationId);
  return (await findNotificationById(notificationId, organizationId)) ?? notification;
}
