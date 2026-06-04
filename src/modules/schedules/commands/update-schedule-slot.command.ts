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
  findScheduleSlotByIdInOrganization,
  updateScheduleSlot,
  findDuplicateSlot,
} from "@/modules/schedules/repositories/schedule-slot.repository";
import {
  updateScheduleSlotSchema,
  type UpdateScheduleSlotSchema,
} from "@/modules/schedules/schemas/schedule-slot.schema";
import type { ScheduleSlot } from "@/modules/schedules/types";

interface Input extends UpdateScheduleSlotSchema {
  scheduleSlotId: string;
}

export class UpdateScheduleSlotCommand extends BaseCommand<Input, ScheduleSlot> {
  private _existing: ScheduleSlot | null = null;

  async validate(): Promise<void> {
    const result = updateScheduleSlotSchema.safeParse(this.input);
    if (!result.success) {
      const fieldErrors: Record<string, string[]> = {};
      for (const issue of result.error.issues) {
        const key = issue.path.join(".");
        if (!fieldErrors[key]) fieldErrors[key] = [];
        fieldErrors[key].push(issue.message);
      }
      throw new ValidationError("Dados inválidos", fieldErrors);
    }

    const existing = await findScheduleSlotByIdInOrganization(
      this.input.scheduleSlotId,
      this.context.organizationId
    );
    if (!existing) throw new NotFoundError("Slot", this.input.scheduleSlotId);
    this._existing = existing;

    const dayOfWeek = this.input.dayOfWeek ?? existing.dayOfWeek;
    const startTime = this.input.startTime ?? existing.startTime;
    const endTime = this.input.endTime ?? existing.endTime;

    if (startTime >= endTime) {
      throw new ValidationError("Dados inválidos", {
        endTime: ["A hora de início deve ser anterior à hora de fim"],
      });
    }

    const duplicate = await findDuplicateSlot(
      existing.schedulePeriodId,
      dayOfWeek,
      startTime,
      endTime,
      this.input.scheduleSlotId
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
    if (!createAbility(perms).can(PERMISSIONS.SCHEDULE_SLOTS_UPDATE)) {
      throw new AuthorizationError();
    }
  }

  async execute(): Promise<ScheduleSlot> {
    const updated = await updateScheduleSlot(
      this.input.scheduleSlotId,
      this.context.organizationId,
      {
        dayOfWeek: this.input.dayOfWeek,
        startTime: this.input.startTime,
        endTime: this.input.endTime,
        status: this.input.status,
      }
    );

    await auditService.log(this.context, {
      entity: "ScheduleSlot",
      entityId: this.input.scheduleSlotId,
      action: "schedule_slot.updated",
      oldValues: {
        dayOfWeek: this._existing!.dayOfWeek,
        startTime: this._existing!.startTime,
        endTime: this._existing!.endTime,
        status: this._existing!.status,
      },
      newValues: {
        dayOfWeek: updated.dayOfWeek,
        startTime: updated.startTime,
        endTime: updated.endTime,
        status: updated.status,
      },
    });

    return updated;
  }
}
