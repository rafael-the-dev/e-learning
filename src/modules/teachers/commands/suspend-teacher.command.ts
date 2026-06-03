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
  suspendTeacher,
} from "@/modules/teachers/repositories/teacher.repository";
import type { SuspendTeacherSchema } from "@/modules/teachers/schemas/teacher.schema";

export class SuspendTeacherCommand extends BaseCommand<SuspendTeacherSchema, void> {
  private _oldStatus!: string;

  async validate(): Promise<void> {
    const teacher = await findByIdInOrganization(
      this.input.teacherId,
      this.context.organizationId
    );
    if (!teacher) throw new NotFoundError("Professor", this.input.teacherId);
    if (teacher.status === "SUSPENDED") {
      throw new BusinessRuleError("O professor já se encontra suspenso");
    }
    this._oldStatus = teacher.status;
  }

  async authorize(): Promise<void> {
    const perms = await getUserPermissions(
      this.context.userId,
      this.context.organizationId
    );
    if (!createAbility(perms).can(PERMISSIONS.TEACHERS_SUSPEND)) {
      throw new AuthorizationError();
    }
  }

  async execute(): Promise<void> {
    const teacher = await suspendTeacher(this.input.teacherId, this.context.organizationId, this.context.userId);

    await auditService.log(this.context, {
      entity: "Teacher",
      entityId: teacher.id,
      action: "teacher.suspended",
      oldValues: { status: this._oldStatus },
      newValues: {
        status: "SUSPENDED",
        ...(this.input.reason && { reason: this.input.reason }),
      },
    });
  }
}
