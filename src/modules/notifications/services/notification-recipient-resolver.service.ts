import { getDb } from "@/server/db";
import { NotificationChannel } from "@/shared/types/common";

// =============================================================================
// RECIPIENT RESOLVER
// Maps a (recipientUserId, channel) pair to the contact address a delivery
// would be sent to. IN_APP always resolves (the "address" is the user id
// itself — the inbox row). Other channels resolve against User.email/phone;
// returning null means "no delivery can be attempted on this channel yet",
// not a member-of-org failure (membership is validated upstream).
// =============================================================================

export async function resolveRecipient(
  organizationId: string,
  recipientUserId: string,
  channel: string
): Promise<string | null> {
  if (channel === NotificationChannel.IN_APP) return recipientUserId;

  const db = await getDb();
  const user = await db.user.findFirst({
    where: { id: recipientUserId },
    select: { email: true, phone: true },
  });
  if (!user) return null;

  switch (channel) {
    case NotificationChannel.EMAIL:
      return user.email ?? null;
    case NotificationChannel.WHATSAPP:
    case NotificationChannel.SMS:
      return user.phone ?? null;
    case NotificationChannel.PUSH:
      // No push token storage yet — always unavailable until that lands.
      return null;
    default:
      return null;
  }
}
