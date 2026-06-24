import { BaseCommand, ValidationError, AuthorizationError } from "@/shared/lib/command";
import { getUserPermissions, createAbility } from "@/server/auth/rbac";
import { PERMISSIONS } from "@/server/auth/permissions";
import { auditService } from "@/modules/audit-logs/services/audit.service";
import { getEmailSettings, upsertEmailSettings } from "@/modules/notifications/services/notification-email-settings.service";
import {
  upsertNotificationEmailSettingsSchema,
  type UpsertNotificationEmailSettingsSchema,
} from "@/modules/notifications/schemas/notification-email-settings.schema";
import type { NotificationEmailSettings } from "@/modules/notifications/types";

export class UpsertNotificationEmailSettingsCommand extends BaseCommand<
  UpsertNotificationEmailSettingsSchema,
  NotificationEmailSettings
> {
  private before: NotificationEmailSettings | null = null;

  async validate(): Promise<void> {
    const result = upsertNotificationEmailSettingsSchema.safeParse(this.input);
    if (!result.success) {
      const fieldErrors: Record<string, string[]> = {};
      for (const issue of result.error.issues) {
        const key = issue.path.join(".");
        (fieldErrors[key] ??= []).push(issue.message);
      }
      throw new ValidationError("Dados inválidos", fieldErrors);
    }

    this.before = await getEmailSettings(this.context.organizationId);
  }

  async authorize(): Promise<void> {
    const perms = await getUserPermissions(this.context.userId, this.context.organizationId);
    if (!createAbility(perms).can(PERMISSIONS.NOTIFICATIONS_MANAGE_EMAIL_SETTINGS)) {
      throw new AuthorizationError();
    }
  }

  async execute(): Promise<NotificationEmailSettings> {
    const updated = await upsertEmailSettings(this.context.organizationId, this.input);

    await auditService.log(this.context, {
      entity: "NotificationEmailSettings",
      entityId: updated.id,
      action: "notification_email_settings.updated",
      // Never includes smtpPasswordEncrypted/smtpPassword — the DTO doesn't carry it.
      oldValues: this.before ? { ...this.before } : null,
      newValues: { ...updated },
    });

    return updated;
  }
}
