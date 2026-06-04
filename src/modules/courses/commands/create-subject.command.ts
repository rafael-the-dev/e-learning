import {
  BaseCommand,
  AuthorizationError,
  ValidationError,
} from "@/shared/lib/command";
import { getUserPermissions, createAbility } from "@/server/auth/rbac";
import { PERMISSIONS } from "@/server/auth/permissions";
import { auditService } from "@/modules/audit-logs/services/audit.service";
import {
  createSubject,
  existsSubjectCodeInOrganization,
} from "@/modules/courses/repositories/subject.repository";
import {
  createSubjectSchema,
  type CreateSubjectSchema,
} from "@/modules/courses/schemas/subject.schema";
import type { Subject } from "@/modules/courses/types";

export class CreateSubjectCommand extends BaseCommand<CreateSubjectSchema, Subject> {
  async validate(): Promise<void> {
    const result = createSubjectSchema.safeParse(this.input);
    if (!result.success) {
      const fieldErrors: Record<string, string[]> = {};
      for (const issue of result.error.issues) {
        const key = issue.path.join(".");
        if (!fieldErrors[key]) fieldErrors[key] = [];
        fieldErrors[key].push(issue.message);
      }
      throw new ValidationError("Dados inválidos", fieldErrors);
    }

    if (this.input.code) {
      const codeTaken = await existsSubjectCodeInOrganization(
        this.context.organizationId,
        this.input.code
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
    if (!createAbility(perms).can(PERMISSIONS.SUBJECTS_CREATE)) {
      throw new AuthorizationError();
    }
  }

  async execute(): Promise<Subject> {
    const subject = await createSubject({
      organizationId: this.context.organizationId,
      name: this.input.name,
      code: this.input.code || null,
      description: this.input.description || null,
    });

    await auditService.log(this.context, {
      entity: "Subject",
      entityId: subject.id,
      action: "subject.created",
      newValues: { name: subject.name, code: subject.code, organizationId: subject.organizationId },
    });

    return subject;
  }
}
