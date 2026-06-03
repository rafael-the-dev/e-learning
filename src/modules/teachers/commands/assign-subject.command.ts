import {
  BaseCommand,
  AuthorizationError,
  NotFoundError,
  BusinessRuleError,
  ValidationError,
} from "@/shared/lib/command";
import { getUserPermissions, createAbility } from "@/server/auth/rbac";
import { PERMISSIONS } from "@/server/auth/permissions";
import { auditService } from "@/modules/audit-logs/services/audit.service";
import {
  findByIdInOrganization,
  findSubjectInOrganization,
  isSubjectAlreadyAssigned,
  assignSubject,
} from "@/modules/teachers/repositories/teacher.repository";
import type { AssignTeacherSubjectSchema } from "@/modules/teachers/schemas/teacher.schema";

export class AssignTeacherSubjectCommand extends BaseCommand<AssignTeacherSubjectSchema, void> {
  private _teacherName!: string;
  private _subjectName!: string;

  async validate(): Promise<void> {
    const teacher = await findByIdInOrganization(
      this.input.teacherId,
      this.context.organizationId
    );
    if (!teacher) throw new NotFoundError("Professor", this.input.teacherId);
    this._teacherName = teacher.fullName;

    if (teacher.status === "SUSPENDED" || teacher.status === "INACTIVE") {
      throw new BusinessRuleError("Não é possível atribuir disciplinas a um professor suspenso ou inativo");
    }

    const subject = await findSubjectInOrganization(
      this.input.subjectId,
      this.context.organizationId
    );
    if (!subject) {
      throw new ValidationError("Dados inválidos", {
        subjectId: ["Disciplina não encontrada nesta organização"],
      });
    }
    this._subjectName = subject.name;

    const alreadyAssigned = await isSubjectAlreadyAssigned(
      this.input.teacherId,
      this.input.subjectId
    );
    if (alreadyAssigned) {
      throw new BusinessRuleError("Esta disciplina já está atribuída a este professor");
    }
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
    await assignSubject(this.input.teacherId, this.input.subjectId);

    await auditService.log(this.context, {
      entity: "Teacher",
      entityId: this.input.teacherId,
      action: "teacher.subject_assigned",
      newValues: {
        teacherName: this._teacherName,
        subjectId: this.input.subjectId,
        subjectName: this._subjectName,
      },
    });
  }
}
