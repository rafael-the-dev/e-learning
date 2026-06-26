import {
  BaseCommand,
  AuthorizationError,
  ValidationError,
  NotFoundError,
} from "@/shared/lib/command";
import { getUserPermissions, createAbility } from "@/server/auth/rbac";
import { PERMISSIONS } from "@/server/auth/permissions";
import { auditService } from "@/modules/audit-logs/services/audit.service";
import { findByIdInOrganization as findTeacherByIdInOrganization } from "@/modules/teachers/repositories/teacher.repository";
import { createTeacherDocument } from "@/modules/teacher-documents/repositories/teacher-document.repository";
import {
  createTeacherDocumentSchema,
  type CreateTeacherDocumentSchema,
} from "@/modules/teacher-documents/schemas/teacher-document.schema";
import type { TeacherDocument } from "@/modules/teacher-documents/types";

export class CreateTeacherDocumentCommand extends BaseCommand<
  CreateTeacherDocumentSchema,
  TeacherDocument
> {
  async validate(): Promise<void> {
    const result = createTeacherDocumentSchema.safeParse(this.input);
    if (!result.success) {
      const fieldErrors: Record<string, string[]> = {};
      for (const issue of result.error.issues) {
        const key = issue.path.join(".");
        if (!fieldErrors[key]) fieldErrors[key] = [];
        fieldErrors[key].push(issue.message);
      }
      throw new ValidationError("Dados inválidos", fieldErrors);
    }

    const teacher = await findTeacherByIdInOrganization(
      this.input.teacherId,
      this.context.organizationId
    );
    if (!teacher) throw new NotFoundError("Professor", this.input.teacherId);
  }

  async authorize(): Promise<void> {
    const perms = await getUserPermissions(this.context.userId, this.context.organizationId);
    if (!createAbility(perms).can(PERMISSIONS.TEACHER_DOCUMENTS_UPLOAD)) {
      throw new AuthorizationError();
    }
  }

  async execute(): Promise<TeacherDocument> {
    const document = await createTeacherDocument({
      organizationId: this.context.organizationId,
      teacherId: this.input.teacherId,
      type: this.input.type ?? "OTHER",
      name: this.input.name,
      url: this.input.url,
      mimeType: this.input.mimeType ?? null,
      size: this.input.size ?? null,
      uploadedById: this.context.userId,
    });

    await auditService.log(this.context, {
      entity: "TeacherDocument",
      entityId: document.id,
      action: "teacher_document.uploaded",
      newValues: { teacherId: document.teacherId, name: document.name },
    });

    return document;
  }
}
