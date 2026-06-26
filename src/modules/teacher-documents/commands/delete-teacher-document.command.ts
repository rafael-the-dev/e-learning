import {
  BaseCommand,
  AuthorizationError,
  NotFoundError,
} from "@/shared/lib/command";
import { getUserPermissions, createAbility } from "@/server/auth/rbac";
import { PERMISSIONS } from "@/server/auth/permissions";
import { auditService } from "@/modules/audit-logs/services/audit.service";
import {
  findDocumentByIdInOrganization,
  softDeleteTeacherDocument,
} from "@/modules/teacher-documents/repositories/teacher-document.repository";

export class DeleteTeacherDocumentCommand extends BaseCommand<
  { documentId: string; teacherId: string },
  void
> {
  async validate(): Promise<void> {
    const document = await findDocumentByIdInOrganization(
      this.input.documentId,
      this.context.organizationId
    );
    if (!document) throw new NotFoundError("Documento", this.input.documentId);
    if (document.teacherId !== this.input.teacherId) {
      throw new NotFoundError("Documento", this.input.documentId);
    }
  }

  async authorize(): Promise<void> {
    const perms = await getUserPermissions(this.context.userId, this.context.organizationId);
    if (!createAbility(perms).can(PERMISSIONS.TEACHER_DOCUMENTS_DELETE)) {
      throw new AuthorizationError();
    }
  }

  async execute(): Promise<void> {
    await softDeleteTeacherDocument(this.input.documentId, this.context.organizationId);

    await auditService.log(this.context, {
      entity: "TeacherDocument",
      entityId: this.input.documentId,
      action: "teacher_document.deleted",
      newValues: { teacherId: this.input.teacherId },
    });
  }
}
