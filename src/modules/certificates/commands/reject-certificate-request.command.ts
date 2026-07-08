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
  rejectCertificateRequestSchema,
  type RejectCertificateRequestInput,
} from "@/modules/certificates/schemas/certificate.schema";
import {
  findCertificateRequestById,
  markRequestRejected,
} from "@/modules/certificates/repositories/certificate-request.repository";
import type { ReviewCertificateRequestResult } from "./approve-certificate-request.command";

// =============================================================================
// REJECT CERTIFICATE REQUEST COMMAND (Phase 12) — PENDING → REJECTED (terminal)
// -----------------------------------------------------------------------------
// Staff review step (`certificates.generate`); a reason is mandatory. No academic
// decision, no certificate created. Conditional write + audit in ONE transaction.
// =============================================================================

export class RejectCertificateRequestCommand extends BaseCommand<
  RejectCertificateRequestInput,
  ReviewCertificateRequestResult
> {
  async validate(): Promise<void> {
    const parsed = rejectCertificateRequestSchema.safeParse(this.input);
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
    const { requestId, reason } = rejectCertificateRequestSchema.parse(this.input);
    const now = new Date();
    const db = await getDb();

    return db.$transaction(async (tx: PrismaClientOrTx) => {
      const request = await findCertificateRequestById({ id: requestId, organizationId }, tx);
      if (!request) throw new NotFoundError("CertificateRequest", requestId);
      if (request.status !== CertificateRequestStatus.PENDING) {
        throw new BusinessRuleError(
          `Only a PENDING request can be rejected (current status: ${request.status}).`
        );
      }

      const marked = await markRequestRejected(
        { id: request.id, organizationId, reviewedBy: userId, reviewedAt: now, reason },
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
          action: "certificate_request.rejected",
          oldValues: { status: request.status },
          newValues: {
            requestId: request.id,
            studentId: request.studentId,
            certificateType: request.certificateType,
            transcriptVersionId: request.transcriptVersionId,
            previousStatus: request.status,
            newStatus: CertificateRequestStatus.REJECTED,
            actorId: userId,
            reason,
          },
        },
        tx
      );

      return {
        requestId: request.id,
        status: CertificateRequestStatus.REJECTED,
        reviewedAt: now,
        reviewedBy: userId,
      };
    });
  }
}
