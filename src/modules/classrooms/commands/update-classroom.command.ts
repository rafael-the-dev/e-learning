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
  findClassroomById,
  findClassroomByCode,
  updateClassroom,
} from "@/modules/classrooms/repositories/classroom.repository";
import {
  updateClassroomSchema,
  type UpdateClassroomSchema,
} from "@/modules/classrooms/schemas/classroom.schema";
import type { Classroom } from "@/modules/classrooms/types";

type Input = UpdateClassroomSchema & { classroomId: string };

export class UpdateClassroomCommand extends BaseCommand<Input, Classroom> {
  async validate(): Promise<void> {
    const { classroomId, ...rest } = this.input;

    const result = updateClassroomSchema.safeParse(rest);
    if (!result.success) {
      const fieldErrors: Record<string, string[]> = {};
      for (const issue of result.error.issues) {
        const key = issue.path.join(".");
        if (!fieldErrors[key]) fieldErrors[key] = [];
        fieldErrors[key].push(issue.message);
      }
      throw new ValidationError("Dados inválidos", fieldErrors);
    }

    const existing = await findClassroomById(classroomId, this.context.organizationId);
    if (!existing) throw new NotFoundError("Sala", classroomId);

    if (this.input.code) {
      const duplicate = await findClassroomByCode(
        this.context.organizationId,
        this.input.branchId ?? existing.branchId,
        this.input.code,
        classroomId
      );
      if (duplicate) {
        throw new ValidationError("Dados inválidos", {
          code: ["Já existe uma sala com este código nesta filial/organização"],
        });
      }
    }
  }

  async authorize(): Promise<void> {
    const perms = await getUserPermissions(this.context.userId, this.context.organizationId);
    if (!createAbility(perms).can(PERMISSIONS.CLASSROOMS_UPDATE)) {
      throw new AuthorizationError();
    }
  }

  async execute(): Promise<Classroom> {
    const { classroomId, ...data } = this.input;
    const classroom = await updateClassroom(classroomId, this.context.organizationId, data);

    await auditService.log(this.context, {
      entity: "Classroom",
      entityId: classroomId,
      action: "classroom.updated",
      newValues: data,
    });

    return classroom;
  }
}
