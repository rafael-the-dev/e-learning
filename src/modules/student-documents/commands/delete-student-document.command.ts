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
import { eventPublisher } from "@/server/events/event-publisher";
import { DomainEventType, DomainAggregateType } from "@/server/events/event-types";

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

    // F-H2: removing a document can drop documentCount to 0 (→ HIGH documents risk);
    // publish the canonical status-change fact (post-write).
    await eventPublisher.publish({
      organizationId: this.context.organizationId,
      eventType: DomainEventType.STUDENT_DOCUMENT_STATUS_CHANGED,
      aggregateType: DomainAggregateType.STUDENT_DOCUMENT,
      aggregateId: this.input.documentId,
      actorId: this.context.userId,
      payload: {
        studentId: this.input.studentId,
        documentId: this.input.documentId,
        previousStatus: null,
        currentStatus: null,
        changeType: "REMOVED",
        occurredAt: new Date().toISOString(),
      },
    });
  }
}
