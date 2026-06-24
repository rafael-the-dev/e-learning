"use server";

import { revalidatePath } from "next/cache";
import { runAction } from "@/shared/lib/action";
import { requireOrganization, requirePermission } from "@/server/auth/context";
import { PERMISSIONS } from "@/server/auth/permissions";
import { listDeliveries, getStatusSummary } from "@/modules/notifications/services/notification-delivery.service";
import { RetryNotificationDeliveryCommand } from "@/modules/notifications/commands/retry-notification-delivery.command";
import { CancelNotificationDeliveryCommand } from "@/modules/notifications/commands/cancel-notification-delivery.command";
import type { ActionResult } from "@/shared/types/common";
import type { NotificationDelivery, NotificationDeliveryFilters } from "@/modules/notifications/types";

export async function listNotificationDeliveriesAction(
  filters: NotificationDeliveryFilters
): Promise<ActionResult<Awaited<ReturnType<typeof listDeliveries>>>> {
  return runAction(async () => {
    const context = await requirePermission(PERMISSIONS.NOTIFICATIONS_VIEW_DELIVERIES);
    return listDeliveries(context.organizationId, filters);
  });
}

export async function getNotificationDeliverySummaryAction(): Promise<ActionResult<Record<string, number>>> {
  return runAction(async () => {
    const context = await requirePermission(PERMISSIONS.NOTIFICATIONS_VIEW_DELIVERIES);
    return getStatusSummary(context.organizationId);
  });
}

export async function retryNotificationDeliveryAction(
  deliveryId: string
): Promise<ActionResult<NotificationDelivery>> {
  return runAction(async () => {
    const context = await requireOrganization();
    const delivery = await new RetryNotificationDeliveryCommand({ deliveryId }, context).run();
    revalidatePath("/notifications");
    return delivery;
  });
}

export async function cancelNotificationDeliveryAction(
  deliveryId: string
): Promise<ActionResult<NotificationDelivery>> {
  return runAction(async () => {
    const context = await requireOrganization();
    const delivery = await new CancelNotificationDeliveryCommand({ deliveryId }, context).run();
    revalidatePath("/notifications");
    return delivery;
  });
}
