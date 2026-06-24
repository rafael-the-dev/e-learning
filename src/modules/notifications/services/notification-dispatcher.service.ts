import { findDueDeliveries } from "@/modules/notifications/repositories/notification-delivery.repository";
import { findNotificationById } from "@/modules/notifications/repositories/notification.repository";
import { startProcessing, markSent, markDelivered, markFailed } from "@/modules/notifications/services/notification-delivery.service";
import { getProvider } from "@/modules/notifications/providers/notification-provider-registry";
import { NotificationChannel } from "@/shared/types/common";
import type { SendNotificationResult } from "@/modules/notifications/providers/notification-provider";

// =============================================================================
// NOTIFICATION DISPATCHER
// Finds PENDING deliveries due for processing and advances them one step.
// IN_APP is the only channel with anything real behind it — it goes straight
// to DELIVERED, unchanged since Phase 3.1. Every other channel resolves a
// NotificationProvider from the registry (Phase 3.2A) and calls send() —
// today that always reports back PROVIDER_NOT_CONFIGURED (no real provider
// is wired yet), so the delivery is marked FAILED, same as before, but
// through the provider interface rather than a hardcoded branch.
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
  providerNotConfigured: number;
  errors: number;
}

interface DueDelivery {
  id: string;
  channel: string;
  notificationId: string;
  recipient: string;
}

type DispatchOutcome = "sent" | "delivered" | "providerNotConfigured";

async function dispatchOne(delivery: DueDelivery, organizationId: string): Promise<DispatchOutcome> {
  await startProcessing(delivery.id, organizationId);

  if (delivery.channel === NotificationChannel.IN_APP) {
    await markSent(delivery.id, organizationId);
    await markDelivered(delivery.id, organizationId);
    return "delivered";
  }

  const notification = await findNotificationById(delivery.notificationId, organizationId);
  const provider = await getProvider(delivery.channel as NotificationChannel, organizationId);

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
    return "providerNotConfigured";
  }

  await markSent(delivery.id, organizationId, result.providerMessageId, result.provider);
  if (result.status === "DELIVERED") {
    await markDelivered(delivery.id, organizationId, result.providerMessageId, result.provider);
    return "delivered";
  }
  return "sent";
}

export async function dispatchPendingDeliveries(
  organizationId: string,
  now: Date = new Date(),
  limit?: number
): Promise<DispatchSummary> {
  const due = await findDueDeliveries(organizationId, now, limit);

  let sent = 0;
  let delivered = 0;
  let providerNotConfigured = 0;
  let errors = 0;

  for (const delivery of due) {
    try {
      const outcome = await dispatchOne(delivery, organizationId);
      if (outcome === "sent") {
        sent++;
      } else if (outcome === "delivered") {
        delivered++;
      } else {
        providerNotConfigured++;
      }
    } catch (error) {
      errors++;
      console.error(`[NotificationDispatcher] Failed to dispatch delivery ${delivery.id}:`, error);
    }
  }

  return { processed: due.length, sent, delivered, providerNotConfigured, errors };
}
