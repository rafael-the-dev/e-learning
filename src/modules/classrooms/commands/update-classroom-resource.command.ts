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
  findResourceById,
  updateClassroomResource,
} from "@/modules/classrooms/repositories/classroom-resource.repository";
import {
  updateClassroomResourceSchema,
  type UpdateClassroomResourceSchema,
} from "@/modules/classrooms/schemas/classroom-resource.schema";
import type { ClassroomResource } from "@/modules/classrooms/types";

type Input = UpdateClassroomResourceSchema & { resourceId: string; classroomId: string };

export class UpdateClassroomResourceCommand extends BaseCommand<Input, ClassroomResource> {
  async validate(): Promise<void> {
    const { resourceId, classroomId, ...rest } = this.input;
    const result = updateClassroomResourceSchema.safeParse(rest);
    if (!result.success) {
      const fieldErrors: Record<string, string[]> = {};
      for (const issue of result.error.issues) {
        const key = issue.path.join(".");
        if (!fieldErrors[key]) fieldErrors[key] = [];
        fieldErrors[key].push(issue.message);
      }
      throw new ValidationError("Dados inválidos", fieldErrors);
    }

    const resource = await findResourceById(resourceId, this.context.organizationId);
    if (!resource) throw new NotFoundError("Recurso", resourceId);
    if (resource.classroomId !== classroomId) throw new NotFoundError("Recurso", resourceId);
  }

  async authorize(): Promise<void> {
    const perms = await getUserPermissions(this.context.userId, this.context.organizationId);
    if (!createAbility(perms).can(PERMISSIONS.CLASSROOM_RESOURCES_UPDATE)) {
      throw new AuthorizationError();
    }
  }

  async execute(): Promise<ClassroomResource> {
    const { resourceId, classroomId, ...data } = this.input;
    const resource = await updateClassroomResource(resourceId, this.context.organizationId, data);

    await auditService.log(this.context, {
      entity: "ClassroomResource",
      entityId: resourceId,
      action: "classroom_resource.updated",
      newValues: data,
    });

    return resource;
  }
}
