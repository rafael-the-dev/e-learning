import {
  BaseCommand,
  AuthorizationError,
  ValidationError,
} from "@/shared/lib/command";
import { getUserPermissions, createAbility } from "@/server/auth/rbac";
import { PERMISSIONS } from "@/server/auth/permissions";
import { auditService } from "@/modules/audit-logs/services/audit.service";
import {
  createStudent,
  findStudentByIdNumber,
} from "@/modules/students/repositories/student.repository";
import { findBranchById } from "@/modules/organizations/repositories/branch.repository";
import {
  createStudentSchema,
  type CreateStudentSchema,
} from "@/modules/students/schemas/student.schema";
import type { Student } from "@/modules/students/types";

export class CreateStudentCommand extends BaseCommand<CreateStudentSchema, Student> {
  async validate(): Promise<void> {
    const result = createStudentSchema.safeParse(this.input);
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
        this.input.idNumber
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
    if (!createAbility(perms).can(PERMISSIONS.STUDENTS_CREATE)) {
      throw new AuthorizationError();
    }
  }

  async execute(): Promise<Student> {
    const dateOfBirth =
      this.input.dateOfBirth ? new Date(this.input.dateOfBirth) : null;

    const student = await createStudent({
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
      notes: this.input.notes || null,
      createdBy: this.context.userId,
    });

    await auditService.log(this.context, {
      entity: "Student",
      entityId: student.id,
      action: "CREATED",
      newValues: {
        firstName: student.firstName,
        lastName: student.lastName,
        email: student.email,
        status: student.status,
        organizationId: this.context.organizationId,
      },
    });

    return student;
  }
}
