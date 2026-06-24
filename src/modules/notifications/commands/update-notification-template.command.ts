import { BaseCommand, ValidationError, AuthorizationError, NotFoundError } from "@/shared/lib/command";
import { getUserPermissions, createAbility } from "@/server/auth/rbac";
import { PERMISSIONS } from "@/server/auth/permissions";
import { auditService } from "@/modules/audit-logs/services/audit.service";
import { findTemplateById } from "@/modules/notifications/repositories/notification-template.repository";
import { updateTemplate } from "@/modules/notifications/services/notification-template.service";
import {
  updateNotificationTemplateSchema,
  type UpdateNotificationTemplateSchema,
} from "@/modules/notifications/schemas/notification-template.schema";
import type { NotificationTemplate } from "@/modules/notifications/types";

export class UpdateNotificationTemplateCommand extends BaseCommand<
  UpdateNotificationTemplateSchema,
  NotificationTemplate
> {
  private before: NotificationTemplate | null = null;

  async validate(): Promise<void> {
    const result = updateNotificationTemplateSchema.safeParse(this.input);
    if (!result.success) {
      const fieldErrors: Record<string, string[]> = {};
      for (const issue of result.error.issues) {
        const key = issue.path.join(".");
        (fieldErrors[key] ??= []).push(issue.message);
      }
      throw new ValidationError("Dados inválidos", fieldErrors);
    }

    // Scoping the lookup by organizationId enforces tenant isolation.
    this.before = await findTemplateById(this.input.templateId, this.context.organizationId);
    if (!this.before) throw new NotFoundError("NotificationTemplate", this.input.templateId);
  }

  async authorize(): Promise<void> {
    const perms = await getUserPermissions(this.context.userId, this.context.organizationId);
    if (!createAbility(perms).can(PERMISSIONS.NOTIFICATIONS_MANAGE_TEMPLATES)) {
      throw new AuthorizationError();
    }
  }

  async execute(): Promise<NotificationTemplate> {
    const { templateId, ...changes } = this.input;
    const updated = await updateTemplate(this.context.organizationId, templateId, changes);

    await auditService.log(this.context, {
      entity: "NotificationTemplate",
      entityId: updated.id,
      action: "notification_template.updated",
      oldValues: {
        titleTemplate: this.before!.titleTemplate,
        bodyTemplate: this.before!.bodyTemplate,
        name: this.before!.name,
      },
      newValues: { eventType: updated.eventType, channel: updated.channel, ...changes },
    });

    return updated;
  }
}
