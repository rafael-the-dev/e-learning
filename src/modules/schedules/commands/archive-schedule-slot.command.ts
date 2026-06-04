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
  archiveScheduleSlot,
  countActiveClassGroupAssignments,
} from "@/modules/schedules/repositories/schedule-slot.repository";
import {
  archiveScheduleSlotSchema,
  type ArchiveScheduleSlotSchema,
} from "@/modules/schedules/schemas/schedule-slot.schema";
import type { ScheduleSlot } from "@/modules/schedules/types";

export class ArchiveScheduleSlotCommand extends BaseCommand<ArchiveScheduleSlotSchema, void> {
  private _existing: ScheduleSlot | null = null;

  async validate(): Promise<void> {
    const result = archiveScheduleSlotSchema.safeParse(this.input);
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

    if (existing.status === "ARCHIVED") {
      throw new BusinessRuleError("O slot já está arquivado");
    }
  }

  async authorize(): Promise<void> {
    const perms = await getUserPermissions(
      this.context.userId,
      this.context.organizationId
    );
    if (!createAbility(perms).can(PERMISSIONS.SCHEDULE_SLOTS_ARCHIVE)) {
      throw new AuthorizationError();
    }
  }

  async execute(): Promise<void> {
    await archiveScheduleSlot(this.input.scheduleSlotId, this.context.organizationId);

    await auditService.log(this.context, {
      entity: "ScheduleSlot",
      entityId: this.input.scheduleSlotId,
      action: "schedule_slot.archived",
      oldValues: { status: this._existing!.status },
      newValues: { status: "ARCHIVED" },
    });
  }
}
