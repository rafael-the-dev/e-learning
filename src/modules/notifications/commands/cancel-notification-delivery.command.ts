import { BaseCommand, ValidationError, AuthorizationError, NotFoundError } from "@/shared/lib/command";
import { getUserPermissions, createAbility } from "@/server/auth/rbac";
import { PERMISSIONS } from "@/server/auth/permissions";
import { findDeliveryById } from "@/modules/notifications/repositories/notification-delivery.repository";
import { cancelDelivery } from "@/modules/notifications/services/notification-delivery.service";
import { auditService } from "@/modules/audit-logs/services/audit.service";
import {
  cancelNotificationDeliverySchema,
  type CancelNotificationDeliverySchema,
} from "@/modules/notifications/schemas/notification-delivery.schema";
import type { NotificationDelivery } from "@/modules/notifications/types";

export class CancelNotificationDeliveryCommand extends BaseCommand<
  CancelNotificationDeliverySchema,
  NotificationDelivery
> {
  private delivery: NotificationDelivery | null = null;

  async validate(): Promise<void> {
    const result = cancelNotificationDeliverySchema.safeParse(this.input);
    if (!result.success) {
      const fieldErrors: Record<string, string[]> = {};
      for (const issue of result.error.issues) {
        const key = issue.path.join(".");
        (fieldErrors[key] ??= []).push(issue.message);
      }
      throw new ValidationError("Dados inválidos", fieldErrors);
    }

    this.delivery = await findDeliveryById(this.input.deliveryId, this.context.organizationId);
    if (!this.delivery) throw new NotFoundError("NotificationDelivery", this.input.deliveryId);
  }

  async authorize(): Promise<void> {
    const perms = await getUserPermissions(this.context.userId, this.context.organizationId);
    if (!createAbility(perms).can(PERMISSIONS.NOTIFICATIONS_CANCEL_DELIVERY)) {
      throw new AuthorizationError();
    }
  }

  async execute(): Promise<NotificationDelivery> {
    const cancelled = await cancelDelivery(this.input.deliveryId, this.context.organizationId);

    await auditService.log(this.context, {
      entity: "NotificationDelivery",
      entityId: cancelled.id,
      action: "notification_delivery.cancelled",
      oldValues: { status: this.delivery!.status },
      newValues: { status: cancelled.status },
    });

    return cancelled;
  }
}
