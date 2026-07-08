import { getDb } from "@/server/db";
import type { PrismaClientOrTx } from "@/server/db";
import {
  AuthorizationError,
  BaseCommand,
  BusinessRuleError,
  ValidationError,
} from "@/shared/lib/command";
import { createAbility, getUserPermissions, getUserRoles } from "@/server/auth/rbac";
import { PERMISSIONS } from "@/server/auth/permissions";
import { isStudentScopedRoles } from "@/server/auth/student-scope";
import { auditService } from "@/modules/audit-logs/services/audit.service";
import { getStudentById, getStudentByUserId } from "@/modules/students/services/student.service";
import { CertificateRequestStatus } from "@/modules/certificates/constants";
import {
  requestCertificateSchema,
  type RequestCertificateInput,
} from "@/modules/certificates/schemas/certificate.schema";
import {
  createCertificateRequest,
  findActiveRequest,
} from "@/modules/certificates/repositories/certificate-request.repository";

// =============================================================================
// REQUEST CERTIFICATE COMMAND (Phase 12) — create a PENDING request
// -----------------------------------------------------------------------------
// An ADMINISTRATIVE workflow entry point: it decides NO academic eligibility (that
// stays in the engine) and generates NO certificate (that stays in Generate). A
// student requests only for THEMSELVES (studentId resolved from the session, never
// input); staff may request FOR a student (studentId supplied, validated in-org).
// A duplicate ACTIVE request (PENDING/APPROVED) for the same (student, type,
// transcriptVersion) is refused. Create + audit run in ONE transaction.
// =============================================================================

export interface RequestCertificateResult {
  requestId: string;
  status: string;
  certificateType: string;
  transcriptVersionId: string | null;
}

export class RequestCertificateCommand extends BaseCommand<
  RequestCertificateInput,
  RequestCertificateResult
> {
  async validate(): Promise<void> {
    const parsed = requestCertificateSchema.safeParse(this.input);
    if (!parsed.success) {
      throw new ValidationError("Dados inválidos", parsed.error.flatten().fieldErrors);
    }
  }

  async authorize(): Promise<void> {
    const { userId, organizationId } = this.context;
    const [perms, roles] = await Promise.all([
      getUserPermissions(userId, organizationId),
      getUserRoles(userId, organizationId),
    ]);
    // Student self-request needs `certificates.request`; a staff-created request (for a
    // student) needs `certificates.generate`.
    const required = isStudentScopedRoles(roles)
      ? PERMISSIONS.CERTIFICATES_REQUEST
      : PERMISSIONS.CERTIFICATES_GENERATE;
    if (!createAbility(perms).can(required)) {
      throw new AuthorizationError();
    }
  }

  async execute(): Promise<RequestCertificateResult> {
    const { organizationId, userId } = this.context;
    const input = requestCertificateSchema.parse(this.input);

    // Resolve the target studentId server-side.
    const studentId = await this.resolveStudentId(input.studentId);

    const db = await getDb();
    return db.$transaction(async (tx: PrismaClientOrTx) => {
      const duplicate = await findActiveRequest(
        {
          organizationId,
          studentId,
          certificateType: input.certificateType,
          transcriptVersionId: input.transcriptVersionId ?? null,
        },
        tx
      );
      if (duplicate) {
        throw new BusinessRuleError("Já existe um pedido ativo para este certificado.");
      }

      const request = await createCertificateRequest(
        {
          organizationId,
          studentId,
          certificateType: input.certificateType,
          requestedBy: userId,
          transcriptVersionId: input.transcriptVersionId ?? null,
          status: CertificateRequestStatus.PENDING,
          reason: input.reason ?? null,
        },
        tx
      );

      await auditService.log(
        this.context,
        {
          entity: "CertificateRequest",
          entityId: request.id,
          action: "certificate_request.created",
          oldValues: null,
          newValues: {
            requestId: request.id,
            studentId,
            certificateType: request.certificateType,
            transcriptVersionId: request.transcriptVersionId,
            previousStatus: null,
            newStatus: CertificateRequestStatus.PENDING,
            actorId: userId,
            reason: request.reason,
          },
        },
        tx
      );

      return {
        requestId: request.id,
        status: request.status,
        certificateType: request.certificateType,
        transcriptVersionId: request.transcriptVersionId,
      };
    });
  }

  /** Own studentId for a student caller; the supplied (in-org) studentId for staff. */
  private async resolveStudentId(inputStudentId?: string): Promise<string> {
    const { userId, organizationId } = this.context;
    const roles = await getUserRoles(userId, organizationId);

    if (isStudentScopedRoles(roles)) {
      // Own studentId resolved from the session (Student.userId), never from input.
      const student = await getStudentByUserId(organizationId, userId);
      if (!student) throw new AuthorizationError();
      // A student may never request for someone else, even if a studentId is supplied.
      if (inputStudentId && inputStudentId !== student.id) throw new AuthorizationError();
      return student.id;
    }
    // Staff path: an explicit, in-org studentId is required.
    if (!inputStudentId) {
      throw new ValidationError("O identificador do aluno é obrigatório", {
        studentId: ["required"],
      });
    }
    // Org-scoped existence check (throws NotFoundError for a cross-tenant / unknown id).
    await getStudentById(inputStudentId, organizationId);
    return inputStudentId;
  }
}
