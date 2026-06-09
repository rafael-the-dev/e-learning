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
  createClassroom,
  findClassroomByCode,
} from "@/modules/classrooms/repositories/classroom.repository";
import { findBranchById } from "@/modules/organizations/repositories/branch.repository";
import {
  createClassroomSchema,
  type CreateClassroomSchema,
} from "@/modules/classrooms/schemas/classroom.schema";
import type { Classroom } from "@/modules/classrooms/types";

export class CreateClassroomCommand extends BaseCommand<CreateClassroomSchema, Classroom> {
  async validate(): Promise<void> {
    const result = createClassroomSchema.safeParse(this.input);
    if (!result.success) {
      const fieldErrors: Record<string, string[]> = {};
      for (const issue of result.error.issues) {
        const key = issue.path.join(".");
        if (!fieldErrors[key]) fieldErrors[key] = [];
        fieldErrors[key].push(issue.message);
      }
      throw new ValidationError("Dados inválidos", fieldErrors);
    }

    if (this.input.branchId) {
      const branch = await findBranchById(this.context.organizationId, this.input.branchId);
      if (!branch) throw new NotFoundError("Filial", this.input.branchId);
    }

    const duplicate = await findClassroomByCode(
      this.context.organizationId,
      this.input.branchId ?? null,
      this.input.code
    );
    if (duplicate) {
      throw new ValidationError("Dados inválidos", {
        code: ["Já existe uma sala com este código nesta filial/organização"],
      });
    }
  }

  async authorize(): Promise<void> {
    const perms = await getUserPermissions(this.context.userId, this.context.organizationId);
    if (!createAbility(perms).can(PERMISSIONS.CLASSROOMS_CREATE)) {
      throw new AuthorizationError();
    }
  }

  async execute(): Promise<Classroom> {
    const classroom = await createClassroom({
      organizationId: this.context.organizationId,
      branchId: this.input.branchId ?? null,
      code: this.input.code,
      name: this.input.name,
      description: this.input.description ?? null,
      classroomType: this.input.classroomType ?? "STANDARD_ROOM",
      capacity: this.input.capacity,
      location: this.input.location ?? null,
      floor: this.input.floor ?? null,
      meetingProvider: this.input.meetingProvider ?? null,
      meetingUrl: this.input.meetingUrl ?? null,
      status: this.input.status ?? "ACTIVE",
    });

    await auditService.log(this.context, {
      entity: "Classroom",
      entityId: classroom.id,
      action: "classroom.created",
      newValues: { code: classroom.code, name: classroom.name, classroomType: classroom.classroomType },
    });

    return classroom;
  }
}
