import {
  BaseCommand,
  AuthorizationError,
  ValidationError,
} from "@/shared/lib/command";
import { getUserPermissions, createAbility } from "@/server/auth/rbac";
import { PERMISSIONS } from "@/server/auth/permissions";
import { auditService } from "@/modules/audit-logs/services/audit.service";
import {
  createTeacher,
  findTeacherByIdNumber,
  findTeacherByLicenseNumber,
} from "@/modules/teachers/repositories/teacher.repository";
import { findBranchById } from "@/modules/organizations/repositories/branch.repository";
import {
  createTeacherSchema,
  type CreateTeacherSchema,
} from "@/modules/teachers/schemas/teacher.schema";
import type { Teacher } from "@/modules/teachers/types";

export class CreateTeacherCommand extends BaseCommand<CreateTeacherSchema, Teacher> {
  async validate(): Promise<void> {
    const result = createTeacherSchema.safeParse(this.input);
    if (!result.success) {
      const fieldErrors: Record<string, string[]> = {};
      for (const issue of result.error.issues) {
        const key = issue.path.join(".");
        if (!fieldErrors[key]) fieldErrors[key] = [];
        fieldErrors[key].push(issue.message);
      }
      throw new ValidationError("Dados inválidos", fieldErrors);
    }

    if (this.input.idNumber) {
      const duplicate = await findTeacherByIdNumber(
        this.context.organizationId,
        this.input.idNumber
      );
      if (duplicate) {
        throw new ValidationError("Dados inválidos", {
          idNumber: ["Já existe um professor com este número de documento nesta organização"],
        });
      }
    }

    if (this.input.licenseNumber) {
      const duplicate = await findTeacherByLicenseNumber(
        this.context.organizationId,
        this.input.licenseNumber
      );
      if (duplicate) {
        throw new ValidationError("Dados inválidos", {
          licenseNumber: ["Já existe um professor com este número de licença nesta organização"],
        });
      }
    }

    if (this.input.branchId) {
      const branch = await findBranchById(this.context.organizationId, this.input.branchId);
      if (!branch) {
        throw new ValidationError("Dados inválidos", {
          branchId: ["Filial não encontrada nesta organização"],
        });
      }
    }
  }

  async authorize(): Promise<void> {
    const perms = await getUserPermissions(
      this.context.userId,
      this.context.organizationId
    );
    if (!createAbility(perms).can(PERMISSIONS.TEACHERS_CREATE)) {
      throw new AuthorizationError();
    }
  }

  async execute(): Promise<Teacher> {
    const dateOfBirth =
      this.input.dateOfBirth ? new Date(this.input.dateOfBirth) : null;

    const teacher = await createTeacher({
      organizationId: this.context.organizationId,
      branchId: this.input.branchId || null,
      firstName: this.input.firstName,
      lastName: this.input.lastName,
      email: this.input.email || null,
      phone: this.input.phone || null,
      dateOfBirth,
      gender: this.input.gender || null,
      address: this.input.address || null,
      idType: this.input.idType || null,
      idNumber: this.input.idNumber || null,
      licenseNumber: this.input.licenseNumber || null,
      specialization: this.input.specialization || null,
      notes: this.input.notes || null,
      createdBy: this.context.userId,
    });

    await auditService.log(this.context, {
      entity: "Teacher",
      entityId: teacher.id,
      action: "teacher.created",
      newValues: {
        firstName: teacher.firstName,
        lastName: teacher.lastName,
        email: teacher.email,
        status: teacher.status,
        organizationId: this.context.organizationId,
      },
    });

    return teacher;
  }
}
