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
  softDeleteSchedulePeriod,
  countActiveSlotsForPeriod,
} from "@/modules/schedules/repositories/schedule-period.repository";
import {
  deleteSchedulePeriodSchema,
  type DeleteSchedulePeriodSchema,
} from "@/modules/schedules/schemas/schedule-period.schema";
import type { SchedulePeriod } from "@/modules/schedules/types";

export class SoftDeleteSchedulePeriodCommand extends BaseCommand<
  DeleteSchedulePeriodSchema,
  void
> {
  private _existing: SchedulePeriod | null = null;

  async validate(): Promise<void> {
    const result = deleteSchedulePeriodSchema.safeParse(this.input);
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

    const activeSlots = await countActiveSlotsForPeriod(
      this.input.schedulePeriodId,
      this.context.organizationId
    );
    if (activeSlots > 0) {
      throw new BusinessRuleError(
        "Não é possível eliminar um período com slots ativos. Archive os slots primeiro."
      );
    }
  }

  async authorize(): Promise<void> {
    const perms = await getUserPermissions(
      this.context.userId,
      this.context.organizationId
    );
    if (!createAbility(perms).can(PERMISSIONS.SCHEDULE_PERIODS_DELETE)) {
      throw new AuthorizationError();
    }
  }

  async execute(): Promise<void> {
    await softDeleteSchedulePeriod(
      this.input.schedulePeriodId,
      this.context.organizationId
    );

    await auditService.log(this.context, {
      entity: "SchedulePeriod",
      entityId: this.input.schedulePeriodId,
      action: "schedule_period.deleted",
      oldValues: { name: this._existing!.name, code: this._existing!.code },
    });
  }
}
