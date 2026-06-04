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
  findSubjectByIdInOrganization,
  softDeleteSubject,
  countTeacherAssignmentsForSubject,
  countLevelAssignmentsForSubject,
} from "@/modules/courses/repositories/subject.repository";
import type { SoftDeleteSubjectSchema } from "@/modules/courses/schemas/subject.schema";

export class SoftDeleteSubjectCommand extends BaseCommand<SoftDeleteSubjectSchema, void> {
  async validate(): Promise<void> {
    const subject = await findSubjectByIdInOrganization(
      this.input.subjectId,
      this.context.organizationId
    );
    if (!subject) throw new NotFoundError("Disciplina", this.input.subjectId);

    const teacherCount = await countTeacherAssignmentsForSubject(this.input.subjectId);
    if (teacherCount > 0) {
      throw new BusinessRuleError(
        "Não é possível eliminar uma disciplina atribuída a professores. Remova as atribuições primeiro."
      );
    }

    const levelCount = await countLevelAssignmentsForSubject(this.input.subjectId);
    if (levelCount > 0) {
      throw new BusinessRuleError(
        "Não é possível eliminar uma disciplina associada a níveis. Remova as associações primeiro."
      );
    }
  }

  async authorize(): Promise<void> {
    const perms = await getUserPermissions(
      this.context.userId,
      this.context.organizationId
    );
    if (!createAbility(perms).can(PERMISSIONS.SUBJECTS_DELETE)) {
      throw new AuthorizationError();
    }
  }

  async execute(): Promise<void> {
    await softDeleteSubject(this.input.subjectId, this.context.organizationId);

    await auditService.log(this.context, {
      entity: "Subject",
      entityId: this.input.subjectId,
      action: "subject.deleted",
      newValues: { deleted: true },
    });
  }
}
