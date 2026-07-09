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
import { certificateOutbox } from "@/modules/certificates/outbox";
import { auditService } from "@/modules/audit-logs/services/audit.service";
import {
  CertificateStatus,
  CertificateVerificationPublicStatus,
} from "@/modules/certificates/constants";
import {
  revokeCertificateSchema,
  type RevokeCertificateInput,
} from "@/modules/certificates/schemas/certificate.schema";
import {
  findCertificateById,
  markCertificateRevoked,
} from "@/modules/certificates/repositories/certificate.repository";
import { updateCertificateVerificationStatus } from "@/modules/certificates/repositories/certificate-verification.repository";
import { createCertificateEvent } from "@/modules/certificates/repositories/certificate-event.repository";
import {
  buildLifecycleEventMetadata,
  buildLifecyclePayload,
  loadVerificationOrThrow,
} from "./certificate-lifecycle-shared";

// =============================================================================
// REVOKE CERTIFICATE COMMAND (Phase 6)
// -----------------------------------------------------------------------------
// ISSUED | SUSPENDED → REVOKED (terminal; a revoked certificate never returns).
// A reason is mandatory. Sets the revocation columns, flips the verification
// projection to REVOKED, writes the append-only event + audit inside ONE
// transaction, and publishes `certificate.revoked` only AFTER commit.
//
// It NEVER deletes the certificate and NEVER mutates the frozen content columns,
// number, checksum, issue stamp, or transcript pointer (§12). The conditional
// write (`status IN (ISSUED, SUSPENDED)`) makes a double-revoke / revoke-from-a
// -non-revocable state a race-safe no-op → abort.
// =============================================================================

export interface RevokeCertificateResult {
  certificateId: string;
  status: string;
  previousStatus: string;
  publicStatus: string;
}

const REVOCABLE_STATUSES: ReadonlySet<string> = new Set([
  CertificateStatus.ISSUED,
  CertificateStatus.SUSPENDED,
]);

export class RevokeCertificateCommand extends BaseCommand<
  RevokeCertificateInput,
  RevokeCertificateResult
> {
  async validate(): Promise<void> {
    const parsed = revokeCertificateSchema.safeParse(this.input);
    if (!parsed.success) {
      throw new ValidationError("Dados inválidos", parsed.error.flatten().fieldErrors);
    }
  }

  async authorize(): Promise<void> {
    const perms = await getUserPermissions(this.context.userId, this.context.organizationId);
    if (!createAbility(perms).can(PERMISSIONS.CERTIFICATES_REVOKE)) {
      throw new AuthorizationError();
    }
  }

  async execute(): Promise<RevokeCertificateResult> {
    const { organizationId, userId } = this.context;
    const { certificateId, reason } = revokeCertificateSchema.parse(this.input);
    const now = new Date();
    const db = await getDb();
    const events: DomainEvent[] = [];

    const result = await db.$transaction(async (tx: PrismaClientOrTx) => {
      const certificate = await findCertificateById({ id: certificateId, organizationId }, tx);
      if (!certificate) throw new NotFoundError("Certificate", certificateId);

      if (!REVOCABLE_STATUSES.has(certificate.status)) {
        throw new BusinessRuleError(
          `Only an ISSUED or SUSPENDED certificate can be revoked (current status: ${certificate.status}).`
        );
      }

      const verification = await loadVerificationOrThrow(organizationId, certificate.id, tx);

      // Conditional transition (race-safe).
      const marked = await markCertificateRevoked(
        { id: certificate.id, organizationId, revokedAt: now, revokedBy: userId, revokeReason: reason },
        tx
      );
      if (marked.count !== 1) {
        throw new BusinessRuleError("Certificate is no longer in a revocable state.");
      }

      // Verification projection → REVOKED (conditional write; symmetry with the
      // certificate mark — the 1:1 row was just loaded in this tx, so a count !== 1
      // is a data-integrity failure and must abort).
      const verificationMarked = await updateCertificateVerificationStatus(
        {
          id: verification.id,
          organizationId,
          publicStatus: CertificateVerificationPublicStatus.REVOKED,
        },
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
          eventType: DomainEventType.CERTIFICATE_REVOKED,
          previousStatus,
          newStatus: CertificateStatus.REVOKED,
          actorId: userId,
          reason,
          metadata: buildLifecycleEventMetadata(certificate, CertificateVerificationPublicStatus.REVOKED),
        },
        tx
      );

      await auditService.log(
        this.context,
        {
          entity: "Certificate",
          entityId: certificate.id,
          action: DomainEventType.CERTIFICATE_REVOKED,
          oldValues: {
            status: previousStatus,
            verificationPublicStatus: verification.publicStatus,
            revokedAt: certificate.revokedAt,
            certificateNumber: certificate.certificateNumber,
            checksum: certificate.checksum,
          },
          newValues: {
            status: CertificateStatus.REVOKED,
            verificationPublicStatus: CertificateVerificationPublicStatus.REVOKED,
            revokedAt: now,
            revokedBy: userId,
            reason,
          },
        },
        tx
      );

      events.push({
        organizationId,
        eventType: DomainEventType.CERTIFICATE_REVOKED,
        aggregateType: DomainAggregateType.CERTIFICATE,
        aggregateId: certificate.id,
        actorId: userId,
        payload: buildLifecyclePayload(certificate, {
          previousStatus,
          newStatus: CertificateStatus.REVOKED,
          actorId: userId,
          reason,
          occurredAt: now,
        }),
      });

      return {
        certificateId: certificate.id,
        status: CertificateStatus.REVOKED,
        previousStatus,
        publicStatus: CertificateVerificationPublicStatus.REVOKED,
      };
    });

    await certificateOutbox.dispatch(events);
    return result;
  }
}
