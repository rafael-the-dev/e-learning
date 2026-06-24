import "dotenv/config";
import { getDb } from "../src/server/db";

// =============================================================================
// ONE-OFF BACKFILL: NotificationDelivery for pre-Phase-3.1 notifications
// Every Notification created before the Phase 3.1 migration has no
// NotificationDelivery row (the table didn't exist yet). The inbox/bell
// don't need this — they only ever read Notification — but the Delivery tab
// would otherwise show nothing for historical notifications. This creates
// one IN_APP/DELIVERED row per orphaned Notification, dated to match its
// original createdAt.
// Run with: pnpm db:backfill-notification-deliveries
// =============================================================================

const BATCH_SIZE = 500;

async function main() {
  const db = await getDb();

  let totalBackfilled = 0;
  while (true) {
    const orphaned = await db.notification.findMany({
      where: { deliveries: { none: {} } },
      select: { id: true, organizationId: true, recipientUserId: true, createdAt: true },
      take: BATCH_SIZE,
    });
    if (orphaned.length === 0) break;

    for (const notification of orphaned) {
      await db.notificationDelivery.create({
        data: {
          organizationId: notification.organizationId,
          notificationId: notification.id,
          channel: "IN_APP",
          recipient: notification.recipientUserId,
          status: "DELIVERED",
          deliveredAt: notification.createdAt,
          createdAt: notification.createdAt,
        },
      });
    }

    totalBackfilled += orphaned.length;
    console.log(`  ✓ backfilled ${totalBackfilled} delivery row(s) so far...`);
  }

  console.log(`Backfill complete: ${totalBackfilled} NotificationDelivery row(s) created.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
