import { BaseCommand, AuthorizationError } from "@/shared/lib/command";
import { getUserPermissions, createAbility } from "@/server/auth/rbac";
import { PERMISSIONS } from "@/server/auth/permissions";
import { auditService } from "@/modules/audit-logs/services/audit.service";
import { disableEmailSettings } from "@/modules/notifications/services/notification-email-settings.service";
import type { NotificationEmailSettings } from "@/modules/notifications/types";

export class DisableNotificationEmailSettingsCommand extends BaseCommand<void, NotificationEmailSettings> {
  async validate(): Promise<void> {
    // Existence is checked by the service (NotFoundError if no settings row).
  }

  async authorize(): Promise<void> {
    const perms = await getUserPermissions(this.context.userId, this.context.organizationId);
    if (!createAbility(perms).can(PERMISSIONS.NOTIFICATIONS_MANAGE_EMAIL_SETTINGS)) {
      throw new AuthorizationError();
    }
  }

  async execute(): Promise<NotificationEmailSettings> {
    const updated = await disableEmailSettings(this.context.organizationId);

    await auditService.log(this.context, {
      entity: "NotificationEmailSettings",
      entityId: updated.id,
      action: "notification_email_settings.disabled",
      newValues: { isEnabled: false },
    });

    return updated;
  }
}
