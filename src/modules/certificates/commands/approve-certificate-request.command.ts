import { getDb } from "@/server/db";
import type { PrismaClientOrTx } from "@/server/db";
import {
  AuthorizationError,
  BaseCommand,
  BusinessRuleError,
  NotFoundError,
  ValidationError,
} from "@/shared/lib/command";
import { createAbility, getUserPermissions } from "@/server/auth/rbac";
import { PERMISSIONS } from "@/server/auth/permissions";
import { auditService } from "@/modules/audit-logs/services/audit.service";
import { CertificateRequestStatus } from "@/modules/certificates/constants";
import {
  approveCertificateRequestSchema,
  type ApproveCertificateRequestInput,
} from "@/modules/certificates/schemas/certificate.schema";
import {
  findCertificateRequestById,
  markRequestApproved,
} from "@/modules/certificates/repositories/certificate-request.repository";

// =============================================================================
// APPROVE CERTIFICATE REQUEST COMMAND (Phase 12) — PENDING → APPROVED
// -----------------------------------------------------------------------------
// Staff review step (`certificates.generate`). It makes NO academic decision and
// generates NO certificate — approval only records the review. Conditional write +
// audit run in ONE transaction; a non-PENDING request is refused.
// =============================================================================

export interface ReviewCertificateRequestResult {
  requestId: string;
  status: string;
  reviewedAt: Date;
  reviewedBy: string;
}

export class ApproveCertificateRequestCommand extends BaseCommand<
  ApproveCertificateRequestInput,
  ReviewCertificateRequestResult
> {
  async validate(): Promise<void> {
    const parsed = approveCertificateRequestSchema.safeParse(this.input);
    if (!parsed.success) {
      throw new ValidationError("Dados inválidos", parsed.error.flatten().fieldErrors);
    }
  }

  async authorize(): Promise<void> {
    const perms = await getUserPermissions(this.context.userId, this.context.organizationId);
    if (!createAbility(perms).can(PERMISSIONS.CERTIFICATES_GENERATE)) {
      throw new AuthorizationError();
    }
  }

  async execute(): Promise<ReviewCertificateRequestResult> {
    const { organizationId, userId } = this.context;
    const { requestId } = approveCertificateRequestSchema.parse(this.input);
    const now = new Date();
    const db = await getDb();

    return db.$transaction(async (tx: PrismaClientOrTx) => {
      const request = await findCertificateRequestById({ id: requestId, organizationId }, tx);
      if (!request) throw new NotFoundError("CertificateRequest", requestId);
      if (request.status !== CertificateRequestStatus.PENDING) {
        throw new BusinessRuleError(
          `Only a PENDING request can be approved (current status: ${request.status}).`
        );
      }

      const marked = await markRequestApproved(
        { id: request.id, organizationId, reviewedBy: userId, reviewedAt: now },
        tx
      );
      if (marked.count !== 1) {
        throw new BusinessRuleError("Certificate request is no longer PENDING.");
      }

      await auditService.log(
        this.context,
        {
          entity: "CertificateRequest",
          entityId: request.id,
          action: "certificate_request.approved",
          oldValues: { status: request.status },
          newValues: {
            requestId: request.id,
            studentId: request.studentId,
            certificateType: request.certificateType,
            transcriptVersionId: request.transcriptVersionId,
            previousStatus: request.status,
            newStatus: CertificateRequestStatus.APPROVED,
            actorId: userId,
            reviewedAt: now,
          },
        },
        tx
      );

      return {
        requestId: request.id,
        status: CertificateRequestStatus.APPROVED,
        reviewedAt: now,
        reviewedBy: userId,
      };
    });
  }
}
