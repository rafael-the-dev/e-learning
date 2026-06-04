import {
  BaseCommand,
  AuthorizationError,
  ValidationError,
  NotFoundError,
} from "@/shared/lib/command";
import { getUserPermissions, createAbility } from "@/server/auth/rbac";
import { PERMISSIONS } from "@/server/auth/permissions";
import { auditService } from "@/modules/audit-logs/services/audit.service";
import { findSchedulePeriodByIdInOrganization } from "@/modules/schedules/repositories/schedule-period.repository";
import {
  createScheduleSlot,
  findDuplicateSlot,
} from "@/modules/schedules/repositories/schedule-slot.repository";
import {
  createScheduleSlotSchema,
  type CreateScheduleSlotSchema,
} from "@/modules/schedules/schemas/schedule-slot.schema";
import type { ScheduleSlot } from "@/modules/schedules/types";

export class CreateScheduleSlotCommand extends BaseCommand<
  CreateScheduleSlotSchema,
  ScheduleSlot
> {
  async validate(): Promise<void> {
    const result = createScheduleSlotSchema.safeParse(this.input);
    if (!result.success) {
      const fieldErrors: Record<string, string[]> = {};
      for (const issue of result.error.issues) {
        const key = issue.path.join(".");
        if (!fieldErrors[key]) fieldErrors[key] = [];
        fieldErrors[key].push(issue.message);
      }
      throw new ValidationError("Dados inválidos", fieldErrors);
    }

    const period = await findSchedulePeriodByIdInOrganization(
      this.input.schedulePeriodId,
      this.context.organizationId
    );
    if (!period) throw new NotFoundError("Período", this.input.schedulePeriodId);

    const duplicate = await findDuplicateSlot(
      this.input.schedulePeriodId,
      this.input.dayOfWeek,
      this.input.startTime,
      this.input.endTime
    );
    if (duplicate) {
      throw new ValidationError("Dados inválidos", {
        dayOfWeek: ["Já existe um slot com este dia e horário neste período"],
      });
    }
  }

  async authorize(): Promise<void> {
    const perms = await getUserPermissions(
      this.context.userId,
      this.context.organizationId
    );
    if (!createAbility(perms).can(PERMISSIONS.SCHEDULE_SLOTS_CREATE)) {
      throw new AuthorizationError();
    }
  }

  async execute(): Promise<ScheduleSlot> {
    const slot = await createScheduleSlot({
      organizationId: this.context.organizationId,
      schedulePeriodId: this.input.schedulePeriodId,
      dayOfWeek: this.input.dayOfWeek,
      startTime: this.input.startTime,
      endTime: this.input.endTime,
      status: this.input.status ?? "ACTIVE",
    });

    await auditService.log(this.context, {
      entity: "ScheduleSlot",
      entityId: slot.id,
      action: "schedule_slot.created",
      newValues: {
        schedulePeriodId: slot.schedulePeriodId,
        dayOfWeek: slot.dayOfWeek,
        startTime: slot.startTime,
        endTime: slot.endTime,
        status: slot.status,
      },
    });

    return slot;
  }
}
