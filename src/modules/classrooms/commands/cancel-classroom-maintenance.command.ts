import {
  BaseCommand,
  AuthorizationError,
  NotFoundError,
  BusinessRuleError,
} from "@/shared/lib/command";
import { getUserPermissions, createAbility } from "@/server/auth/rbac";
import { PERMISSIONS } from "@/server/auth/permissions";
import { auditService } from "@/modules/audit-logs/services/audit.service";
import {
  findMaintenanceById,
  updateClassroomMaintenance,
} from "@/modules/classrooms/repositories/classroom-maintenance.repository";
import type { CancelClassroomMaintenanceSchema } from "@/modules/classrooms/schemas/classroom-maintenance.schema";

export class CancelClassroomMaintenanceCommand extends BaseCommand<CancelClassroomMaintenanceSchema, void> {
  async validate(): Promise<void> {
    const maintenance = await findMaintenanceById(this.input.maintenanceId, this.context.organizationId);
    if (!maintenance) throw new NotFoundError("Manutenção", this.input.maintenanceId);
    if (maintenance.classroomId !== this.input.classroomId) throw new NotFoundError("Manutenção", this.input.maintenanceId);
    if (maintenance.status === "CANCELLED") throw new BusinessRuleError("A manutenção já está cancelada.");
    if (maintenance.status === "COMPLETED") throw new BusinessRuleError("Não é possível cancelar uma manutenção já concluída.");
  }

  async authorize(): Promise<void> {
    const perms = await getUserPermissions(this.context.userId, this.context.organizationId);
    if (!createAbility(perms).can(PERMISSIONS.CLASSROOM_MAINTENANCE_CANCEL)) {
      throw new AuthorizationError();
    }
  }

  async execute(): Promise<void> {
    await updateClassroomMaintenance(this.input.maintenanceId, this.context.organizationId, { status: "CANCELLED" });

    await auditService.log(this.context, {
      entity: "ClassroomMaintenance",
      entityId: this.input.maintenanceId,
      action: "classroom_maintenance.cancelled",
    });
  }
}
