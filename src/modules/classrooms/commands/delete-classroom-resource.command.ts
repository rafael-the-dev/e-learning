import {
  BaseCommand,
  AuthorizationError,
  NotFoundError,
} from "@/shared/lib/command";
import { getUserPermissions, createAbility } from "@/server/auth/rbac";
import { PERMISSIONS } from "@/server/auth/permissions";
import { auditService } from "@/modules/audit-logs/services/audit.service";
import {
  findResourceById,
  softDeleteClassroomResource,
} from "@/modules/classrooms/repositories/classroom-resource.repository";
import type { DeleteClassroomResourceSchema } from "@/modules/classrooms/schemas/classroom-resource.schema";

export class DeleteClassroomResourceCommand extends BaseCommand<DeleteClassroomResourceSchema, void> {
  async validate(): Promise<void> {
    const resource = await findResourceById(this.input.resourceId, this.context.organizationId);
    if (!resource) throw new NotFoundError("Recurso", this.input.resourceId);
    if (resource.classroomId !== this.input.classroomId) throw new NotFoundError("Recurso", this.input.resourceId);
  }

  async authorize(): Promise<void> {
    const perms = await getUserPermissions(this.context.userId, this.context.organizationId);
    if (!createAbility(perms).can(PERMISSIONS.CLASSROOM_RESOURCES_DELETE)) {
      throw new AuthorizationError();
    }
  }

  async execute(): Promise<void> {
    await softDeleteClassroomResource(this.input.resourceId, this.context.organizationId);

    await auditService.log(this.context, {
      entity: "ClassroomResource",
      entityId: this.input.resourceId,
      action: "classroom_resource.deleted",
    });
  }
}
