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
  findScheduleById,
  updateSchedule,
} from "@/modules/class-groups/repositories/class-schedule.repository";
import {
  updateClassScheduleSchema,
  type UpdateClassScheduleSchema,
} from "@/modules/class-groups/schemas/class-schedule.schema";
import type { ClassSchedule } from "@/modules/class-groups/types";

interface UpdateClassScheduleInput extends UpdateClassScheduleSchema {
  classGroupId: string;
  scheduleId: string;
}

export class UpdateClassScheduleCommand extends BaseCommand<UpdateClassScheduleInput, ClassSchedule> {
  private _existing: ClassSchedule | null = null;

  async validate(): Promise<void> {
    const result = updateClassScheduleSchema.safeParse(this.input);
    if (!result.success) {
      const fieldErrors: Record<string, string[]> = {};
      for (const issue of result.error.issues) {
        const key = issue.path.join(".");
        if (!fieldErrors[key]) fieldErrors[key] = [];
        fieldErrors[key].push(issue.message);
      }
      throw new ValidationError("Dados inválidos", fieldErrors);
    }

    const existing = await findScheduleById(
      this.input.scheduleId,
      this.input.classGroupId,
      this.context.organizationId
    );
    if (!existing) throw new NotFoundError("Horário", this.input.scheduleId);
    this._existing = existing;

    const startTime = this.input.startTime ?? existing.startTime;
    const endTime = this.input.endTime ?? existing.endTime;
    if (startTime >= endTime) {
      throw new ValidationError("Dados inválidos", {
        endTime: ["A hora de início deve ser anterior à hora de fim"],
      });
    }
  }

  async authorize(): Promise<void> {
    const perms = await getUserPermissions(
      this.context.userId,
      this.context.organizationId
    );
    if (!createAbility(perms).can(PERMISSIONS.CLASS_SCHEDULES_UPDATE)) {
      throw new AuthorizationError();
    }
  }

  async execute(): Promise<ClassSchedule> {
    const schedule = await updateSchedule(
      this.input.scheduleId,
      this.input.classGroupId,
      {
        dayOfWeek: this.input.dayOfWeek,
        startTime: this.input.startTime,
        endTime: this.input.endTime,
        room: this.input.room,
      }
    );

    await auditService.log(this.context, {
      entity: "ClassSchedule",
      entityId: schedule.id,
      action: "class_schedule.updated",
      oldValues: {
        dayOfWeek: this._existing!.dayOfWeek,
        startTime: this._existing!.startTime,
        endTime: this._existing!.endTime,
        room: this._existing!.room,
      },
      newValues: {
        dayOfWeek: schedule.dayOfWeek,
        startTime: schedule.startTime,
        endTime: schedule.endTime,
        room: schedule.room,
      },
    });

    return schedule;
  }
}
