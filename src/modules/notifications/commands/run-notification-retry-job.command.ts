import { BaseCommand } from "@/shared/lib/command";
import { auditService } from "@/modules/audit-logs/services/audit.service";
import { runRetryJob, type RetryJobSummary } from "@/modules/notifications/services/notification-delivery.service";

/**
 * System-internal command: no end-user "retry now" action — this exists for
 * a future scheduled job to call, same rationale as
 * RunNotificationDispatcherCommand. authorize() is a no-op for the same
 * reason; protection belongs to whatever triggers the job, not RBAC.
 *
 * Moves eligible FAILED deliveries back to PENDING — it never sends
 * anything itself; the dispatcher picks the now-PENDING rows up on its next
 * run (see docs/notifications-center.md).
 */
export class RunNotificationRetryJobCommand extends BaseCommand<void, RetryJobSummary> {
  async validate(): Promise<void> {
    // No input to validate — operates on the caller's organization context.
  }

  async authorize(): Promise<void> {
    // No permission gate — see class doc.
  }

  async execute(): Promise<RetryJobSummary> {
    const summary = await runRetryJob(this.context.organizationId);

    if (summary.retried > 0) {
      await auditService.log(this.context, {
        entity: "NotificationDelivery",
        entityId: this.context.organizationId,
        action: "notification_delivery.retried",
        newValues: { scanned: summary.scanned, retried: summary.retried, skipped: summary.skipped },
      });
    }

    return summary;
  }
}
