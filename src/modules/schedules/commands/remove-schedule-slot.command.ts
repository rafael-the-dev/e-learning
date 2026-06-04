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
  findClassGroupScheduleById,
  removeScheduleSlotFromClassGroup,
} from "@/modules/schedules/repositories/class-group-schedule.repository";
import {
  removeScheduleSlotFromClassGroupSchema,
  type RemoveScheduleSlotFromClassGroupSchema,
} from "@/modules/schedules/schemas/class-group-schedule.schema";
import type { ClassGroupScheduleWithSlot } from "@/modules/schedules/types";

export class RemoveScheduleSlotFromClassGroupCommand extends BaseCommand<
  RemoveScheduleSlotFromClassGroupSchema,
  { classGroupId: string }
> {
  private _existing: ClassGroupScheduleWithSlot | null = null;

  async validate(): Promise<void> {
    const result = removeScheduleSlotFromClassGroupSchema.safeParse(this.input);
    if (!result.success) {
      const fieldErrors: Record<string, string[]> = {};
      for (const issue of result.error.issues) {
        const key = issue.path.join(".");
        if (!fieldErrors[key]) fieldErrors[key] = [];
        fieldErrors[key].push(issue.message);
      }
      throw new ValidationError("Dados inválidos", fieldErrors);
    }

    const existing = await findClassGroupScheduleById(
      this.input.classGroupScheduleId,
      this.context.organizationId
    );
    if (!existing) throw new NotFoundError("Atribuição", this.input.classGroupScheduleId);
    this._existing = existing;
  }

  async authorize(): Promise<void> {
    const perms = await getUserPermissions(
      this.context.userId,
      this.context.organizationId
    );
    if (!createAbility(perms).can(PERMISSIONS.CLASS_GROUP_SCHEDULES_REMOVE)) {
      throw new AuthorizationError();
    }
  }

  async execute(): Promise<{ classGroupId: string }> {
    await removeScheduleSlotFromClassGroup(
      this.input.classGroupScheduleId,
      this.context.organizationId
    );

    await auditService.log(this.context, {
      entity: "ClassGroupSchedule",
      entityId: this.input.classGroupScheduleId,
      action: "class_group_schedule.removed",
      oldValues: {
        classGroupId: this._existing!.classGroupId,
        scheduleSlotId: this._existing!.scheduleSlotId,
      },
    });

    return { classGroupId: this._existing!.classGroupId };
  }
}
