import {
  BaseCommand,
  AuthorizationError,
  NotFoundError,
  BusinessRuleError,
} from "@/shared/lib/command";
import { getUserPermissions, createAbility } from "@/server/auth/rbac";
import { PERMISSIONS } from "@/server/auth/permissions";
import { auditService } from "@/modules/audit-logs/services/audit.service";
import {
  findByIdInOrganization,
  suspendStudent,
} from "@/modules/students/repositories/student.repository";
import type { SuspendStudentSchema } from "@/modules/students/schemas/student.schema";

export class SuspendStudentCommand extends BaseCommand<SuspendStudentSchema, void> {
  private _oldStatus!: string;

  async validate(): Promise<void> {
    const student = await findByIdInOrganization(
      this.input.studentId,
      this.context.organizationId
    );
    if (!student) throw new NotFoundError("Aluno", this.input.studentId);
    if (student.status === "SUSPENDED") {
      throw new BusinessRuleError("O aluno já se encontra suspenso");
    }
    this._oldStatus = student.status;
  }

  async authorize(): Promise<void> {
    const perms = await getUserPermissions(
      this.context.userId,
      this.context.organizationId
    );
    if (!createAbility(perms).can(PERMISSIONS.STUDENTS_SUSPEND)) {
      throw new AuthorizationError();
    }
  }

  async execute(): Promise<void> {
    const student = await suspendStudent(this.input.studentId, this.context.userId);

    await auditService.log(this.context, {
      entity: "Student",
      entityId: student.id,
      action: "SUSPENDED",
      oldValues: { status: this._oldStatus },
      newValues: {
        status: "SUSPENDED",
        ...(this.input.reason && { reason: this.input.reason }),
      },
    });
  }
}
