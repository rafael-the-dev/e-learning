import {
  BaseCommand,
  AuthorizationError,
  ValidationError,
  NotFoundError,
} from "@/shared/lib/command";
import { getUserPermissions, createAbility } from "@/server/auth/rbac";
import { PERMISSIONS } from "@/server/auth/permissions";
import { auditService } from "@/modules/audit-logs/services/audit.service";
import {
  findSchedulePeriodByIdInOrganization,
  findSchedulePeriodByCode,
  updateSchedulePeriod,
} from "@/modules/schedules/repositories/schedule-period.repository";
import {
  updateSchedulePeriodSchema,
  type UpdateSchedulePeriodSchema,
} from "@/modules/schedules/schemas/schedule-period.schema";
import type { SchedulePeriod } from "@/modules/schedules/types";

interface Input extends UpdateSchedulePeriodSchema {
  schedulePeriodId: string;
}

export class UpdateSchedulePeriodCommand extends BaseCommand<Input, SchedulePeriod> {
  private _existing: SchedulePeriod | null = null;

  async validate(): Promise<void> {
    const result = updateSchedulePeriodSchema.safeParse(this.input);
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

    if (this.input.code && this.input.code !== existing.code) {
      const duplicate = await findSchedulePeriodByCode(
        this.context.organizationId,
        this.input.code,
        this.input.schedulePeriodId
      );
      if (duplicate) {
        throw new ValidationError("Dados inválidos", {
          code: ["Já existe um período com este código nesta organização"],
        });
      }
    }
  }

  async authorize(): Promise<void> {
    const perms = await getUserPermissions(
      this.context.userId,
      this.context.organizationId
    );
    if (!createAbility(perms).can(PERMISSIONS.SCHEDULE_PERIODS_UPDATE)) {
      throw new AuthorizationError();
    }
  }

  async execute(): Promise<SchedulePeriod> {
    const updated = await updateSchedulePeriod(
      this.input.schedulePeriodId,
      this.context.organizationId,
      {
        name: this.input.name,
        code: this.input.code,
        description: this.input.description,
        status: this.input.status,
      }
    );

    await auditService.log(this.context, {
      entity: "SchedulePeriod",
      entityId: this.input.schedulePeriodId,
      action: "schedule_period.updated",
      oldValues: { name: this._existing!.name, code: this._existing!.code, status: this._existing!.status },
      newValues: { name: updated.name, code: updated.code, status: updated.status },
    });

    return updated;
  }
}
