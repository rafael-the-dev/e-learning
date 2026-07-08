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
  cancelCertificateRequestSchema,
  type CancelCertificateRequestInput,
} from "@/modules/certificates/schemas/certificate.schema";
import {
  findCertificateRequestById,
  markRequestCancelled,
} from "@/modules/certificates/repositories/certificate-request.repository";

// =============================================================================
// CANCEL CERTIFICATE REQUEST COMMAND (Phase 12) — PENDING|APPROVED → CANCELLED
// -----------------------------------------------------------------------------
// Two callers (server-enforced):
//   • the REQUESTER (`certificates.request`) may cancel their OWN request, and ONLY
//     while it is PENDING (never once APPROVED).
//   • STAFF (`certificates.generate`) may cancel a PENDING or APPROVED request.
// Terminal requests (REJECTED/FULFILLED/CANCELLED) cannot be cancelled. No academic
// decision, no certificate created. Conditional write + audit in ONE transaction.
// =============================================================================

export interface CancelCertificateRequestResult {
  requestId: string;
  status: string;
}

const TERMINAL: ReadonlySet<string> = new Set([
  CertificateRequestStatus.REJECTED,
  CertificateRequestStatus.FULFILLED,
  CertificateRequestStatus.CANCELLED,
]);

export class CancelCertificateRequestCommand extends BaseCommand<
  CancelCertificateRequestInput,
  CancelCertificateRequestResult
> {
  async validate(): Promise<void> {
    const parsed = cancelCertificateRequestSchema.safeParse(this.input);
    if (!parsed.success) {
      throw new ValidationError("Dados inválidos", parsed.error.flatten().fieldErrors);
    }
  }

  async authorize(): Promise<void> {
    // Coarse gate — either capability may cancel; ownership/status is enforced in
    // execute (which needs the loaded request).
    const perms = await getUserPermissions(this.context.userId, this.context.organizationId);
    const ability = createAbility(perms);
    if (
      !ability.can(PERMISSIONS.CERTIFICATES_REQUEST) &&
      !ability.can(PERMISSIONS.CERTIFICATES_GENERATE)
    ) {
      throw new AuthorizationError();
    }
  }

  async execute(): Promise<CancelCertificateRequestResult> {
    const { organizationId, userId } = this.context;
    const { requestId, reason } = cancelCertificateRequestSchema.parse(this.input);
    const db = await getDb();

    const perms = await getUserPermissions(userId, organizationId);
    const canStaff = createAbility(perms).can(PERMISSIONS.CERTIFICATES_GENERATE);

    return db.$transaction(async (tx: PrismaClientOrTx) => {
      const request = await findCertificateRequestById({ id: requestId, organizationId }, tx);
      if (!request) throw new NotFoundError("CertificateRequest", requestId);

      // A terminal request can never be cancelled (whatever the role).
      if (TERMINAL.has(request.status)) {
        throw new BusinessRuleError(
          `Cannot cancel a ${request.status} request.`
        );
      }

      if (!canStaff) {
        // Requester path: must own it AND it must still be PENDING.
        if (request.requestedBy !== userId) throw new AuthorizationError();
        if (request.status !== CertificateRequestStatus.PENDING) throw new AuthorizationError();
      }

      const marked = await markRequestCancelled({ id: request.id, organizationId }, tx);
      if (marked.count !== 1) {
        throw new BusinessRuleError("Certificate request is no longer cancellable.");
      }

      await auditService.log(
        this.context,
        {
          entity: "CertificateRequest",
          entityId: request.id,
          action: "certificate_request.cancelled",
          oldValues: { status: request.status },
          newValues: {
            requestId: request.id,
            studentId: request.studentId,
            certificateType: request.certificateType,
            transcriptVersionId: request.transcriptVersionId,
            previousStatus: request.status,
            newStatus: CertificateRequestStatus.CANCELLED,
            actorId: userId,
            reason: reason ?? null,
          },
        },
        tx
      );

      return { requestId: request.id, status: CertificateRequestStatus.CANCELLED };
    });
  }
}
