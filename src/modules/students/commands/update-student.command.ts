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
  updateStudent,
  findStudentByIdNumber,
} from "@/modules/students/repositories/student.repository";
import { findBranchById } from "@/modules/organizations/repositories/branch.repository";
import {
  updateStudentSchema,
  type UpdateStudentSchema,
} from "@/modules/students/schemas/student.schema";
import type { Student } from "@/modules/students/types";

interface UpdateStudentInput extends UpdateStudentSchema {
  studentId: string;
}

export class UpdateStudentCommand extends BaseCommand<UpdateStudentInput, Student> {
  private _existing!: Student;

  async validate(): Promise<void> {
    const existing = await findByIdInOrganization(
      this.input.studentId,
      this.context.organizationId
    );
    if (!existing) throw new NotFoundError("Aluno", this.input.studentId);
    this._existing = existing;

    const result = updateStudentSchema.safeParse(this.input);
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
      const duplicate = await findStudentByIdNumber(
        this.context.organizationId,
        this.input.idNumber,
        this.input.studentId
      );
      if (duplicate) {
        throw new ValidationError("Dados inválidos", {
          idNumber: ["Já existe um aluno com este número de documento nesta organização"],
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
    if (!createAbility(perms).can(PERMISSIONS.STUDENTS_UPDATE)) {
      throw new AuthorizationError();
    }
  }

  async execute(): Promise<Student> {
    const old = this._existing;
    const dateOfBirth =
      this.input.dateOfBirth ? new Date(this.input.dateOfBirth) : null;

    const student = await updateStudent(this.input.studentId, {
      firstName: this.input.firstName,
      lastName: this.input.lastName,
      email: this.input.email || null,
      phone: this.input.phone || null,
      dateOfBirth,
      gender: this.input.gender || null,
      address: this.input.address || null,
      idType: this.input.idType || null,
      idNumber: this.input.idNumber || null,
      branchId: this.input.branchId || null,
      notes: this.input.notes || null,
      status: this.input.status,
      updatedBy: this.context.userId,
    });

    await auditService.log(this.context, {
      entity: "Student",
      entityId: student.id,
      action: "UPDATED",
      oldValues: {
        firstName: old.firstName,
        lastName: old.lastName,
        email: old.email,
        phone: old.phone,
        status: old.status,
        branchId: old.branch?.id ?? null,
      },
      newValues: {
        firstName: student.firstName,
        lastName: student.lastName,
        email: student.email,
        phone: student.phone,
        status: student.status,
        branchId: student.branch?.id ?? null,
      },
    });

    return student;
  }
}
