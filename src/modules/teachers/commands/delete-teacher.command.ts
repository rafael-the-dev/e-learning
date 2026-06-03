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
  softDeleteTeacher,
} from "@/modules/teachers/repositories/teacher.repository";
import type { SoftDeleteTeacherSchema } from "@/modules/teachers/schemas/teacher.schema";

export class SoftDeleteTeacherCommand extends BaseCommand<SoftDeleteTeacherSchema, void> {
  private _teacherName!: string;

  async validate(): Promise<void> {
    const teacher = await findByIdInOrganization(
      this.input.teacherId,
      this.context.organizationId
    );
    if (!teacher) throw new NotFoundError("Professor", this.input.teacherId);
    this._teacherName = `${teacher.firstName} ${teacher.lastName}`;
  }

  async authorize(): Promise<void> {
    const perms = await getUserPermissions(
      this.context.userId,
      this.context.organizationId
    );
    if (!createAbility(perms).can(PERMISSIONS.TEACHERS_DELETE)) {
      throw new AuthorizationError();
    }
  }

  async execute(): Promise<void> {
    await softDeleteTeacher(this.input.teacherId, this.context.organizationId, this.context.userId);

    await auditService.log(this.context, {
      entity: "Teacher",
      entityId: this.input.teacherId,
      action: "teacher.deleted",
      newValues: { name: this._teacherName, deletedAt: new Date().toISOString() },
    });
  }
}
