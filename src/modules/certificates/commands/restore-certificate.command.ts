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
import { DomainAggregateType, DomainEventType } from "@/server/events/event-types";
import type { DomainEvent } from "@/server/events/domain-event";
import { eventPublisher } from "@/server/events/event-publisher";
import { auditService } from "@/modules/audit-logs/services/audit.service";
import {
  CertificateStatus,
  CertificateVerificationPublicStatus,
} from "@/modules/certificates/constants";
import {
  restoreCertificateSchema,
  type RestoreCertificateInput,
} from "@/modules/certificates/schemas/certificate.schema";
import {
  findCertificateById,
  markCertificateRestored,
} from "@/modules/certificates/repositories/certificate.repository";
import { updateCertificateVerificationStatus } from "@/modules/certificates/repositories/certificate-verification.repository";
import { createCertificateEvent } from "@/modules/certificates/repositories/certificate-event.repository";
import {
  buildLifecycleEventMetadata,
  buildLifecyclePayload,
  loadVerificationOrThrow,
} from "./certificate-lifecycle-shared";

// =============================================================================
// RESTORE CERTIFICATE COMMAND (Phase 6)
// -----------------------------------------------------------------------------
// SUSPENDED → ISSUED. Clears the current suspension fields (history stays in
// CertificateEvent/audit) and re-opens the verification projection: VALID, or
// EXPIRED when the certificate is already past `expiresAt`. Uses `certificates.suspend`
// (no dedicated `certificates.restore` permission exists in this phase — the same
// operator who can suspend can restore). Writes the append-only event + audit inside
// ONE transaction; publishes `certificate.restored` only AFTER commit.
//
// It NEVER mutates the frozen content columns, number, checksum, issue stamp, or
// transcript pointer (§12). The conditional write (`status = SUSPENDED`) makes a
// double-restore / restore-from-a-non-suspended state a race-safe no-op → abort.
// =============================================================================

export interface RestoreCertificateResult {
  certificateId: string;
  status: string;
  previousStatus: string;
  publicStatus: string;
}

export class RestoreCertificateCommand extends BaseCommand<
  RestoreCertificateInput,
  RestoreCertificateResult
> {
  async validate(): Promise<void> {
    const parsed = restoreCertificateSchema.safeParse(this.input);
    if (!parsed.success) {
      throw new ValidationError("Dados inválidos", parsed.error.flatten().fieldErrors);
    }
  }

  async authorize(): Promise<void> {
    const perms = await getUserPermissions(this.context.userId, this.context.organizationId);
    if (!createAbility(perms).can(PERMISSIONS.CERTIFICATES_SUSPEND)) {
      throw new AuthorizationError();
    }
  }

  async execute(): Promise<RestoreCertificateResult> {
    const { organizationId, userId } = this.context;
    const { certificateId, reason } = restoreCertificateSchema.parse(this.input);
    const now = new Date();
    const db = await getDb();
    const events: DomainEvent[] = [];

    const result = await db.$transaction(async (tx: PrismaClientOrTx) => {
      const certificate = await findCertificateById({ id: certificateId, organizationId }, tx);
      if (!certificate) throw new NotFoundError("Certificate", certificateId);

      if (certificate.status !== CertificateStatus.SUSPENDED) {
        throw new BusinessRuleError(
          `Only a SUSPENDED certificate can be restored (current status: ${certificate.status}).`
        );
      }

      const verification = await loadVerificationOrThrow(organizationId, certificate.id, tx);

      // Conditional transition (race-safe): clears the suspension fields.
      const marked = await markCertificateRestored({ id: certificate.id, organizationId }, tx);
      if (marked.count !== 1) {
        throw new BusinessRuleError("Certificate is no longer in a SUSPENDED state.");
      }

      // Verification projection re-opens: EXPIRED if already past expiry, else VALID.
      const publicStatus =
        certificate.expiresAt && certificate.expiresAt.getTime() <= now.getTime()
          ? CertificateVerificationPublicStatus.EXPIRED
          : CertificateVerificationPublicStatus.VALID;
      // Conditional write; symmetry with the certificate mark — the 1:1 row was just
      // loaded in this tx, so a count !== 1 is a data-integrity failure and must abort.
      const verificationMarked = await updateCertificateVerificationStatus(
        { id: verification.id, organizationId, publicStatus },
        tx
      );
      if (verificationMarked.count !== 1) {
        throw new BusinessRuleError("Certificate verification projection could not be updated.");
      }

      const previousStatus = certificate.status;
      await createCertificateEvent(
        {
          organizationId,
          certificateId: certificate.id,
          eventType: DomainEventType.CERTIFICATE_RESTORED,
          previousStatus,
          newStatus: CertificateStatus.ISSUED,
          actorId: userId,
          reason: reason ?? null,
          metadata: buildLifecycleEventMetadata(certificate, publicStatus),
        },
        tx
      );

      await auditService.log(
        this.context,
        {
          entity: "Certificate",
          entityId: certificate.id,
          action: DomainEventType.CERTIFICATE_RESTORED,
          oldValues: {
            status: previousStatus,
            verificationPublicStatus: verification.publicStatus,
            suspendedAt: certificate.suspendedAt,
            certificateNumber: certificate.certificateNumber,
            checksum: certificate.checksum,
          },
          newValues: {
            status: CertificateStatus.ISSUED,
            verificationPublicStatus: publicStatus,
            suspendedAt: null,
            reason: reason ?? null,
          },
        },
        tx
      );

      events.push({
        organizationId,
        eventType: DomainEventType.CERTIFICATE_RESTORED,
        aggregateType: DomainAggregateType.CERTIFICATE,
        aggregateId: certificate.id,
        actorId: userId,
        payload: buildLifecyclePayload(certificate, {
          previousStatus,
          newStatus: CertificateStatus.ISSUED,
          actorId: userId,
          reason: reason ?? null,
          occurredAt: now,
        }),
      });

      return {
        certificateId: certificate.id,
        status: CertificateStatus.ISSUED,
        previousStatus,
        publicStatus,
      };
    });

    for (const event of events) await eventPublisher.publish(event);
    return result;
  }
}
