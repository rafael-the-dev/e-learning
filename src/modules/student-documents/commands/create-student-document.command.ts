import {
  BaseCommand,
  AuthorizationError,
  ValidationError,
  NotFoundError,
} from "@/shared/lib/command";
import { getUserPermissions, createAbility } from "@/server/auth/rbac";
import { PERMISSIONS } from "@/server/auth/permissions";
import { auditService } from "@/modules/audit-logs/services/audit.service";
import { findByIdInOrganization as findStudentByIdInOrganization } from "@/modules/students/repositories/student.repository";
import { createStudentDocument } from "@/modules/student-documents/repositories/student-document.repository";
import {
  createStudentDocumentSchema,
  type CreateStudentDocumentSchema,
} from "@/modules/student-documents/schemas/student-document.schema";
import type { StudentDocument } from "@/modules/student-documents/types";
import { eventPublisher } from "@/server/events/event-publisher";
import { DomainEventType, DomainAggregateType } from "@/server/events/event-types";

export class CreateStudentDocumentCommand extends BaseCommand<
  CreateStudentDocumentSchema,
  StudentDocument
> {
  async validate(): Promise<void> {
    const result = createStudentDocumentSchema.safeParse(this.input);
    if (!result.success) {
      const fieldErrors: Record<string, string[]> = {};
      for (const issue of result.error.issues) {
        const key = issue.path.join(".");
        if (!fieldErrors[key]) fieldErrors[key] = [];
        fieldErrors[key].push(issue.message);
      }
      throw new ValidationError("Dados inválidos", fieldErrors);
    }

    const student = await findStudentByIdInOrganization(
      this.input.studentId,
      this.context.organizationId
    );
    if (!student) throw new NotFoundError("Aluno", this.input.studentId);
  }

  async authorize(): Promise<void> {
    const perms = await getUserPermissions(this.context.userId, this.context.organizationId);
    if (!createAbility(perms).can(PERMISSIONS.STUDENT_DOCUMENTS_UPLOAD)) {
      throw new AuthorizationError();
    }
  }

  async execute(): Promise<StudentDocument> {
    const document = await createStudentDocument({
      organizationId: this.context.organizationId,
      studentId: this.input.studentId,
      documentType: this.input.documentType ?? "OTHER",
      fileName: this.input.fileName,
      fileUrl: this.input.fileUrl,
      fileSize: this.input.fileSize ?? null,
      notes: this.input.notes ?? null,
      uploadedBy: this.context.userId,
    });

    await auditService.log(this.context, {
      entity: "StudentDocument",
      entityId: document.id,
      action: "student_document.uploaded",
      newValues: { studentId: document.studentId, fileName: document.fileName },
    });

    // F-H2: the documents dimension (documentCount === 0 → HIGH) changes when the first
    // document is uploaded; publish the canonical status-change fact (post-write).
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
        changeType: "SUBMITTED",
        occurredAt: new Date().toISOString(),
      },
    });

    return document;
  }
}
