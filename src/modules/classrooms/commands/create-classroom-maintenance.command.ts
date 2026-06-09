import {
  BaseCommand,
  AuthorizationError,
  ValidationError,
  NotFoundError,
} from "@/shared/lib/command";
import { getUserPermissions, createAbility } from "@/server/auth/rbac";
import { PERMISSIONS } from "@/server/auth/permissions";
import { auditService } from "@/modules/audit-logs/services/audit.service";
import { findClassroomById } from "@/modules/classrooms/repositories/classroom.repository";
import { createClassroomMaintenance } from "@/modules/classrooms/repositories/classroom-maintenance.repository";
import {
  createClassroomMaintenanceSchema,
  type CreateClassroomMaintenanceSchema,
} from "@/modules/classrooms/schemas/classroom-maintenance.schema";
import type { ClassroomMaintenance } from "@/modules/classrooms/types";

export class CreateClassroomMaintenanceCommand extends BaseCommand<CreateClassroomMaintenanceSchema, ClassroomMaintenance> {
  async validate(): Promise<void> {
    const result = createClassroomMaintenanceSchema.safeParse(this.input);
    if (!result.success) {
      const fieldErrors: Record<string, string[]> = {};
      for (const issue of result.error.issues) {
        const key = issue.path.join(".");
        if (!fieldErrors[key]) fieldErrors[key] = [];
        fieldErrors[key].push(issue.message);
      }
      throw new ValidationError("Dados inválidos", fieldErrors);
    }

    const classroom = await findClassroomById(this.input.classroomId, this.context.organizationId);
    if (!classroom) throw new NotFoundError("Sala", this.input.classroomId);

    const start = new Date(this.input.startDate);
    const end = new Date(this.input.endDate);
    if (start > end) {
      throw new ValidationError("Dados inválidos", {
        endDate: ["A data de fim deve ser posterior ou igual à data de início"],
      });
    }
  }

  async authorize(): Promise<void> {
    const perms = await getUserPermissions(this.context.userId, this.context.organizationId);
    if (!createAbility(perms).can(PERMISSIONS.CLASSROOM_MAINTENANCE_CREATE)) {
      throw new AuthorizationError();
    }
  }

  async execute(): Promise<ClassroomMaintenance> {
    const maintenance = await createClassroomMaintenance({
      organizationId: this.context.organizationId,
      classroomId: this.input.classroomId,
      title: this.input.title,
      description: this.input.description ?? null,
      startDate: new Date(this.input.startDate),
      endDate: new Date(this.input.endDate),
    });

    await auditService.log(this.context, {
      entity: "ClassroomMaintenance",
      entityId: maintenance.id,
      action: "classroom_maintenance.created",
      newValues: { classroomId: this.input.classroomId, title: maintenance.title },
    });

    return maintenance;
  }
}
