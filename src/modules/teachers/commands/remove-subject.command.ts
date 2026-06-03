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
  findSubjectInOrganization,
  isSubjectAlreadyAssigned,
  removeSubject,
} from "@/modules/teachers/repositories/teacher.repository";
import type { RemoveTeacherSubjectSchema } from "@/modules/teachers/schemas/teacher.schema";

export class RemoveTeacherSubjectCommand extends BaseCommand<RemoveTeacherSubjectSchema, void> {
  private _teacherName!: string;
  private _subjectName!: string;

  async validate(): Promise<void> {
    const teacher = await findByIdInOrganization(
      this.input.teacherId,
      this.context.organizationId
    );
    if (!teacher) throw new NotFoundError("Professor", this.input.teacherId);
    this._teacherName = teacher.fullName;

    const assigned = await isSubjectAlreadyAssigned(
      this.input.teacherId,
      this.input.subjectId
    );
    if (!assigned) {
      throw new BusinessRuleError("Esta disciplina não está atribuída a este professor");
    }

    const subject = await findSubjectInOrganization(
      this.input.subjectId,
      this.context.organizationId
    );
    this._subjectName = subject?.name ?? this.input.subjectId;
  }

  async authorize(): Promise<void> {
    const perms = await getUserPermissions(
      this.context.userId,
      this.context.organizationId
    );
    if (!createAbility(perms).can(PERMISSIONS.TEACHERS_ASSIGN_SUBJECT)) {
      throw new AuthorizationError();
    }
  }

  async execute(): Promise<void> {
    await removeSubject(this.input.teacherId, this.input.subjectId);

    await auditService.log(this.context, {
      entity: "Teacher",
      entityId: this.input.teacherId,
      action: "teacher.subject_removed",
      newValues: {
        teacherName: this._teacherName,
        subjectId: this.input.subjectId,
        subjectName: this._subjectName,
      },
    });
  }
}
