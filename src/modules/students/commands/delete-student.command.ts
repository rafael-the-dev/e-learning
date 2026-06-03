import {
  BaseCommand,
  AuthorizationError,
  NotFoundError,
} from "@/shared/lib/command";
import { getUserPermissions, createAbility } from "@/server/auth/rbac";
import { PERMISSIONS } from "@/server/auth/permissions";
import { auditService } from "@/modules/audit-logs/services/audit.service";
import {
  findByIdInOrganization,
  softDeleteStudent,
} from "@/modules/students/repositories/student.repository";
import type { DeleteStudentSchema } from "@/modules/students/schemas/student.schema";

export class SoftDeleteStudentCommand extends BaseCommand<DeleteStudentSchema, void> {
  private _studentName!: string;

  async validate(): Promise<void> {
    const student = await findByIdInOrganization(
      this.input.studentId,
      this.context.organizationId
    );
    if (!student) throw new NotFoundError("Aluno", this.input.studentId);
    this._studentName = `${student.firstName} ${student.lastName}`;
  }

  async authorize(): Promise<void> {
    const perms = await getUserPermissions(
      this.context.userId,
      this.context.organizationId
    );
    if (!createAbility(perms).can(PERMISSIONS.STUDENTS_DELETE)) {
      throw new AuthorizationError();
    }
  }

  async execute(): Promise<void> {
    await softDeleteStudent(this.input.studentId);

    await auditService.log(this.context, {
      entity: "Student",
      entityId: this.input.studentId,
      action: "DELETED",
      newValues: { name: this._studentName, deletedAt: new Date().toISOString() },
    });
  }
}
