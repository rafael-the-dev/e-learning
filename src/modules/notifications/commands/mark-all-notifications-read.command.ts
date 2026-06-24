import { BaseCommand, AuthorizationError } from "@/shared/lib/command";
import { getUserPermissions, createAbility } from "@/server/auth/rbac";
import { PERMISSIONS } from "@/server/auth/permissions";
import { markAllAsRead } from "@/modules/notifications/services/notification.service";

export class MarkAllNotificationsReadCommand extends BaseCommand<void, number> {
  async validate(): Promise<void> {
    // No input to validate — always operates on the caller's own notifications.
  }

  async authorize(): Promise<void> {
    const perms = await getUserPermissions(this.context.userId, this.context.organizationId);
    if (!createAbility(perms).can(PERMISSIONS.NOTIFICATIONS_MARK_READ)) {
      throw new AuthorizationError();
    }
  }

  async execute(): Promise<number> {
    return markAllAsRead(this.context.organizationId, this.context.userId);
  }
}
