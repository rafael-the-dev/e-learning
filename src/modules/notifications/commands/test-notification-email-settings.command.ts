import { BaseCommand, ValidationError, AuthorizationError } from "@/shared/lib/command";
import { getUserPermissions, createAbility } from "@/server/auth/rbac";
import { PERMISSIONS } from "@/server/auth/permissions";
import { auditService } from "@/modules/audit-logs/services/audit.service";
import { testEmailSettings } from "@/modules/notifications/services/notification-email-settings.service";
import {
  testNotificationEmailSettingsSchema,
  type TestNotificationEmailSettingsSchema,
} from "@/modules/notifications/schemas/notification-email-settings.schema";
import type { TestNotificationEmailSettingsResult } from "@/modules/notifications/types";

export class TestNotificationEmailSettingsCommand extends BaseCommand<
  TestNotificationEmailSettingsSchema,
  TestNotificationEmailSettingsResult
> {
  async validate(): Promise<void> {
    const result = testNotificationEmailSettingsSchema.safeParse(this.input);
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
    if (!createAbility(perms).can(PERMISSIONS.NOTIFICATIONS_MANAGE_EMAIL_SETTINGS)) {
      throw new AuthorizationError();
    }
  }

  async execute(): Promise<TestNotificationEmailSettingsResult> {
    const { recipientEmail, ...settingsDraft } = this.input;
    const result = await testEmailSettings(this.context.organizationId, settingsDraft, recipientEmail);

    await auditService.log(this.context, {
      entity: "NotificationEmailSettings",
      entityId: this.context.organizationId,
      action: "notification_email_settings.tested",
      newValues: { success: result.success, errorMessage: result.errorMessage, recipientEmail },
    });

    return result;
  }
}
