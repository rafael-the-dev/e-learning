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
  fulfillCertificateRequestSchema,
  type FulfillCertificateRequestInput,
} from "@/modules/certificates/schemas/certificate.schema";
import {
  findCertificateRequestById,
  markRequestFulfilled,
} from "@/modules/certificates/repositories/certificate-request.repository";
import { GenerateCertificateCommand } from "./generate-certificate.command";

// =============================================================================
// FULFILL CERTIFICATE REQUEST COMMAND (Phase 12) — APPROVED → FULFILLED
// -----------------------------------------------------------------------------
// Staff step (`certificates.generate`). Fulfilment GENERATES the certificate via
// `GenerateCertificateCommand` — it NEVER duplicates eligibility, inspects the
// transcript, or decides academics (Generate owns that, through the engine). No
// auto-issue in Phase 12: the produced certificate stays DRAFT / PENDING_APPROVAL
// per the existing command.
//
// Ordering avoids partial state: GENERATE FIRST (its own transaction). If it fails,
// this command throws and the request stays APPROVED (nothing changed). Only after a
// successful generation is the request flipped FULFILLED (conditional, race-safe) +
// audited in a short transaction. A concurrent transition between the two steps
// surfaces as `count !== 1` → abort (the generated DRAFT certificate is a valid,
// separately-manageable record).
// =============================================================================

export interface FulfillCertificateRequestResult {
  requestId: string;
  status: string;
  fulfilledCertificateId: string;
  certificateStatus: string;
}

export class FulfillCertificateRequestCommand extends BaseCommand<
  FulfillCertificateRequestInput,
  FulfillCertificateRequestResult
> {
  async validate(): Promise<void> {
    const parsed = fulfillCertificateRequestSchema.safeParse(this.input);
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

  async execute(): Promise<FulfillCertificateRequestResult> {
    const { organizationId, userId } = this.context;
    const { requestId, reason } = fulfillCertificateRequestSchema.parse(this.input);

    // 1. Load + guard (no write yet). Cross-tenant / unknown → NOT_FOUND.
    const request = await findCertificateRequestById({ id: requestId, organizationId });
    if (!request) throw new NotFoundError("CertificateRequest", requestId);
    if (request.status !== CertificateRequestStatus.APPROVED) {
      throw new BusinessRuleError(
        `Only an APPROVED request can be fulfilled (current status: ${request.status}).`
      );
    }
    if (!request.transcriptVersionId) {
      throw new BusinessRuleError(
        "Request has no transcript version to fulfill; generate the certificate manually."
      );
    }

    // 2. Generate the certificate (its OWN transaction, its OWN eligibility evaluation).
    //    A failure propagates here and leaves the request APPROVED — no partial state.
    const generated = await new GenerateCertificateCommand(
      {
        transcriptVersionId: request.transcriptVersionId,
        certificateType: request.certificateType,
        reason,
      },
      this.context
    ).run();

    // 3. Flip the request FULFILLED (conditional) + audit, in a short transaction.
    const db = await getDb();
    await db.$transaction(async (tx: PrismaClientOrTx) => {
      const marked = await markRequestFulfilled(
        { id: request.id, organizationId, fulfilledCertificateId: generated.certificateId },
        tx
      );
      if (marked.count !== 1) {
        throw new BusinessRuleError("Certificate request is no longer APPROVED.");
      }

      await auditService.log(
        this.context,
        {
          entity: "CertificateRequest",
          entityId: request.id,
          action: "certificate_request.fulfilled",
          oldValues: { status: request.status },
          newValues: {
            requestId: request.id,
            studentId: request.studentId,
            certificateType: request.certificateType,
            transcriptVersionId: request.transcriptVersionId,
            previousStatus: request.status,
            newStatus: CertificateRequestStatus.FULFILLED,
            actorId: userId,
            fulfilledCertificateId: generated.certificateId,
            certificateStatus: generated.status,
          },
        },
        tx
      );
    });

    return {
      requestId: request.id,
      status: CertificateRequestStatus.FULFILLED,
      fulfilledCertificateId: generated.certificateId,
      certificateStatus: generated.status,
    };
  }
}
