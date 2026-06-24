import { findDueDeliveries } from "@/modules/notifications/repositories/notification-delivery.repository";
import { findNotificationById } from "@/modules/notifications/repositories/notification.repository";
import { startProcessing, markSent, markDelivered, markFailed } from "@/modules/notifications/services/notification-delivery.service";
import { getProvider } from "@/modules/notifications/providers/notification-provider-registry";
import { NotificationChannel } from "@/shared/types/common";
import type { NotificationProvider, SendNotificationResult } from "@/modules/notifications/providers/notification-provider";

// =============================================================================
// NOTIFICATION DISPATCHER
// Finds PENDING deliveries due for processing and advances them one step.
// IN_APP is the only channel with anything real behind it — it goes straight
// to DELIVERED, unchanged since Phase 3.1. Every other channel resolves a
// NotificationProvider from the registry (Phase 3.2A, DB-backed for EMAIL
// since 3.2B) and calls send().
// =============================================================================

const PROVIDER_NOT_CONFIGURED_REASON = "Fornecedor não configurado";
const GENERIC_FAILURE_REASON = "Falha no envio da notificação";

/**
 * `PROVIDER_NOT_CONFIGURED` is the only error code with a dedicated
 * Portuguese label — everything else falls through to the provider's own
 * `errorMessage` (or the generic fallback) rather than being lumped into
 * "Fornecedor não configurado", which would misrepresent a real send
 * failure (Phase 3.2B) as a missing integration.
 */
function resolveFailureReason(result: SendNotificationResult): string {
  if (result.errorCode === "PROVIDER_NOT_CONFIGURED") {
    return PROVIDER_NOT_CONFIGURED_REASON;
  }
  if (result.errorMessage) {
    return result.errorMessage;
  }
  return GENERIC_FAILURE_REASON;
}

export interface DispatchSummary {
  processed: number;
  /** Provider reported a hand-off (status "SENT") — not yet delivery-confirmed. */
  sent: number;
  /** IN_APP (always) or a provider that explicitly confirmed delivery (status "DELIVERED"). */
  delivered: number;
  /** Every send failure, regardless of errorCode. */
  failed: number;
  /** Subset of `failed` where errorCode === "PROVIDER_NOT_CONFIGURED" specifically. */
  providerNotConfigured: number;
  errors: number;
}

interface DueDelivery {
  id: string;
  channel: string;
  notificationId: string;
  recipient: string;
}

type DispatchOutcome =
  | { kind: "sent" }
  | { kind: "delivered" }
  | { kind: "failed"; providerNotConfigured: boolean };

/**
 * Caches one resolved provider per (organizationId, channel) for the
 * lifetime of a single `dispatchPendingDeliveries` call — every delivery to
 * the same org/channel in that run reuses it instead of re-reading
 * NotificationEmailSettings and re-decrypting the SMTP password per
 * delivery. Deliberately not module-level/global: a fresh Map is created on
 * every call, so a settings change (disable, password rotation, etc.) is
 * picked up by the very next dispatch run rather than requiring a restart.
 */
type ProviderCache = Map<string, NotificationProvider>;

function providerCacheKey(organizationId: string, channel: string): string {
  return `${organizationId}:${channel}`;
}

async function resolveProvider(
  cache: ProviderCache,
  channel: NotificationChannel,
  organizationId: string
): Promise<NotificationProvider> {
  const key = providerCacheKey(organizationId, channel);
  const cached = cache.get(key);
  if (cached) return cached;

  const provider = await getProvider(channel, organizationId);
  cache.set(key, provider);
  return provider;
}

async function dispatchOne(
  delivery: DueDelivery,
  organizationId: string,
  providerCache: ProviderCache
): Promise<DispatchOutcome> {
  await startProcessing(delivery.id, organizationId);

  if (delivery.channel === NotificationChannel.IN_APP) {
    await markSent(delivery.id, organizationId);
    await markDelivered(delivery.id, organizationId);
    return { kind: "delivered" };
  }

  const notification = await findNotificationById(delivery.notificationId, organizationId);
  const provider = await resolveProvider(providerCache, delivery.channel as NotificationChannel, organizationId);

  const result = await provider.send({
    organizationId,
    deliveryId: delivery.id,
    notificationId: delivery.notificationId,
    channel: delivery.channel as NotificationChannel,
    recipient: delivery.recipient,
    title: notification?.title ?? "",
    body: notification?.message ?? "",
  });

  if (!result.success) {
    await markFailed(delivery.id, organizationId, resolveFailureReason(result), result.provider);
    return { kind: "failed", providerNotConfigured: result.errorCode === "PROVIDER_NOT_CONFIGURED" };
  }

  await markSent(delivery.id, organizationId, result.providerMessageId, result.provider);
  if (result.status === "DELIVERED") {
    await markDelivered(delivery.id, organizationId, result.providerMessageId, result.provider);
    return { kind: "delivered" };
  }
  return { kind: "sent" };
}

export async function dispatchPendingDeliveries(
  organizationId: string,
  now: Date = new Date(),
  limit?: number
): Promise<DispatchSummary> {
  const due = await findDueDeliveries(organizationId, now, limit);

  let sent = 0;
  let delivered = 0;
  let failed = 0;
  let providerNotConfigured = 0;
  let errors = 0;

  const providerCache: ProviderCache = new Map();

  for (const delivery of due) {
    try {
      const outcome = await dispatchOne(delivery, organizationId, providerCache);
      if (outcome.kind === "sent") {
        sent++;
      } else if (outcome.kind === "delivered") {
        delivered++;
      } else {
        failed++;
        if (outcome.providerNotConfigured) providerNotConfigured++;
      }
    } catch (error) {
      errors++;
      console.error(`[NotificationDispatcher] Failed to dispatch delivery ${delivery.id}:`, error);
    }
  }

  return { processed: due.length, sent, delivered, failed, providerNotConfigured, errors };
}
