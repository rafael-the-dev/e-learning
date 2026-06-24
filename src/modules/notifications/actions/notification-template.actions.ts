"use server";

import { revalidatePath } from "next/cache";
import { runAction } from "@/shared/lib/action";
import { requireOrganization, requirePermission } from "@/server/auth/context";
import { PERMISSIONS } from "@/server/auth/permissions";
import { listTemplates, previewTemplate } from "@/modules/notifications/services/notification-template.service";
import { CreateNotificationTemplateCommand } from "@/modules/notifications/commands/create-notification-template.command";
import { UpdateNotificationTemplateCommand } from "@/modules/notifications/commands/update-notification-template.command";
import { ActivateNotificationTemplateCommand } from "@/modules/notifications/commands/activate-notification-template.command";
import { DeactivateNotificationTemplateCommand } from "@/modules/notifications/commands/deactivate-notification-template.command";
import type {
  CreateNotificationTemplateSchema,
} from "@/modules/notifications/schemas/notification-template.schema";
import type { UpdateNotificationTemplateSchema } from "@/modules/notifications/schemas/notification-template.schema";
import type { ActionResult } from "@/shared/types/common";
import type { NotificationTemplate, NotificationTemplateFilters } from "@/modules/notifications/types";

export async function listNotificationTemplatesAction(
  filters: NotificationTemplateFilters
): Promise<ActionResult<{ data: NotificationTemplate[]; total: number }>> {
  return runAction(async () => {
    const context = await requirePermission(PERMISSIONS.NOTIFICATIONS_MANAGE_TEMPLATES);
    return listTemplates(context.organizationId, filters);
  });
}

export async function createNotificationTemplateAction(
  input: CreateNotificationTemplateSchema
): Promise<ActionResult<NotificationTemplate>> {
  return runAction(async () => {
    const context = await requireOrganization();
    const template = await new CreateNotificationTemplateCommand(input, context).run();
    revalidatePath("/notifications");
    return template;
  });
}

export async function updateNotificationTemplateAction(
  input: UpdateNotificationTemplateSchema
): Promise<ActionResult<NotificationTemplate>> {
  return runAction(async () => {
    const context = await requireOrganization();
    const template = await new UpdateNotificationTemplateCommand(input, context).run();
    revalidatePath("/notifications");
    return template;
  });
}

export async function activateNotificationTemplateAction(templateId: string): Promise<ActionResult<NotificationTemplate>> {
  return runAction(async () => {
    const context = await requireOrganization();
    const template = await new ActivateNotificationTemplateCommand({ templateId }, context).run();
    revalidatePath("/notifications");
    return template;
  });
}

export async function deactivateNotificationTemplateAction(templateId: string): Promise<ActionResult<NotificationTemplate>> {
  return runAction(async () => {
    const context = await requireOrganization();
    const template = await new DeactivateNotificationTemplateCommand({ templateId }, context).run();
    revalidatePath("/notifications");
    return template;
  });
}

export async function previewNotificationTemplateAction(
  templateId: string,
  sampleVariables?: Record<string, unknown>
): Promise<ActionResult<Awaited<ReturnType<typeof previewTemplate>>>> {
  return runAction(async () => {
    const context = await requirePermission(PERMISSIONS.NOTIFICATIONS_MANAGE_TEMPLATES);
    return previewTemplate(context.organizationId, templateId, sampleVariables);
  });
}
