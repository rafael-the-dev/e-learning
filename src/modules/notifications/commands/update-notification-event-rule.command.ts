import { BaseCommand, ValidationError, AuthorizationError, NotFoundError } from "@/shared/lib/command";
import { getUserPermissions, createAbility } from "@/server/auth/rbac";
import { PERMISSIONS } from "@/server/auth/permissions";
import { auditService } from "@/modules/audit-logs/services/audit.service";
import { findRuleById } from "@/modules/notifications/repositories/notification-event-rule.repository";
import { updateRule } from "@/modules/notifications/services/notification-event-rule.service";
import {
  updateNotificationEventRuleSchema,
  type UpdateNotificationEventRuleSchema,
} from "@/modules/notifications/schemas/notification-event-rule.schema";
import type { NotificationEventRule } from "@/modules/notifications/types";

export class UpdateNotificationEventRuleCommand extends BaseCommand<
  UpdateNotificationEventRuleSchema,
  NotificationEventRule
> {
  private before: NotificationEventRule | null = null;

  async validate(): Promise<void> {
    const result = updateNotificationEventRuleSchema.safeParse(this.input);
    if (!result.success) {
      const fieldErrors: Record<string, string[]> = {};
      for (const issue of result.error.issues) {
        const key = issue.path.join(".");
        (fieldErrors[key] ??= []).push(issue.message);
      }
      throw new ValidationError("Dados inválidos", fieldErrors);
    }

    this.before = await findRuleById(this.input.ruleId, this.context.organizationId);
    if (!this.before) throw new NotFoundError("NotificationEventRule", this.input.ruleId);
  }

  async authorize(): Promise<void> {
    const perms = await getUserPermissions(this.context.userId, this.context.organizationId);
    if (!createAbility(perms).can(PERMISSIONS.NOTIFICATIONS_MANAGE_RULES)) {
      throw new AuthorizationError();
    }
  }

  async execute(): Promise<NotificationEventRule> {
    const { ruleId, ...changes } = this.input;
    const updated = await updateRule(this.context.organizationId, ruleId, changes);

    // "enabled" toggling gets its own audit action per spec; everything
    // else (channels/dedupe/delay/priority) is a generic "updated" entry —
    // mutually exclusive so a single save never produces duplicate entries.
    const action =
      changes.enabled !== undefined && changes.enabled !== this.before!.enabled
        ? changes.enabled
          ? "notification_rule.enabled"
          : "notification_rule.disabled"
        : "notification_rule.updated";

    await auditService.log(this.context, {
      entity: "NotificationEventRule",
      entityId: updated.id,
      action,
      oldValues: {
        eventType: this.before!.eventType,
        enabled: this.before!.enabled,
        channels: this.before!.channels,
        dedupeWindowMinutes: this.before!.dedupeWindowMinutes,
        delayMinutes: this.before!.delayMinutes,
        priority: this.before!.priority,
      },
      newValues: { eventType: updated.eventType, ...changes },
    });

    return updated;
  }
}
