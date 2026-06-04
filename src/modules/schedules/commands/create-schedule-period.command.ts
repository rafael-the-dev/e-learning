import {
  BaseCommand,
  AuthorizationError,
  ValidationError,
} from "@/shared/lib/command";
import { getUserPermissions, createAbility } from "@/server/auth/rbac";
import { PERMISSIONS } from "@/server/auth/permissions";
import { auditService } from "@/modules/audit-logs/services/audit.service";
import {
  createSchedulePeriod,
  findSchedulePeriodByCode,
} from "@/modules/schedules/repositories/schedule-period.repository";
import {
  createSchedulePeriodSchema,
  type CreateSchedulePeriodSchema,
} from "@/modules/schedules/schemas/schedule-period.schema";
import type { SchedulePeriod } from "@/modules/schedules/types";

export class CreateSchedulePeriodCommand extends BaseCommand<
  CreateSchedulePeriodSchema,
  SchedulePeriod
> {
  async validate(): Promise<void> {
    const result = createSchedulePeriodSchema.safeParse(this.input);
    if (!result.success) {
      const fieldErrors: Record<string, string[]> = {};
      for (const issue of result.error.issues) {
        const key = issue.path.join(".");
        if (!fieldErrors[key]) fieldErrors[key] = [];
        fieldErrors[key].push(issue.message);
      }
      throw new ValidationError("Dados inválidos", fieldErrors);
    }

    const duplicate = await findSchedulePeriodByCode(
      this.context.organizationId,
      this.input.code
    );
    if (duplicate) {
      throw new ValidationError("Dados inválidos", {
        code: ["Já existe um período com este código nesta organização"],
      });
    }
  }

  async authorize(): Promise<void> {
    const perms = await getUserPermissions(
      this.context.userId,
      this.context.organizationId
    );
    if (!createAbility(perms).can(PERMISSIONS.SCHEDULE_PERIODS_CREATE)) {
      throw new AuthorizationError();
    }
  }

  async execute(): Promise<SchedulePeriod> {
    const period = await createSchedulePeriod({
      organizationId: this.context.organizationId,
      name: this.input.name,
      code: this.input.code,
      description: this.input.description ?? null,
      status: this.input.status ?? "ACTIVE",
    });

    await auditService.log(this.context, {
      entity: "SchedulePeriod",
      entityId: period.id,
      action: "schedule_period.created",
      newValues: { name: period.name, code: period.code, status: period.status },
    });

    return period;
  }
}
