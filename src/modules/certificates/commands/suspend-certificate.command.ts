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
  suspendCertificateSchema,
  type SuspendCertificateInput,
} from "@/modules/certificates/schemas/certificate.schema";
import {
  findCertificateById,
  markCertificateSuspended,
} from "@/modules/certificates/repositories/certificate.repository";
import { updateCertificateVerificationStatus } from "@/modules/certificates/repositories/certificate-verification.repository";
import { createCertificateEvent } from "@/modules/certificates/repositories/certificate-event.repository";
import {
  buildLifecycleEventMetadata,
  buildLifecyclePayload,
  loadVerificationOrThrow,
} from "./certificate-lifecycle-shared";

// =============================================================================
// SUSPEND CERTIFICATE COMMAND (Phase 6)
// -----------------------------------------------------------------------------
// ISSUED → SUSPENDED (recoverable via RestoreCertificateCommand). A reason is
// mandatory. Sets the suspension columns, flips the verification projection to
// SUSPENDED, writes the append-only event + audit inside ONE transaction, and
// publishes `certificate.suspended` only AFTER commit.
//
// It NEVER mutates the frozen content columns, number, checksum, issue stamp, or
// transcript pointer (§12). The conditional write (`status = ISSUED`) makes a
// double-suspend / suspend-from-a-non-issued state a race-safe no-op → abort.
// =============================================================================

export interface SuspendCertificateResult {
  certificateId: string;
  status: string;
  previousStatus: string;
  publicStatus: string;
}

export class SuspendCertificateCommand extends BaseCommand<
  SuspendCertificateInput,
  SuspendCertificateResult
> {
  async validate(): Promise<void> {
    const parsed = suspendCertificateSchema.safeParse(this.input);
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

  async execute(): Promise<SuspendCertificateResult> {
    const { organizationId, userId } = this.context;
    const { certificateId, reason } = suspendCertificateSchema.parse(this.input);
    const now = new Date();
    const db = await getDb();
    const events: DomainEvent[] = [];

    const result = await db.$transaction(async (tx: PrismaClientOrTx) => {
      const certificate = await findCertificateById({ id: certificateId, organizationId }, tx);
      if (!certificate) throw new NotFoundError("Certificate", certificateId);

      if (certificate.status !== CertificateStatus.ISSUED) {
        throw new BusinessRuleError(
          `Only an ISSUED certificate can be suspended (current status: ${certificate.status}).`
        );
      }

      const verification = await loadVerificationOrThrow(organizationId, certificate.id, tx);

      // Conditional transition (race-safe).
      const marked = await markCertificateSuspended(
        { id: certificate.id, organizationId, suspendedAt: now, suspendedBy: userId, suspendReason: reason },
        tx
      );
      if (marked.count !== 1) {
        throw new BusinessRuleError("Certificate is no longer in an ISSUED state.");
      }

      // Verification projection → SUSPENDED (conditional write; symmetry with the
      // certificate mark — the 1:1 row was just loaded in this tx, so a count !== 1
      // is a data-integrity failure and must abort).
      const verificationMarked = await updateCertificateVerificationStatus(
        {
          id: verification.id,
          organizationId,
          publicStatus: CertificateVerificationPublicStatus.SUSPENDED,
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
          eventType: DomainEventType.CERTIFICATE_SUSPENDED,
          previousStatus,
          newStatus: CertificateStatus.SUSPENDED,
          actorId: userId,
          reason,
          metadata: buildLifecycleEventMetadata(certificate, CertificateVerificationPublicStatus.SUSPENDED),
        },
        tx
      );

      await auditService.log(
        this.context,
        {
          entity: "Certificate",
          entityId: certificate.id,
          action: DomainEventType.CERTIFICATE_SUSPENDED,
          oldValues: {
            status: previousStatus,
            verificationPublicStatus: verification.publicStatus,
            suspendedAt: certificate.suspendedAt,
            certificateNumber: certificate.certificateNumber,
            checksum: certificate.checksum,
          },
          newValues: {
            status: CertificateStatus.SUSPENDED,
            verificationPublicStatus: CertificateVerificationPublicStatus.SUSPENDED,
            suspendedAt: now,
            suspendedBy: userId,
            reason,
          },
        },
        tx
      );

      events.push({
        organizationId,
        eventType: DomainEventType.CERTIFICATE_SUSPENDED,
        aggregateType: DomainAggregateType.CERTIFICATE,
        aggregateId: certificate.id,
        actorId: userId,
        payload: buildLifecyclePayload(certificate, {
          previousStatus,
          newStatus: CertificateStatus.SUSPENDED,
          actorId: userId,
          reason,
          occurredAt: now,
        }),
      });

      return {
        certificateId: certificate.id,
        status: CertificateStatus.SUSPENDED,
        previousStatus,
        publicStatus: CertificateVerificationPublicStatus.SUSPENDED,
      };
    });

    for (const event of events) await eventPublisher.publish(event);
    return result;
  }
}
