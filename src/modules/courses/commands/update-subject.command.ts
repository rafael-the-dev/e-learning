import {
  BaseCommand,
  AuthorizationError,
  NotFoundError,
  ValidationError,
} from "@/shared/lib/command";
import { getUserPermissions, createAbility } from "@/server/auth/rbac";
import { PERMISSIONS } from "@/server/auth/permissions";
import { auditService } from "@/modules/audit-logs/services/audit.service";
import {
  findSubjectByIdInOrganization,
  updateSubject,
  existsSubjectCodeInOrganization,
} from "@/modules/courses/repositories/subject.repository";
import {
  updateSubjectSchema,
  type UpdateSubjectSchema,
} from "@/modules/courses/schemas/subject.schema";
import type { Subject } from "@/modules/courses/types";

interface UpdateSubjectInput extends UpdateSubjectSchema {
  subjectId: string;
}

export class UpdateSubjectCommand extends BaseCommand<UpdateSubjectInput, Subject> {
  private _existing: Subject | null = null;

  async validate(): Promise<void> {
    const result = updateSubjectSchema.safeParse(this.input);
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

    if (this.input.code) {
      const codeTaken = await existsSubjectCodeInOrganization(
        this.context.organizationId,
        this.input.code,
        this.input.subjectId
      );
      if (codeTaken) {
        throw new ValidationError("Dados inválidos", {
          code: ["Este código já está em uso nesta organização"],
        });
      }
    }
  }

  async authorize(): Promise<void> {
    const perms = await getUserPermissions(
      this.context.userId,
      this.context.organizationId
    );
    if (!createAbility(perms).can(PERMISSIONS.SUBJECTS_UPDATE)) {
      throw new AuthorizationError();
    }
  }

  async execute(): Promise<Subject> {
    const subject = await updateSubject(this.input.subjectId, this.context.organizationId, {
      name: this.input.name,
      code: this.input.code !== undefined ? (this.input.code || null) : undefined,
      description: this.input.description !== undefined ? (this.input.description || null) : undefined,
      status: this.input.status,
    });

    await auditService.log(this.context, {
      entity: "Subject",
      entityId: subject.id,
      action: "subject.updated",
      oldValues: this._existing
        ? { name: this._existing.name, status: this._existing.status }
        : null,
      newValues: { name: subject.name, status: subject.status },
    });

    return subject;
  }
}
