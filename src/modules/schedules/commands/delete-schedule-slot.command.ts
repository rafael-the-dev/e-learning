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
  softDeleteScheduleSlot,
  countActiveClassGroupAssignments,
} from "@/modules/schedules/repositories/schedule-slot.repository";
import {
  deleteScheduleSlotSchema,
  type DeleteScheduleSlotSchema,
} from "@/modules/schedules/schemas/schedule-slot.schema";
import type { ScheduleSlot } from "@/modules/schedules/types";

export class SoftDeleteScheduleSlotCommand extends BaseCommand<DeleteScheduleSlotSchema, void> {
  private _existing: ScheduleSlot | null = null;

  async validate(): Promise<void> {
    const result = deleteScheduleSlotSchema.safeParse(this.input);
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

    const activeAssignments = await countActiveClassGroupAssignments(
      this.input.scheduleSlotId,
      this.context.organizationId
    );
    if (activeAssignments > 0) {
      throw new BusinessRuleError(
        "Não é possível eliminar um slot atribuído a turmas ativas. Remova as atribuições primeiro."
      );
    }
  }

  async authorize(): Promise<void> {
    const perms = await getUserPermissions(
      this.context.userId,
      this.context.organizationId
    );
    if (!createAbility(perms).can(PERMISSIONS.SCHEDULE_SLOTS_DELETE)) {
      throw new AuthorizationError();
    }
  }

  async execute(): Promise<void> {
    await softDeleteScheduleSlot(this.input.scheduleSlotId, this.context.organizationId);

    await auditService.log(this.context, {
      entity: "ScheduleSlot",
      entityId: this.input.scheduleSlotId,
      action: "schedule_slot.deleted",
      oldValues: {
        schedulePeriodId: this._existing!.schedulePeriodId,
        dayOfWeek: this._existing!.dayOfWeek,
        startTime: this._existing!.startTime,
        endTime: this._existing!.endTime,
      },
    });
  }
}
