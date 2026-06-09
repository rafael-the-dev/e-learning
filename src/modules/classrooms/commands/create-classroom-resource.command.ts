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
import { createClassroomResource } from "@/modules/classrooms/repositories/classroom-resource.repository";
import {
  createClassroomResourceSchema,
  type CreateClassroomResourceSchema,
} from "@/modules/classrooms/schemas/classroom-resource.schema";
import type { ClassroomResource } from "@/modules/classrooms/types";

export class CreateClassroomResourceCommand extends BaseCommand<CreateClassroomResourceSchema, ClassroomResource> {
  async validate(): Promise<void> {
    const result = createClassroomResourceSchema.safeParse(this.input);
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
  }

  async authorize(): Promise<void> {
    const perms = await getUserPermissions(this.context.userId, this.context.organizationId);
    if (!createAbility(perms).can(PERMISSIONS.CLASSROOM_RESOURCES_CREATE)) {
      throw new AuthorizationError();
    }
  }

  async execute(): Promise<ClassroomResource> {
    const resource = await createClassroomResource({
      organizationId: this.context.organizationId,
      classroomId: this.input.classroomId,
      name: this.input.name,
      quantity: this.input.quantity,
      description: this.input.description ?? null,
    });

    await auditService.log(this.context, {
      entity: "ClassroomResource",
      entityId: resource.id,
      action: "classroom_resource.created",
      newValues: { classroomId: this.input.classroomId, name: resource.name },
    });

    return resource;
  }
}
