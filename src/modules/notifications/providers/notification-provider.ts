import type { NotificationChannel } from "@/shared/types/common";

// =============================================================================
// NOTIFICATION PROVIDER (PHASE 3.2A)
// Channel-agnostic contract the dispatcher calls for every non-IN_APP
// delivery. A provider only reports an outcome — it never touches
// NotificationDelivery itself; the dispatcher/service is the only thing
// allowed to transition delivery status based on the returned result.
// =============================================================================

export interface SendNotificationInput {
  organizationId: string;
  deliveryId: string;
  notificationId: string;
  channel: NotificationChannel;
  recipient: string;
  subject?: string;
  title: string;
  body: string;
  metadata?: Record<string, unknown> | null;
}

/** Mirrors the subset of NotificationDeliveryStatus a provider can directly report. */
export type ProviderDeliveryStatus = "SENT" | "DELIVERED" | "FAILED";

export interface SendNotificationResult {
  success: boolean;
  provider: string;
  providerMessageId?: string;
  status: ProviderDeliveryStatus;
  errorCode?: string;
  errorMessage?: string;
  rawResponse?: unknown;
}

export interface NotificationProvider {
  send(input: SendNotificationInput): Promise<SendNotificationResult>;
}
