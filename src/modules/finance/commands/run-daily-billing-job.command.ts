import { BaseCommand, ValidationError } from "@/shared/lib/command";
import {
  runDailyBillingJob,
  type DailyBillingJobResult,
} from "@/server/jobs/daily-billing.job";

export interface RunDailyBillingJobInput {
  /** Optional — restrict processing to a single organization (dev / manual trigger). */
  organizationId?: string;
}

/**
 * Wraps DailyBillingJob as a command so it can be:
 *   - triggered from a cron route (protected by API key / SUPER_ADMIN session)
 *   - called manually in development via admin action
 *   - invoked in tests with a mock context
 *
 * Authorization is enforced at the HTTP layer. The command itself trusts the
 * caller — it should never be exposed to untrusted clients.
 */
export class RunDailyBillingJobCommand extends BaseCommand<
  RunDailyBillingJobInput,
  DailyBillingJobResult
> {
  async validate(): Promise<void> {
    const { organizationId } = this.input;
    if (organizationId !== undefined && typeof organizationId !== "string") {
      throw new ValidationError("organizationId deve ser uma string");
    }
  }

  async authorize(): Promise<void> {
    // Authorization is delegated to the HTTP layer (API key or SUPER_ADMIN
    // session check on the calling route). No per-user RBAC check here.
  }

  async execute(): Promise<DailyBillingJobResult> {
    return runDailyBillingJob({ organizationId: this.input.organizationId });
  }
}
