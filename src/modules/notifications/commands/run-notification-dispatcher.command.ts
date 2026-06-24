import { BaseCommand } from "@/shared/lib/command";
import { dispatchPendingDeliveries, type DispatchSummary } from "@/modules/notifications/services/notification-dispatcher.service";

/**
 * System-internal command: there is no end-user "dispatch now" action — this
 * runs from a future scheduled job (Phase 3.2; see docs/notifications-center.md),
 * scoped to a single organization via the usual ServiceContext. authorize()
 * is a no-op for the same reason CreateNotificationCommand's is: protection
 * belongs to whatever triggers the job (e.g. an internal-job-secret-gated
 * route), not to RBAC.
 */
export class RunNotificationDispatcherCommand extends BaseCommand<void, DispatchSummary> {
  async validate(): Promise<void> {
    // No input to validate — operates on the caller's organization context.
  }

  async authorize(): Promise<void> {
    // No permission gate — see class doc.
  }

  async execute(): Promise<DispatchSummary> {
    return dispatchPendingDeliveries(this.context.organizationId);
  }
}
