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
  findSubjectByIdInOrganization,
  archiveSubject,
} from "@/modules/courses/repositories/subject.repository";
import {
  archiveSubjectSchema,
  type ArchiveSubjectSchema,
} from "@/modules/courses/schemas/subject.schema";
import type { Subject } from "@/modules/courses/types";

export class ArchiveSubjectCommand extends BaseCommand<ArchiveSubjectSchema, void> {
  private _existing: Subject | null = null;

  async validate(): Promise<void> {
    const result = archiveSubjectSchema.safeParse(this.input);
    if (!result.success) {
      const fieldErrors: Record<string, string[]> = {};
      for (const issue of result.error.issues) {
        const key = issue.path.join(".");
        if (!fieldErrors[key]) fieldErrors[key] = [];
        fieldErrors[key].push(issue.message);
      }
      throw new ValidationError("Dados inválidos", fieldErrors);
    }

    this._existing = await findSubjectByIdInOrganization(
      this.input.subjectId,
      this.context.organizationId
    );
    if (!this._existing) throw new NotFoundError("Disciplina", this.input.subjectId);
    if (this._existing.status === "ARCHIVED") {
      throw new BusinessRuleError("A disciplina já está arquivada");
    }
  }

  async authorize(): Promise<void> {
    const perms = await getUserPermissions(
      this.context.userId,
      this.context.organizationId
    );
    if (!createAbility(perms).can(PERMISSIONS.SUBJECTS_ARCHIVE)) {
      throw new AuthorizationError();
    }
  }

  async execute(): Promise<void> {
    await archiveSubject(this.input.subjectId, this.context.organizationId);

    await auditService.log(this.context, {
      entity: "Subject",
      entityId: this.input.subjectId,
      action: "subject.archived",
      oldValues: { status: this._existing!.status },
      newValues: { status: "ARCHIVED" },
    });
  }
}
