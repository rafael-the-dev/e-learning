import { BaseCommand, ValidationError, AuthorizationError } from "@/shared/lib/command";
import { getUserPermissions, createAbility } from "@/server/auth/rbac";
import { PERMISSIONS } from "@/server/auth/permissions";
import { auditService } from "@/modules/audit-logs/services/audit.service";
import { createTemplate } from "@/modules/notifications/services/notification-template.service";
import {
  createNotificationTemplateSchema,
  type CreateNotificationTemplateSchema,
} from "@/modules/notifications/schemas/notification-template.schema";
import type { NotificationTemplate } from "@/modules/notifications/types";

export class CreateNotificationTemplateCommand extends BaseCommand<
  CreateNotificationTemplateSchema,
  NotificationTemplate
> {
  async validate(): Promise<void> {
    const result = createNotificationTemplateSchema.safeParse(this.input);
    if (!result.success) {
      const fieldErrors: Record<string, string[]> = {};
      for (const issue of result.error.issues) {
        const key = issue.path.join(".");
        (fieldErrors[key] ??= []).push(issue.message);
      }
      throw new ValidationError("Dados inválidos", fieldErrors);
    }
  }

  async authorize(): Promise<void> {
    const perms = await getUserPermissions(this.context.userId, this.context.organizationId);
    if (!createAbility(perms).can(PERMISSIONS.NOTIFICATIONS_MANAGE_TEMPLATES)) {
      throw new AuthorizationError();
    }
  }

  async execute(): Promise<NotificationTemplate> {
    const template = await createTemplate(this.context.organizationId, this.input);

    await auditService.log(this.context, {
      entity: "NotificationTemplate",
      entityId: template.id,
      action: "notification_template.created",
      newValues: {
        eventType: template.eventType,
        channel: template.channel,
        titleTemplate: template.titleTemplate,
        bodyTemplate: template.bodyTemplate,
      },
    });

    return template;
  }
}
