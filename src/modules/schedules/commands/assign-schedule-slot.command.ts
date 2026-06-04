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
  findScheduleSlotByIdInOrganization,
} from "@/modules/schedules/repositories/schedule-slot.repository";
import {
  assignScheduleSlotToClassGroup,
  existsClassGroupSchedule,
} from "@/modules/schedules/repositories/class-group-schedule.repository";
import {
  assignScheduleSlotToClassGroupSchema,
  type AssignScheduleSlotToClassGroupSchema,
} from "@/modules/schedules/schemas/class-group-schedule.schema";
import { findClassGroupById } from "@/modules/class-groups/repositories/class-group.repository";
import type { ClassGroupSchedule } from "@/modules/schedules/types";

export class AssignScheduleSlotToClassGroupCommand extends BaseCommand<
  AssignScheduleSlotToClassGroupSchema,
  ClassGroupSchedule
> {
  async validate(): Promise<void> {
    const result = assignScheduleSlotToClassGroupSchema.safeParse(this.input);
    if (!result.success) {
      const fieldErrors: Record<string, string[]> = {};
      for (const issue of result.error.issues) {
        const key = issue.path.join(".");
        if (!fieldErrors[key]) fieldErrors[key] = [];
        fieldErrors[key].push(issue.message);
      }
      throw new ValidationError("Dados inválidos", fieldErrors);
    }

    const classGroup = await findClassGroupById(
      this.input.classGroupId,
      this.context.organizationId
    );
    if (!classGroup) throw new NotFoundError("Turma", this.input.classGroupId);

    const slot = await findScheduleSlotByIdInOrganization(
      this.input.scheduleSlotId,
      this.context.organizationId
    );
    if (!slot) throw new NotFoundError("Slot", this.input.scheduleSlotId);

    const alreadyAssigned = await existsClassGroupSchedule(
      this.input.classGroupId,
      this.input.scheduleSlotId
    );
    if (alreadyAssigned) {
      throw new BusinessRuleError("Este slot já está atribuído a esta turma");
    }
  }

  async authorize(): Promise<void> {
    const perms = await getUserPermissions(
      this.context.userId,
      this.context.organizationId
    );
    if (!createAbility(perms).can(PERMISSIONS.CLASS_GROUP_SCHEDULES_ASSIGN)) {
      throw new AuthorizationError();
    }
  }

  async execute(): Promise<ClassGroupSchedule> {
    const assignment = await assignScheduleSlotToClassGroup({
      organizationId: this.context.organizationId,
      classGroupId: this.input.classGroupId,
      scheduleSlotId: this.input.scheduleSlotId,
    });

    await auditService.log(this.context, {
      entity: "ClassGroupSchedule",
      entityId: assignment.id,
      action: "class_group_schedule.assigned",
      newValues: {
        classGroupId: this.input.classGroupId,
        scheduleSlotId: this.input.scheduleSlotId,
      },
    });

    return assignment;
  }
}
