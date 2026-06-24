import { BaseCommand, ValidationError, AuthorizationError, NotFoundError } from "@/shared/lib/command";
import { getUserPermissions, createAbility } from "@/server/auth/rbac";
import { PERMISSIONS } from "@/server/auth/permissions";
import { findNotificationById } from "@/modules/notifications/repositories/notification.repository";
import { archive } from "@/modules/notifications/services/notification.service";
import { auditService } from "@/modules/audit-logs/services/audit.service";
import {
  archiveNotificationSchema,
  type ArchiveNotificationSchema,
} from "@/modules/notifications/schemas/notification.schema";
import type { Notification } from "@/modules/notifications/types";

export class ArchiveNotificationCommand extends BaseCommand<ArchiveNotificationSchema, Notification> {
  private notification: Notification | null = null;

  async validate(): Promise<void> {
    const result = archiveNotificationSchema.safeParse(this.input);
    if (!result.success) {
      const fieldErrors: Record<string, string[]> = {};
      for (const issue of result.error.issues) {
        const key = issue.path.join(".");
        (fieldErrors[key] ??= []).push(issue.message);
      }
      throw new ValidationError("Dados inválidos", fieldErrors);
    }

    this.notification = await findNotificationById(this.input.notificationId, this.context.organizationId);
    if (!this.notification) throw new NotFoundError("Notification", this.input.notificationId);
  }

  async authorize(): Promise<void> {
    const perms = await getUserPermissions(this.context.userId, this.context.organizationId);
    const ability = createAbility(perms);
    if (!ability.can(PERMISSIONS.NOTIFICATIONS_ARCHIVE_OWN)) throw new AuthorizationError();

    const isOwner = this.notification!.recipientUserId === this.context.userId;
    if (!isOwner && !ability.can(PERMISSIONS.NOTIFICATIONS_VIEW_ALL)) throw new AuthorizationError();
  }

  async execute(): Promise<Notification> {
    const archived = await archive(this.context.organizationId, this.input.notificationId);

    await auditService.log(this.context, {
      entity: "Notification",
      entityId: archived.id,
      action: "notification.archived",
      newValues: { recipientUserId: archived.recipientUserId, type: archived.type },
    });

    return archived;
  }
}
