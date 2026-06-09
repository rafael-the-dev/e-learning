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
  findMaintenanceById,
  updateClassroomMaintenance,
} from "@/modules/classrooms/repositories/classroom-maintenance.repository";
import {
  updateClassroomMaintenanceSchema,
  type UpdateClassroomMaintenanceSchema,
} from "@/modules/classrooms/schemas/classroom-maintenance.schema";
import type { ClassroomMaintenance } from "@/modules/classrooms/types";

type Input = UpdateClassroomMaintenanceSchema & { maintenanceId: string; classroomId: string };

export class UpdateClassroomMaintenanceCommand extends BaseCommand<Input, ClassroomMaintenance> {
  async validate(): Promise<void> {
    const { maintenanceId, classroomId, ...rest } = this.input;
    const result = updateClassroomMaintenanceSchema.safeParse(rest);
    if (!result.success) {
      const fieldErrors: Record<string, string[]> = {};
      for (const issue of result.error.issues) {
        const key = issue.path.join(".");
        if (!fieldErrors[key]) fieldErrors[key] = [];
        fieldErrors[key].push(issue.message);
      }
      throw new ValidationError("Dados inválidos", fieldErrors);
    }

    const maintenance = await findMaintenanceById(maintenanceId, this.context.organizationId);
    if (!maintenance) throw new NotFoundError("Manutenção", maintenanceId);
    if (maintenance.classroomId !== classroomId) throw new NotFoundError("Manutenção", maintenanceId);

    const start = this.input.startDate ? new Date(this.input.startDate) : maintenance.startDate;
    const end = this.input.endDate ? new Date(this.input.endDate) : maintenance.endDate;
    if (start > end) {
      throw new ValidationError("Dados inválidos", {
        endDate: ["A data de fim deve ser posterior ou igual à data de início"],
      });
    }
  }

  async authorize(): Promise<void> {
    const perms = await getUserPermissions(this.context.userId, this.context.organizationId);
    if (!createAbility(perms).can(PERMISSIONS.CLASSROOM_MAINTENANCE_UPDATE)) {
      throw new AuthorizationError();
    }
  }

  async execute(): Promise<ClassroomMaintenance> {
    const { maintenanceId, classroomId, ...data } = this.input;
    const maintenance = await updateClassroomMaintenance(
      maintenanceId,
      this.context.organizationId,
      {
        ...data,
        startDate: data.startDate ? new Date(data.startDate) : undefined,
        endDate: data.endDate ? new Date(data.endDate) : undefined,
      }
    );

    await auditService.log(this.context, {
      entity: "ClassroomMaintenance",
      entityId: maintenanceId,
      action: "classroom_maintenance.updated",
      newValues: data,
    });

    return maintenance;
  }
}
