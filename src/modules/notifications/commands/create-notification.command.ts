import { BaseCommand, ValidationError, NotFoundError } from "@/shared/lib/command";
import { getDb } from "@/server/db";
import { createNotification } from "@/modules/notifications/services/notification.service";
import {
  createNotificationSchema,
  type CreateNotificationSchema,
} from "@/modules/notifications/schemas/notification.schema";
import type { Notification } from "@/modules/notifications/types";

/**
 * System-internal command: notification creation in Phase 1 is only
 * triggered by domain event handlers and this command, never by an
 * end-user action — there is no dedicated "create notification" permission.
 * authorize() is a no-op; the real protection is tenant + recipient
 * membership validation below.
 */
export class CreateNotificationCommand extends BaseCommand<
  CreateNotificationSchema,
  Notification | null
> {
  async validate(): Promise<void> {
    const result = createNotificationSchema.safeParse(this.input);
    if (!result.success) {
      const fieldErrors: Record<string, string[]> = {};
      for (const issue of result.error.issues) {
        const key = issue.path.join(".");
        (fieldErrors[key] ??= []).push(issue.message);
      }
      throw new ValidationError("Dados inválidos", fieldErrors);
    }

    const db = await getDb();
    const membership = await db.userOrganization.findUnique({
      where: {
        userId_organizationId: {
          userId: this.input.recipientUserId,
          organizationId: this.context.organizationId,
        },
      },
      select: { userId: true },
    });
    if (!membership) throw new NotFoundError("User", this.input.recipientUserId);
  }

  async authorize(): Promise<void> {
    // No permission gate — see class doc.
  }

  async execute(): Promise<Notification | null> {
    return createNotification(this.context.organizationId, this.input);
  }
}
