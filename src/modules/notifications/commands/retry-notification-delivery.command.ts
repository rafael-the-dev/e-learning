import { BaseCommand, ValidationError, AuthorizationError, NotFoundError } from "@/shared/lib/command";
import { getUserPermissions, createAbility } from "@/server/auth/rbac";
import { PERMISSIONS } from "@/server/auth/permissions";
import { findDeliveryById } from "@/modules/notifications/repositories/notification-delivery.repository";
import { retryDelivery } from "@/modules/notifications/services/notification-delivery.service";
import { auditService } from "@/modules/audit-logs/services/audit.service";
import {
  retryNotificationDeliverySchema,
  type RetryNotificationDeliverySchema,
} from "@/modules/notifications/schemas/notification-delivery.schema";
import type { NotificationDelivery } from "@/modules/notifications/types";

export class RetryNotificationDeliveryCommand extends BaseCommand<
  RetryNotificationDeliverySchema,
  NotificationDelivery
> {
  private delivery: NotificationDelivery | null = null;

  async validate(): Promise<void> {
    const result = retryNotificationDeliverySchema.safeParse(this.input);
    if (!result.success) {
      const fieldErrors: Record<string, string[]> = {};
      for (const issue of result.error.issues) {
        const key = issue.path.join(".");
        (fieldErrors[key] ??= []).push(issue.message);
      }
      throw new ValidationError("Dados inválidos", fieldErrors);
    }

    // Scoping the lookup by organizationId enforces tenant isolation: a
    // cross-tenant id simply resolves to null, same as "not found".
    this.delivery = await findDeliveryById(this.input.deliveryId, this.context.organizationId);
    if (!this.delivery) throw new NotFoundError("NotificationDelivery", this.input.deliveryId);
  }

  async authorize(): Promise<void> {
    const perms = await getUserPermissions(this.context.userId, this.context.organizationId);
    if (!createAbility(perms).can(PERMISSIONS.NOTIFICATIONS_RETRY_DELIVERY)) {
      throw new AuthorizationError();
    }
  }

  async execute(): Promise<NotificationDelivery> {
    const retried = await retryDelivery(this.input.deliveryId, this.context.organizationId);

    await auditService.log(this.context, {
      entity: "NotificationDelivery",
      entityId: retried.id,
      action: "notification_delivery.retried",
      oldValues: { status: this.delivery!.status, attempts: this.delivery!.attempts },
      newValues: { status: retried.status, attempts: retried.attempts },
    });

    return retried;
  }
}
