import {
  BaseCommand,
  AuthorizationError,
  ValidationError,
  NotFoundError,
} from "@/shared/lib/command";
import { getUserPermissions, createAbility } from "@/server/auth/rbac";
import { PERMISSIONS } from "@/server/auth/permissions";
import { auditService } from "@/modules/audit-logs/services/audit.service";
import { findClassGroupById } from "@/modules/class-groups/repositories/class-group.repository";
import { createSchedule } from "@/modules/class-groups/repositories/class-schedule.repository";
import {
  createClassScheduleSchema,
  type CreateClassScheduleSchema,
} from "@/modules/class-groups/schemas/class-schedule.schema";
import type { ClassSchedule } from "@/modules/class-groups/types";

interface CreateClassScheduleInput extends CreateClassScheduleSchema {
  classGroupId: string;
}

export class CreateClassScheduleCommand extends BaseCommand<CreateClassScheduleInput, ClassSchedule> {
  async validate(): Promise<void> {
    const result = createClassScheduleSchema.safeParse(this.input);
    if (!result.success) {
      const fieldErrors: Record<string, string[]> = {};
      for (const issue of result.error.issues) {
        const key = issue.path.join(".");
        if (!fieldErrors[key]) fieldErrors[key] = [];
        fieldErrors[key].push(issue.message);
      }
      throw new ValidationError("Dados inválidos", fieldErrors);
    }

    const group = await findClassGroupById(
      this.input.classGroupId,
      this.context.organizationId
    );
    if (!group) throw new NotFoundError("Turma", this.input.classGroupId);
  }

  async authorize(): Promise<void> {
    const perms = await getUserPermissions(
      this.context.userId,
      this.context.organizationId
    );
    if (!createAbility(perms).can(PERMISSIONS.CLASS_SCHEDULES_CREATE)) {
      throw new AuthorizationError();
    }
  }

  async execute(): Promise<ClassSchedule> {
    const schedule = await createSchedule({
      classGroupId: this.input.classGroupId,
      dayOfWeek: this.input.dayOfWeek,
      startTime: this.input.startTime,
      endTime: this.input.endTime,
      room: this.input.room ?? null,
    });

    await auditService.log(this.context, {
      entity: "ClassSchedule",
      entityId: schedule.id,
      action: "class_schedule.created",
      newValues: {
        classGroupId: schedule.classGroupId,
        dayOfWeek: schedule.dayOfWeek,
        startTime: schedule.startTime,
        endTime: schedule.endTime,
        room: schedule.room,
      },
    });

    return schedule;
  }
}
