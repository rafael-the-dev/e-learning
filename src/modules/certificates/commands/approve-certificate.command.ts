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
import { DomainEventType } from "@/server/events/event-types";
import { auditService } from "@/modules/audit-logs/services/audit.service";
import { CertificateStatus } from "@/modules/certificates/constants";
import {
  approveCertificateSchema,
  type ApproveCertificateInput,
} from "@/modules/certificates/schemas/certificate.schema";
import { findCertificateById } from "@/modules/certificates/repositories/certificate.repository";
import {
  createCertificateEvent,
  listCertificateEvents,
} from "@/modules/certificates/repositories/certificate-event.repository";

// =============================================================================
// APPROVE CERTIFICATE COMMAND (Phase 5 — approval provenance)
// -----------------------------------------------------------------------------
// Records the manual-approval provenance for a PENDING_APPROVAL certificate so it
// becomes issuable. `IssueCertificateCommand` gates a PENDING_APPROVAL certificate
// on the EXISTENCE of a `certificate.approved` CertificateEvent (provenance lives in
// the append-only event log, never in policy flags). This command is the sole writer
// of that event.
//
// It does NOT change the certificate status (the certificate stays PENDING_APPROVAL
// until `IssueCertificateCommand` promotes it to ISSUED), makes NO academic decision
// and NO eligibility re-evaluation (Rule C-5), and mutates no frozen content column.
// The event is audit/provenance only — it is NOT published on the bus (mirroring
// `certificate.generated`), so there is no Outbox dispatch here.
//
// Authority: `certificates.generate` — the same review authority that approves a
// CertificateRequest. Append-only + audit run in ONE transaction; a non-
// PENDING_APPROVAL certificate, or one already approved, is refused (idempotent).
// =============================================================================

export interface ApproveCertificateResult {
  certificateId: string;
  status: string;
  approvedAt: Date;
  approvedBy: string;
}

export class ApproveCertificateCommand extends BaseCommand<
  ApproveCertificateInput,
  ApproveCertificateResult
> {
  async validate(): Promise<void> {
    const parsed = approveCertificateSchema.safeParse(this.input);
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

  async execute(): Promise<ApproveCertificateResult> {
    const { organizationId, userId } = this.context;
    const { certificateId, reason } = approveCertificateSchema.parse(this.input);
    const now = new Date();
    const db = await getDb();

    return db.$transaction(async (tx: PrismaClientOrTx) => {
      const certificate = await findCertificateById({ id: certificateId, organizationId }, tx);
      if (!certificate) throw new NotFoundError("Certificate", certificateId);

      // Only a PENDING_APPROVAL certificate can be approved. (A DRAFT needs no
      // approval to issue; an ISSUED/terminal certificate is past this step.)
      if (certificate.status !== CertificateStatus.PENDING_APPROVAL) {
        throw new BusinessRuleError(
          `Only a PENDING_APPROVAL certificate can be approved (current status: ${certificate.status}).`
        );
      }

      // Idempotency: refuse a second approval — one provenance record is enough and
      // `IssueCertificateCommand` only checks for existence.
      const existing = await listCertificateEvents(
        { organizationId, certificateId: certificate.id, eventType: DomainEventType.CERTIFICATE_APPROVED },
        tx
      );
      if (existing.length > 0) {
        throw new BusinessRuleError("Certificate has already been approved.");
      }

      // Append the approval provenance (status is unchanged — approval is not a
      // lifecycle transition; the certificate stays PENDING_APPROVAL until issue).
      await createCertificateEvent(
        {
          organizationId,
          certificateId: certificate.id,
          eventType: DomainEventType.CERTIFICATE_APPROVED,
          previousStatus: certificate.status,
          newStatus: certificate.status,
          actorId: userId,
          reason: reason ?? null,
        },
        tx
      );

      await auditService.log(
        this.context,
        {
          entity: "Certificate",
          entityId: certificate.id,
          action: DomainEventType.CERTIFICATE_APPROVED,
          oldValues: { status: certificate.status },
          newValues: {
            certificateId: certificate.id,
            status: certificate.status,
            approvedBy: userId,
            approvedAt: now,
            reason: reason ?? null,
          },
        },
        tx
      );

      return {
        certificateId: certificate.id,
        status: certificate.status,
        approvedAt: now,
        approvedBy: userId,
      };
    });
  }
}
