import { BaseCommand, ValidationError, AuthorizationError, NotFoundError } from "@/shared/lib/command";
import { getUserPermissions, createAbility } from "@/server/auth/rbac";
import { PERMISSIONS } from "@/server/auth/permissions";
import { auditService } from "@/modules/audit-logs/services/audit.service";
import { findTemplateById } from "@/modules/notifications/repositories/notification-template.repository";
import { activateTemplate } from "@/modules/notifications/services/notification-template.service";
import { templateIdSchema, type TemplateIdSchema } from "@/modules/notifications/schemas/notification-template.schema";
import type { NotificationTemplate } from "@/modules/notifications/types";

export class ActivateNotificationTemplateCommand extends BaseCommand<TemplateIdSchema, NotificationTemplate> {
  async validate(): Promise<void> {
    const result = templateIdSchema.safeParse(this.input);
    if (!result.success) throw new ValidationError("Dados inválidos");

    const template = await findTemplateById(this.input.templateId, this.context.organizationId);
    if (!template) throw new NotFoundError("NotificationTemplate", this.input.templateId);
  }

  async authorize(): Promise<void> {
    const perms = await getUserPermissions(this.context.userId, this.context.organizationId);
    if (!createAbility(perms).can(PERMISSIONS.NOTIFICATIONS_MANAGE_TEMPLATES)) {
      throw new AuthorizationError();
    }
  }

  async execute(): Promise<NotificationTemplate> {
    const activated = await activateTemplate(this.context.organizationId, this.input.templateId);

    await auditService.log(this.context, {
      entity: "NotificationTemplate",
      entityId: activated.id,
      action: "notification_template.activated",
      newValues: { eventType: activated.eventType, channel: activated.channel },
    });

    return activated;
  }
}
