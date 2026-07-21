import {
  BaseCommand,
  AuthorizationError,
  ValidationError,
  NotFoundError,
} from "@/shared/lib/command";
import { getUserPermissions, createAbility } from "@/server/auth/rbac";
import { PERMISSIONS } from "@/server/auth/permissions";
import { auditService } from "@/modules/audit-logs/services/audit.service";
import {
  findDocumentByIdInOrganization,
  verifyStudentDocument,
} from "@/modules/student-documents/repositories/student-document.repository";
import {
  verifyStudentDocumentSchema,
  type VerifyStudentDocumentSchema,
} from "@/modules/student-documents/schemas/student-document.schema";
import type { StudentDocument } from "@/modules/student-documents/types";
import { eventPublisher } from "@/server/events/event-publisher";
import { DomainEventType, DomainAggregateType } from "@/server/events/event-types";

export class VerifyStudentDocumentCommand extends BaseCommand<
  VerifyStudentDocumentSchema,
  StudentDocument
> {
  async validate(): Promise<void> {
    const result = verifyStudentDocumentSchema.safeParse(this.input);
    if (!result.success) {
      const fieldErrors: Record<string, string[]> = {};
      for (const issue of result.error.issues) {
        const key = issue.path.join(".");
        if (!fieldErrors[key]) fieldErrors[key] = [];
        fieldErrors[key].push(issue.message);
      }
      throw new ValidationError("Dados inválidos", fieldErrors);
    }

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
    if (!createAbility(perms).can(PERMISSIONS.STUDENT_DOCUMENTS_VERIFY)) {
      throw new AuthorizationError();
    }
  }

  async execute(): Promise<StudentDocument> {
    const document = await verifyStudentDocument(this.input.documentId, this.context.organizationId, {
      status: this.input.status,
      notes: this.input.notes ?? null,
      verifiedBy: this.context.userId,
    });

    await auditService.log(this.context, {
      entity: "StudentDocument",
      entityId: document.id,
      action: "student_document.verified",
      newValues: { status: document.status, studentId: document.studentId },
    });

    // F-H2: publish the canonical document status-change fact (post-write).
    await eventPublisher.publish({
      organizationId: this.context.organizationId,
      eventType: DomainEventType.STUDENT_DOCUMENT_STATUS_CHANGED,
      aggregateType: DomainAggregateType.STUDENT_DOCUMENT,
      aggregateId: document.id,
      actorId: this.context.userId,
      payload: {
        studentId: document.studentId,
        documentId: document.id,
        previousStatus: null,
        currentStatus: document.status,
        changeType: document.status === "APPROVED" ? "APPROVED" : "REJECTED",
        occurredAt: new Date().toISOString(),
      },
    });

    return document;
  }
}
