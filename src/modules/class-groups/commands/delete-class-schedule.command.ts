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
  deleteSchedule,
} from "@/modules/class-groups/repositories/class-schedule.repository";
import {
  deleteClassScheduleSchema,
  type DeleteClassScheduleSchema,
} from "@/modules/class-groups/schemas/class-schedule.schema";
import type { ClassSchedule } from "@/modules/class-groups/types";

interface DeleteClassScheduleInput extends DeleteClassScheduleSchema {
  classGroupId: string;
}

export class DeleteClassScheduleCommand extends BaseCommand<DeleteClassScheduleInput, void> {
  private _existing: ClassSchedule | null = null;

  async validate(): Promise<void> {
    const result = deleteClassScheduleSchema.safeParse(this.input);
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
  }

  async authorize(): Promise<void> {
    const perms = await getUserPermissions(
      this.context.userId,
      this.context.organizationId
    );
    if (!createAbility(perms).can(PERMISSIONS.CLASS_SCHEDULES_DELETE)) {
      throw new AuthorizationError();
    }
  }

  async execute(): Promise<void> {
    await deleteSchedule(this.input.scheduleId, this.input.classGroupId);

    await auditService.log(this.context, {
      entity: "ClassSchedule",
      entityId: this.input.scheduleId,
      action: "class_schedule.deleted",
      oldValues: {
        classGroupId: this._existing!.classGroupId,
        dayOfWeek: this._existing!.dayOfWeek,
        startTime: this._existing!.startTime,
        endTime: this._existing!.endTime,
      },
      newValues: { deleted: true },
    });
  }
}
