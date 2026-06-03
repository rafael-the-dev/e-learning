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
  findByIdInOrganization,
  updateTeacher,
  findTeacherByIdNumber,
  findTeacherByLicenseNumber,
} from "@/modules/teachers/repositories/teacher.repository";
import { findBranchById } from "@/modules/organizations/repositories/branch.repository";
import {
  updateTeacherSchema,
  type UpdateTeacherSchema,
} from "@/modules/teachers/schemas/teacher.schema";
import type { Teacher } from "@/modules/teachers/types";

interface UpdateTeacherInput extends UpdateTeacherSchema {
  teacherId: string;
}

export class UpdateTeacherCommand extends BaseCommand<UpdateTeacherInput, Teacher> {
  private _existing!: Teacher;

  async validate(): Promise<void> {
    const existing = await findByIdInOrganization(
      this.input.teacherId,
      this.context.organizationId
    );
    if (!existing) throw new NotFoundError("Professor", this.input.teacherId);
    this._existing = existing;

    const result = updateTeacherSchema.safeParse(this.input);
    if (!result.success) {
      const fieldErrors: Record<string, string[]> = {};
      for (const issue of result.error.issues) {
        const key = issue.path.join(".");
        if (!fieldErrors[key]) fieldErrors[key] = [];
        fieldErrors[key].push(issue.message);
      }
      throw new ValidationError("Dados inválidos", fieldErrors);
    }

    if (
      this.input.status === "SUSPENDED" &&
      this._existing.status !== "SUSPENDED"
    ) {
      throw new ValidationError("Dados inválidos", {
        status: ["Para suspender o professor, utilize a acção de suspensão."],
      });
    }

    if (this.input.idNumber) {
      const duplicate = await findTeacherByIdNumber(
        this.context.organizationId,
        this.input.idNumber,
        this.input.teacherId
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
        this.input.licenseNumber,
        this.input.teacherId
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
    if (!createAbility(perms).can(PERMISSIONS.TEACHERS_UPDATE)) {
      throw new AuthorizationError();
    }
  }

  async execute(): Promise<Teacher> {
    const old = this._existing;
    const dateOfBirth =
      this.input.dateOfBirth ? new Date(this.input.dateOfBirth) : null;

    const teacher = await updateTeacher(this.input.teacherId, this.context.organizationId, {
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
      branchId: this.input.branchId || null,
      notes: this.input.notes || null,
      status: this.input.status,
      updatedBy: this.context.userId,
    });

    await auditService.log(this.context, {
      entity: "Teacher",
      entityId: teacher.id,
      action: "teacher.updated",
      oldValues: {
        firstName: old.firstName,
        lastName: old.lastName,
        email: old.email,
        phone: old.phone,
        status: old.status,
        branchId: old.branch?.id ?? null,
        licenseNumber: old.licenseNumber,
        specialization: old.specialization,
      },
      newValues: {
        firstName: teacher.firstName,
        lastName: teacher.lastName,
        email: teacher.email,
        phone: teacher.phone,
        status: teacher.status,
        branchId: teacher.branch?.id ?? null,
        licenseNumber: teacher.licenseNumber,
        specialization: teacher.specialization,
      },
    });

    return teacher;
  }
}
