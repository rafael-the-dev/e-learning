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
  archiveSubject,
} from "@/modules/courses/repositories/subject.repository";
import type { ArchiveSubjectSchema } from "@/modules/courses/schemas/subject.schema";

export class ArchiveSubjectCommand extends BaseCommand<
  ArchiveSubjectSchema,
  void
> {
  async validate(): Promise<void> {
    const subject = await findSubjectByIdInOrganization(
      this.input.subjectId,
      this.context.organizationId
    );
    if (!subject) throw new NotFoundError("Disciplina", this.input.subjectId);
    if (subject.status === "ARCHIVED") {
      throw new BusinessRuleError("A disciplina já está arquivada");
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
    await archiveSubject(this.input.subjectId);

    await auditService.log(this.context, {
      entity: "Subject",
      entityId: this.input.subjectId,
      action: "subject.archived",
      newValues: { status: "ARCHIVED" },
    });
  }
}
