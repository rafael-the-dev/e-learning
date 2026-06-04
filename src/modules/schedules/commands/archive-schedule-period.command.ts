import {
  BaseCommand,
  AuthorizationError,
  ValidationError,
  NotFoundError,
  BusinessRuleError,
} from "@/shared/lib/command";
import { getUserPermissions, createAbility } from "@/server/auth/rbac";
import { PERMISSIONS } from "@/server/auth/permissions";
import { auditService } from "@/modules/audit-logs/services/audit.service";
import {
  findSchedulePeriodByIdInOrganization,
  archiveSchedulePeriod,
} from "@/modules/schedules/repositories/schedule-period.repository";
import {
  archiveSchedulePeriodSchema,
  type ArchiveSchedulePeriodSchema,
} from "@/modules/schedules/schemas/schedule-period.schema";
import type { SchedulePeriod } from "@/modules/schedules/types";

export class ArchiveSchedulePeriodCommand extends BaseCommand<
  ArchiveSchedulePeriodSchema,
  void
> {
  private _existing: SchedulePeriod | null = null;

  async validate(): Promise<void> {
    const result = archiveSchedulePeriodSchema.safeParse(this.input);
    if (!result.success) {
      const fieldErrors: Record<string, string[]> = {};
      for (const issue of result.error.issues) {
        const key = issue.path.join(".");
        if (!fieldErrors[key]) fieldErrors[key] = [];
        fieldErrors[key].push(issue.message);
      }
      throw new ValidationError("Dados inválidos", fieldErrors);
    }

    const existing = await findSchedulePeriodByIdInOrganization(
      this.input.schedulePeriodId,
      this.context.organizationId
    );
    if (!existing) throw new NotFoundError("Período", this.input.schedulePeriodId);
    this._existing = existing;

    if (existing.status === "ARCHIVED") {
      throw new BusinessRuleError("O período já está arquivado");
    }
  }

  async authorize(): Promise<void> {
    const perms = await getUserPermissions(
      this.context.userId,
      this.context.organizationId
    );
    if (!createAbility(perms).can(PERMISSIONS.SCHEDULE_PERIODS_ARCHIVE)) {
      throw new AuthorizationError();
    }
  }

  async execute(): Promise<void> {
    await archiveSchedulePeriod(
      this.input.schedulePeriodId,
      this.context.organizationId
    );

    await auditService.log(this.context, {
      entity: "SchedulePeriod",
      entityId: this.input.schedulePeriodId,
      action: "schedule_period.archived",
      oldValues: { status: this._existing!.status },
      newValues: { status: "ARCHIVED" },
    });
  }
}
