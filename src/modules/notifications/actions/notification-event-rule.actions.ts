"use server";

import { revalidatePath } from "next/cache";
import { runAction } from "@/shared/lib/action";
import { requireOrganization, requirePermission } from "@/server/auth/context";
import { PERMISSIONS } from "@/server/auth/permissions";
import { listRules } from "@/modules/notifications/services/notification-event-rule.service";
import { UpdateNotificationEventRuleCommand } from "@/modules/notifications/commands/update-notification-event-rule.command";
import type { UpdateNotificationEventRuleSchema } from "@/modules/notifications/schemas/notification-event-rule.schema";
import type { ActionResult } from "@/shared/types/common";
import type { NotificationEventRule } from "@/modules/notifications/types";

export async function listNotificationEventRulesAction(): Promise<ActionResult<NotificationEventRule[]>> {
  return runAction(async () => {
    const context = await requirePermission(PERMISSIONS.NOTIFICATIONS_MANAGE_RULES);
    return listRules(context.organizationId);
  });
}

export async function updateNotificationEventRuleAction(
  input: UpdateNotificationEventRuleSchema
): Promise<ActionResult<NotificationEventRule>> {
  return runAction(async () => {
    const context = await requireOrganization();
    const rule = await new UpdateNotificationEventRuleCommand(input, context).run();
    revalidatePath("/notifications");
    return rule;
  });
}
