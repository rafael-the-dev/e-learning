"use server";

import { revalidatePath } from "next/cache";
import { runAction } from "@/shared/lib/action";
import { requireOrganization, requirePermission } from "@/server/auth/context";
import { PERMISSIONS } from "@/server/auth/permissions";
import { getEmailSettings } from "@/modules/notifications/services/notification-email-settings.service";
import { UpsertNotificationEmailSettingsCommand } from "@/modules/notifications/commands/upsert-notification-email-settings.command";
import { EnableNotificationEmailSettingsCommand } from "@/modules/notifications/commands/enable-notification-email-settings.command";
import { DisableNotificationEmailSettingsCommand } from "@/modules/notifications/commands/disable-notification-email-settings.command";
import { TestNotificationEmailSettingsCommand } from "@/modules/notifications/commands/test-notification-email-settings.command";
import type {
  UpsertNotificationEmailSettingsSchema,
  TestNotificationEmailSettingsSchema,
} from "@/modules/notifications/schemas/notification-email-settings.schema";
import type { ActionResult } from "@/shared/types/common";
import type { NotificationEmailSettings, TestNotificationEmailSettingsResult } from "@/modules/notifications/types";

export async function getNotificationEmailSettingsAction(): Promise<ActionResult<NotificationEmailSettings | null>> {
  return runAction(async () => {
    const context = await requirePermission(PERMISSIONS.NOTIFICATIONS_MANAGE_EMAIL_SETTINGS);
    return getEmailSettings(context.organizationId);
  });
}

export async function upsertNotificationEmailSettingsAction(
  input: UpsertNotificationEmailSettingsSchema
): Promise<ActionResult<NotificationEmailSettings>> {
  return runAction(async () => {
    const context = await requireOrganization();
    const settings = await new UpsertNotificationEmailSettingsCommand(input, context).run();
    revalidatePath("/notifications");
    return settings;
  });
}

export async function enableNotificationEmailSettingsAction(): Promise<ActionResult<NotificationEmailSettings>> {
  return runAction(async () => {
    const context = await requireOrganization();
    const settings = await new EnableNotificationEmailSettingsCommand(undefined, context).run();
    revalidatePath("/notifications");
    return settings;
  });
}

export async function disableNotificationEmailSettingsAction(): Promise<ActionResult<NotificationEmailSettings>> {
  return runAction(async () => {
    const context = await requireOrganization();
    const settings = await new DisableNotificationEmailSettingsCommand(undefined, context).run();
    revalidatePath("/notifications");
    return settings;
  });
}

export async function testNotificationEmailSettingsAction(
  input: TestNotificationEmailSettingsSchema
): Promise<ActionResult<TestNotificationEmailSettingsResult>> {
  return runAction(async () => {
    const context = await requireOrganization();
    return new TestNotificationEmailSettingsCommand(input, context).run();
  });
}
