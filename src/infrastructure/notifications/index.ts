// =============================================================================
// NOTIFICATION ABSTRACTION
// Channels: IN_APP (always), EMAIL, future: SMS, WHATSAPP
// =============================================================================

import { getDb } from "@/server/db";
import { email } from "@/infrastructure/email";
import type { NotificationType, NotificationChannel } from "@/shared/types/common";

export interface SendNotificationInput {
  organizationId: string;
  userId?: string;
  type: NotificationType;
  channel: NotificationChannel;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  recipientEmail?: string;
}

export async function sendNotification(
  input: SendNotificationInput
): Promise<void> {
  const db = await getDb();
  await db.notification.create({
    data: {
      organizationId: input.organizationId,
      userId: input.userId,
      type: input.type,
      channel: input.channel,
      title: input.title,
      body: input.body,
      data: input.data ? JSON.stringify(input.data) : null,
      status: "PENDING",
    },
  });

  if (input.channel === "EMAIL" && input.recipientEmail) {
    await email.send({
      to: input.recipientEmail,
      subject: input.title,
      html: `<p>${input.body}</p>`,
      text: input.body,
    });
  }

  // Future: SMS, WhatsApp channels dispatched here
}
