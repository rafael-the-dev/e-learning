import {
  createManyDeliveries,
  findDeliveryById,
  findByNotification as findByNotificationRepo,
  listDeliveries as listDeliveriesRepo,
  countByStatus as countByStatusRepo,
  markProcessing as markProcessingRepo,
  markSent as markSentRepo,
  markDelivered as markDeliveredRepo,
  markFailed as markFailedRepo,
  markRetryPending,
  cancelDelivery as cancelDeliveryRepo,
  findRetryEligibleDeliveries,
  bulkRetryDeliveries,
} from "@/modules/notifications/repositories/notification-delivery.repository";
import { resolveRecipient } from "@/modules/notifications/services/notification-recipient-resolver.service";
import { auditService } from "@/modules/audit-logs/services/audit.service";
import { NotFoundError, BusinessRuleError } from "@/shared/lib/command";
import { buildPaginationMeta } from "@/shared/lib/pagination";
import { NotificationChannel, NotificationDeliveryStatus } from "@/shared/types/common";
import type {
  Notification,
  NotificationDelivery,
  NotificationDeliveryFilters,
  CreateNotificationDeliveryInput,
} from "@/modules/notifications/types";
import type { PaginatedResult } from "@/shared/types/common";

// =============================================================================
// NOTIFICATION DELIVERY SERVICE
// One NotificationDelivery row per (Notification, channel). IN_APP is the
// only channel that actually "sends" anything in Phase 3.1 — its delivery is
// created already DELIVERED. Every other channel gets PENDING (recipient
// resolved) or FAILED ("Destinatário indisponível") and sits there until a
// real provider exists (Phase 3.2) to act on it via the dispatcher.
// =============================================================================

const RECIPIENT_UNAVAILABLE_REASON = "Destinatário indisponível";

const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  PENDING: [NotificationDeliveryStatus.PROCESSING, NotificationDeliveryStatus.CANCELLED],
  PROCESSING: [NotificationDeliveryStatus.SENT, NotificationDeliveryStatus.FAILED],
  SENT: [NotificationDeliveryStatus.DELIVERED],
  FAILED: [NotificationDeliveryStatus.PENDING, NotificationDeliveryStatus.CANCELLED],
  DELIVERED: [],
  CANCELLED: [],
};

function assertTransition(from: string, to: string): void {
  if (!ALLOWED_TRANSITIONS[from]?.includes(to)) {
    throw new BusinessRuleError(`Não é possível transitar uma entrega de "${from}" para "${to}"`);
  }
}

/**
 * Creates one NotificationDelivery per channel for a freshly created
 * Notification. IN_APP always resolves and lands DELIVERED immediately —
 * the Notification row itself is the delivery. Other channels resolve a
 * recipient address; found -> PENDING (nothing sent yet, see dispatcher),
 * not found -> FAILED with "Destinatário indisponível".
 */
export async function createDeliveriesForNotification(
  organizationId: string,
  notification: Notification,
  channels: string[]
): Promise<NotificationDelivery[]> {
  const inputs = await Promise.all(
    channels.map(async (channel): Promise<CreateNotificationDeliveryInput> => {
      const typedChannel = channel as NotificationDelivery["channel"];

      if (channel === NotificationChannel.IN_APP) {
        return {
          notificationId: notification.id,
          channel: NotificationChannel.IN_APP,
          recipient: notification.recipientUserId,
          status: NotificationDeliveryStatus.DELIVERED,
          deliveredAt: new Date(),
        };
      }

      const recipient = await resolveRecipient(organizationId, notification.recipientUserId, channel);
      if (!recipient) {
        return {
          notificationId: notification.id,
          channel: typedChannel,
          recipient: "",
          status: NotificationDeliveryStatus.FAILED,
          failureReason: RECIPIENT_UNAVAILABLE_REASON,
        };
      }

      return {
        notificationId: notification.id,
        channel: typedChannel,
        recipient,
        status: NotificationDeliveryStatus.PENDING,
      };
    })
  );

  return createManyDeliveries(organizationId, inputs);
}

export async function listDeliveries(
  organizationId: string,
  filters: NotificationDeliveryFilters
): Promise<PaginatedResult<NotificationDelivery>> {
  const page = filters.page ?? 1;
  const pageSize = filters.pageSize ?? 20;
  const { data, total } = await listDeliveriesRepo(organizationId, { ...filters, page, pageSize });
  return buildPaginationMeta(data, total, { page, pageSize });
}

export async function findByNotification(
  notificationId: string,
  organizationId: string
): Promise<NotificationDelivery[]> {
  return findByNotificationRepo(notificationId, organizationId);
}

export async function getStatusSummary(organizationId: string): Promise<Record<string, number>> {
  return countByStatusRepo(organizationId);
}

async function requireDelivery(deliveryId: string, organizationId: string): Promise<NotificationDelivery> {
  const delivery = await findDeliveryById(deliveryId, organizationId);
  if (!delivery) throw new NotFoundError("NotificationDelivery", deliveryId);
  return delivery;
}

export async function startProcessing(deliveryId: string, organizationId: string): Promise<NotificationDelivery> {
  const delivery = await requireDelivery(deliveryId, organizationId);
  assertTransition(delivery.status, NotificationDeliveryStatus.PROCESSING);
  await markProcessingRepo(deliveryId, organizationId, delivery.status);
  return requireDelivery(deliveryId, organizationId);
}

export async function markSent(
  deliveryId: string,
  organizationId: string,
  providerMessageId?: string,
  provider?: string
): Promise<NotificationDelivery> {
  const delivery = await requireDelivery(deliveryId, organizationId);
  assertTransition(delivery.status, NotificationDeliveryStatus.SENT);
  await markSentRepo(deliveryId, organizationId, delivery.status, providerMessageId, provider);
  return requireDelivery(deliveryId, organizationId);
}

export async function markDelivered(
  deliveryId: string,
  organizationId: string,
  providerMessageId?: string,
  provider?: string
): Promise<NotificationDelivery> {
  const delivery = await requireDelivery(deliveryId, organizationId);
  assertTransition(delivery.status, NotificationDeliveryStatus.DELIVERED);
  await markDeliveredRepo(deliveryId, organizationId, delivery.status, providerMessageId, provider);
  return requireDelivery(deliveryId, organizationId);
}

// Exponential backoff per spec: attempt 1 -> +5min, attempt 2 -> +15min,
// attempt 3 -> +60min. `delivery.attempts` already reflects the attempt that
// just failed (startProcessing increments it before the provider is called),
// so it indexes directly into this table. Any attempt beyond the table
// (a non-default maxAttempts > 3) falls back to the longest tier rather than
// retrying sooner than the established backoff curve.
const BACKOFF_MINUTES_BY_ATTEMPT: Record<number, number> = { 1: 5, 2: 15, 3: 60 };
const MAX_BACKOFF_MINUTES = 60;

function computeBackoffMinutes(attempts: number): number {
  return BACKOFF_MINUTES_BY_ATTEMPT[attempts] ?? MAX_BACKOFF_MINUTES;
}

/**
 * Schedules a future automatic retry (read by the dispatcher's own
 * findDueDeliveries query) using exponential backoff — only when the
 * delivery still has attempts left; once attempts >= maxAttempts the
 * delivery stays FAILED with no nextAttemptAt, requiring a manual retry (or
 * the bulk retry job, which still respects maxAttempts).
 *
 * Only a *terminal* failure (no attempts left) is audited. A transient
 * PROCESSING -> FAILED with attempts remaining will be retried automatically
 * by the dispatcher and has no human actor — auditing it would produce one
 * audit row per attempt instead of one per permanently-failed delivery.
 */
export async function markFailed(
  deliveryId: string,
  organizationId: string,
  reason: string,
  provider?: string
): Promise<NotificationDelivery> {
  const delivery = await requireDelivery(deliveryId, organizationId);
  assertTransition(delivery.status, NotificationDeliveryStatus.FAILED);

  const hasAttemptsLeft = delivery.attempts < delivery.maxAttempts;
  const nextAttemptAt = hasAttemptsLeft
    ? new Date(Date.now() + computeBackoffMinutes(delivery.attempts) * 60 * 1000)
    : null;

  await markFailedRepo(deliveryId, organizationId, delivery.status, reason, nextAttemptAt, provider);
  const failed = await requireDelivery(deliveryId, organizationId);

  if (!hasAttemptsLeft) {
    await auditService.log(
      { userId: "SYSTEM", organizationId },
      {
        entity: "NotificationDelivery",
        entityId: deliveryId,
        action: "notification_delivery.failed",
        oldValues: { status: delivery.status, attempts: delivery.attempts },
        newValues: { status: failed.status, attempts: failed.attempts, failureReason: reason },
      }
    );
  }

  return failed;
}

export async function retryDelivery(deliveryId: string, organizationId: string): Promise<NotificationDelivery> {
  const delivery = await requireDelivery(deliveryId, organizationId);

  if (delivery.status !== NotificationDeliveryStatus.FAILED) {
    throw new BusinessRuleError("Só é possível reenviar entregas que falharam");
  }
  if (delivery.attempts >= delivery.maxAttempts) {
    throw new BusinessRuleError("Número máximo de tentativas excedido");
  }

  assertTransition(delivery.status, NotificationDeliveryStatus.PENDING);
  await markRetryPending(deliveryId, organizationId, delivery.status);
  return requireDelivery(deliveryId, organizationId);
}

export async function cancelDelivery(deliveryId: string, organizationId: string): Promise<NotificationDelivery> {
  const delivery = await requireDelivery(deliveryId, organizationId);
  assertTransition(delivery.status, NotificationDeliveryStatus.CANCELLED);
  await cancelDeliveryRepo(deliveryId, organizationId, delivery.status);
  return requireDelivery(deliveryId, organizationId);
}

export interface RetryJobSummary {
  scanned: number;
  retried: number;
  skipped: number;
  errors: number;
}

/**
 * Bulk-moves eligible FAILED deliveries back to PENDING. This is a
 * deliberately "dumb" bulk transition (no per-row state-machine read) — it
 * does not send anything; the dispatcher picks the now-PENDING rows up on
 * its own next run. `organizationId` is optional so a future all-orgs batch
 * caller can reuse this directly, but `RunNotificationRetryJobCommand`
 * (system-internal, like the dispatcher command) always passes the caller's
 * own organization.
 */
export async function runRetryJob(organizationId?: string, now: Date = new Date()): Promise<RetryJobSummary> {
  try {
    const eligible = await findRetryEligibleDeliveries(organizationId, now);
    const scanned = eligible.length;
    const retried = await bulkRetryDeliveries(eligible.map((d) => d.id), now);
    return { scanned, retried, skipped: scanned - retried, errors: 0 };
  } catch (error) {
    console.error("[NotificationRetryJob] Failed to run retry job:", error);
    return { scanned: 0, retried: 0, skipped: 0, errors: 1 };
  }
}
