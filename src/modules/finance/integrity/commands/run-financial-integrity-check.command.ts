import { BaseCommand, ValidationError, AuthorizationError } from "@/shared/lib/command";
import {
  runDailyFinancialIntegrityJob,
  type RunFinancialIntegrityJobOptions,
} from "@/server/jobs/daily-financial-integrity.job";
import { getUserPermissions, createAbility } from "@/server/auth/rbac";
import { PERMISSIONS } from "@/server/auth/permissions";
import type { FinancialIntegrityJobResult } from "../types";
import { IntegrityIssueCategory } from "@/shared/types/common";

export interface RunFinancialIntegrityCheckInput {
  /** Restrict to a single organization. When omitted all active orgs are checked. */
  organizationId?: string;
  /** Restrict to specific check categories. When omitted all 8 are run. */
  categories?: string[];
}

/**
 * Wraps the DailyFinancialIntegrityJob as a command so it can be:
 * - triggered from a cron route (API-key protected)
 * - invoked manually by SUPER_ADMIN / ORG_ADMIN via admin action
 * - tested with a mock context
 *
 * Authorization is enforced here. The HTTP layer must also verify the caller
 * is authenticated before reaching this command.
 */
export class RunFinancialIntegrityCheckCommand extends BaseCommand<
  RunFinancialIntegrityCheckInput,
  FinancialIntegrityJobResult
> {
  async validate(): Promise<void> {
    const { organizationId, categories } = this.input;

    if (organizationId !== undefined && typeof organizationId !== "string") {
      throw new ValidationError("organizationId deve ser uma string");
    }

    if (categories !== undefined) {
      if (!Array.isArray(categories)) {
        throw new ValidationError("categories deve ser um array");
      }
      const validCategories = new Set<string>(Object.values(IntegrityIssueCategory));
      const invalid = categories.filter((c) => !validCategories.has(c));
      if (invalid.length > 0) {
        throw new ValidationError(`Categorias inválidas: ${invalid.join(", ")}`);
      }
    }
  }

  async authorize(): Promise<void> {
    const perms = await getUserPermissions(this.context.userId, this.context.organizationId);
    if (!createAbility(perms).can(PERMISSIONS.INTEGRITY_CHECKS_RUN)) {
      throw new AuthorizationError();
    }
  }

  async execute(): Promise<FinancialIntegrityJobResult> {
    const options: RunFinancialIntegrityJobOptions = {
      organizationId: this.input.organizationId,
      categories: this.input.categories as IntegrityIssueCategory[] | undefined,
    };
    return runDailyFinancialIntegrityJob(options);
  }
}
