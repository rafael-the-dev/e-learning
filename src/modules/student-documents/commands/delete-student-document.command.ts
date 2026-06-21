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
  softDeleteStudentDocument,
} from "@/modules/student-documents/repositories/student-document.repository";

export class DeleteStudentDocumentCommand extends BaseCommand<
  { documentId: string; studentId: string },
  void
> {
  async validate(): Promise<void> {
    const document = await findDocumentByIdInOrganization(
      this.input.documentId,
      this.context.organizationId
    );
    if (!document) throw new NotFoundError("Documento", this.input.documentId);
    if (document.studentId !== this.input.studentId) {
      throw new NotFoundError("Documento", this.input.documentId);
    }
  }

  async authorize(): Promise<void> {
    const perms = await getUserPermissions(this.context.userId, this.context.organizationId);
    if (!createAbility(perms).can(PERMISSIONS.STUDENT_DOCUMENTS_DELETE)) {
      throw new AuthorizationError();
    }
  }

  async execute(): Promise<void> {
    await softDeleteStudentDocument(this.input.documentId, this.context.organizationId);

    await auditService.log(this.context, {
      entity: "StudentDocument",
      entityId: this.input.documentId,
      action: "student_document.deleted",
      newValues: { studentId: this.input.studentId },
    });
  }
}
