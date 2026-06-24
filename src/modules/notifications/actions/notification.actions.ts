"use server";

import { revalidatePath } from "next/cache";
import { runAction } from "@/shared/lib/action";
import { requireOrganization } from "@/server/auth/context";
import { getUnreadCount, getLatestForUser, listForCurrentUser } from "@/modules/notifications/services/notification.service";
import { MarkNotificationReadCommand } from "@/modules/notifications/commands/mark-notification-read.command";
import { MarkAllNotificationsReadCommand } from "@/modules/notifications/commands/mark-all-notifications-read.command";
import { ArchiveNotificationCommand } from "@/modules/notifications/commands/archive-notification.command";
import type { ActionResult } from "@/shared/types/common";
import type { Notification, NotificationFilters } from "@/modules/notifications/types";

export interface NotificationBellData {
  unreadCount: number;
  latest: Notification[];
}

export async function getNotificationBellDataAction(): Promise<ActionResult<NotificationBellData>> {
  return runAction(async () => {
    const context = await requireOrganization();
    const [unreadCount, latest] = await Promise.all([
      getUnreadCount(context.organizationId, context.userId),
      getLatestForUser(context.organizationId, context.userId, 10),
    ]);
    return { unreadCount, latest };
  });
}

export async function listNotificationsAction(
  filters: NotificationFilters
): Promise<ActionResult<Awaited<ReturnType<typeof listForCurrentUser>>>> {
  return runAction(async () => {
    const context = await requireOrganization();
    return listForCurrentUser(context.organizationId, context.userId, filters);
  });
}

export async function markNotificationReadAction(notificationId: string): Promise<ActionResult<Notification>> {
  return runAction(async () => {
    const context = await requireOrganization();
    const notification = await new MarkNotificationReadCommand({ notificationId }, context).run();
    revalidatePath("/notifications");
    return notification;
  });
}

export async function markAllNotificationsReadAction(): Promise<ActionResult<number>> {
  return runAction(async () => {
    const context = await requireOrganization();
    const count = await new MarkAllNotificationsReadCommand(undefined, context).run();
    revalidatePath("/notifications");
    return count;
  });
}

export async function archiveNotificationAction(notificationId: string): Promise<ActionResult<Notification>> {
  return runAction(async () => {
    const context = await requireOrganization();
    const notification = await new ArchiveNotificationCommand({ notificationId }, context).run();
    revalidatePath("/notifications");
    return notification;
  });
}
