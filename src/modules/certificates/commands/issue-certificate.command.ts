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
  issueCertificateSchema,
  type IssueCertificateInput,
} from "@/modules/certificates/schemas/certificate.schema";
import { allocateCertificateNumber } from "@/modules/certificates/lib/certificate-number";
import { certificateContentChecksum } from "@/modules/certificates/lib/certificate-checksum";
import { generateVerificationCode } from "@/modules/certificates/lib/certificate-verification-code";
import { findIssuedTranscriptVersionForCertificate } from "@/modules/certificates/repositories/certificate-transcript-source.repository";
import {
  findCertificateById,
  markCertificateIssued,
} from "@/modules/certificates/repositories/certificate.repository";
import { createCertificateVerification } from "@/modules/certificates/repositories/certificate-verification.repository";
import {
  createCertificateEvent,
  listCertificateEvents,
} from "@/modules/certificates/repositories/certificate-event.repository";

// =============================================================================
// ISSUE CERTIFICATE COMMAND (Phase 5)
// -----------------------------------------------------------------------------
// Promotes a generated certificate (DRAFT / PENDING_APPROVAL) to the official
// ISSUED record. On issue — and only on issue — it allocates the certificate
// number, computes the content checksum, and creates the 1:1 verification row.
//
// It NEVER re-runs eligibility (that decision was made at generation, Rule C-5):
// it only validates the ISSUE STATE and re-confirms the pinned transcript is
// still valid through the ACL (§6). It never inspects a policy gate, a
// courseProgress/subject/attendance status, or the finance flag.
//
// It NEVER mutates the frozen content columns (student/course/issueBasis
// snapshots, transcript pointer/number/checksum, finance snapshot) — only
// lifecycle metadata (status/number/checksum/issue stamp/verification). Everything
// runs in ONE transaction; the domain event publishes only AFTER commit.
//
// PENDING_APPROVAL is issuable only when a `certificate.approved` event already
// exists (approval provenance lives in `CertificateEvent`, not policy flags).
//
// OUT OF SCOPE (later phases): revoke/suspend/restore, PDF/export, QR, the public
// verification endpoint, stale/auto-issue handlers.
// =============================================================================

export interface IssueCertificateResult {
  certificateId: string;
  status: string;
  certificateNumber: string;
  certificateType: string;
  transcriptVersionId: string;
  transcriptNumber: string;
  issuedAt: Date;
  checksum: string;
  verificationCode: string;
  verificationUrl: string | null;
  publicStatus: string;
}

const ISSUABLE_STATUSES: ReadonlySet<string> = new Set([
  CertificateStatus.DRAFT,
  CertificateStatus.PENDING_APPROVAL,
]);

/** Parse a stored JSON snapshot column into a Record (for the checksum input). */
function parseSnapshot(value: string | null): Record<string, unknown> {
  if (!value) return {};
  return JSON.parse(value) as Record<string, unknown>;
}

export class IssueCertificateCommand extends BaseCommand<
  IssueCertificateInput,
  IssueCertificateResult
> {
  async validate(): Promise<void> {
    const parsed = issueCertificateSchema.safeParse(this.input);
    if (!parsed.success) {
      throw new ValidationError("Dados inválidos", parsed.error.flatten().fieldErrors);
    }
  }

  async authorize(): Promise<void> {
    const perms = await getUserPermissions(this.context.userId, this.context.organizationId);
    if (!createAbility(perms).can(PERMISSIONS.CERTIFICATES_ISSUE)) {
      throw new AuthorizationError();
    }
  }

  async execute(): Promise<IssueCertificateResult> {
    const { organizationId, userId } = this.context;
    const { certificateId, reason } = issueCertificateSchema.parse(this.input);
    const now = new Date();
    const db = await getDb();
    const events: DomainEvent[] = [];

    const result = await db.$transaction(async (tx: PrismaClientOrTx) => {
      // 1. Load the certificate (org-scoped, inside the tx so the transition is race-safe).
      const certificate = await findCertificateById({ id: certificateId, organizationId }, tx);
      if (!certificate) throw new NotFoundError("Certificate", certificateId);

      // 2. Issue-state guard (NOT eligibility): only a generated certificate can issue.
      if (!ISSUABLE_STATUSES.has(certificate.status)) {
        throw new BusinessRuleError(
          `Only a DRAFT or PENDING_APPROVAL certificate can be issued (current status: ${certificate.status}).`
        );
      }

      // 3. PENDING_APPROVAL requires a recorded approval event (provenance in
      //    CertificateEvent — never read from policy flags).
      if (certificate.status === CertificateStatus.PENDING_APPROVAL) {
        const approvals = await listCertificateEvents(
          { organizationId, certificateId: certificate.id, eventType: DomainEventType.CERTIFICATE_APPROVED },
          tx
        );
        if (approvals.length === 0) {
          throw new BusinessRuleError("Certificate requires an approval before it can be issued.");
        }
      }

      // 4. Re-confirm the pinned transcript is still valid — via the ACL only.
      const transcript = await findIssuedTranscriptVersionForCertificate(
        { organizationId, transcriptVersionId: certificate.transcriptVersionId },
        tx
      );
      if (!transcript) {
        throw new BusinessRuleError("TRANSCRIPT_NOT_ISSUED_OR_NO_LONGER_VALID");
      }
      if (transcript.transcriptChecksum !== certificate.transcriptChecksum) {
        throw new BusinessRuleError("TRANSCRIPT_CHECKSUM_CHANGED");
      }

      // 5. Allocate the number on first issue only (never reassign).
      const certificateNumber =
        certificate.certificateNumber ??
        (await allocateCertificateNumber(tx, { organizationId, year: now.getFullYear() }));

      // 6. Verification code — keep any existing value; otherwise generate one.
      const verificationCode = certificate.verificationCode ?? generateVerificationCode();
      const verificationUrl = certificate.verificationUrl ?? null;

      // 7. Content checksum — computed once, at issue (never recomputed).
      const checksum =
        certificate.checksum ??
        certificateContentChecksum({
          certificateNumber,
          transcriptVersionId: certificate.transcriptVersionId,
          transcriptChecksum: certificate.transcriptChecksum,
          studentSnapshot: parseSnapshot(certificate.studentSnapshot),
          courseSnapshot: certificate.courseSnapshot ? parseSnapshot(certificate.courseSnapshot) : null,
          issueBasisSnapshot: parseSnapshot(certificate.issueBasisSnapshot),
          certificateType: certificate.certificateType,
          issuedAt: now,
          policyId: certificate.certificatePolicyId ?? "",
          templateId: certificate.certificateTemplateId,
          financialClearanceStatus: certificate.financialClearanceStatus,
        });

      // 8. Public verification status: VALID unless already past expiry.
      const expiresAt = certificate.expiresAt ?? null;
      const publicStatus =
        expiresAt && expiresAt.getTime() <= now.getTime()
          ? CertificateVerificationPublicStatus.EXPIRED
          : CertificateVerificationPublicStatus.VALID;

      // 9. Conditional transition (race-safe). A concurrent issue that already
      //    promoted this row loses here → count 0 → abort before any verification /
      //    event / audit row is written and before the allocated number commits.
      const marked = await markCertificateIssued(
        {
          id: certificate.id,
          organizationId,
          certificateNumber,
          checksum,
          issuedAt: now,
          issuedBy: userId,
          verificationCode,
          verificationUrl,
          expiresAt,
        },
        tx
      );
      if (marked.count !== 1) {
        throw new BusinessRuleError("Certificate is no longer in an issuable state.");
      }

      // 10. Create the 1:1 verification projection (after the mark, so a losing race
      //     never reaches this and the unique(certificateId) index stays satisfied).
      await createCertificateVerification(
        { organizationId, certificateId: certificate.id, verificationCode, publicStatus, expiresAt },
        tx
      );

      // 11. Append-only certificate event.
      await createCertificateEvent(
        {
          organizationId,
          certificateId: certificate.id,
          eventType: DomainEventType.CERTIFICATE_ISSUED,
          previousStatus: certificate.status,
          newStatus: CertificateStatus.ISSUED,
          actorId: userId,
          reason: reason ?? null,
          metadata: JSON.stringify({
            certificateNumber,
            checksum,
            transcriptVersionId: certificate.transcriptVersionId,
            transcriptNumber: certificate.transcriptNumber,
            verificationCode,
          }),
        },
        tx
      );

      // 12. Audit (inside the transaction).
      await auditService.log(
        this.context,
        {
          entity: "Certificate",
          entityId: certificate.id,
          action: DomainEventType.CERTIFICATE_ISSUED,
          oldValues: {
            status: certificate.status,
            certificateNumber: certificate.certificateNumber,
            checksum: certificate.checksum,
          },
          newValues: {
            status: CertificateStatus.ISSUED,
            certificateNumber,
            checksum,
            issuedAt: now,
            issuedBy: userId,
            verificationCode,
          },
        },
        tx
      );

      // 13. Stage the domain event — published ONLY after commit.
      events.push({
        organizationId,
        eventType: DomainEventType.CERTIFICATE_ISSUED,
        aggregateType: DomainAggregateType.CERTIFICATE,
        aggregateId: certificate.id,
        actorId: userId,
        payload: {
          organizationId,
          certificateId: certificate.id,
          certificateNumber,
          certificateType: certificate.certificateType,
          studentId: certificate.studentId,
          enrollmentId: certificate.enrollmentId,
          courseId: certificate.courseId,
          transcriptVersionId: certificate.transcriptVersionId,
          transcriptNumber: certificate.transcriptNumber,
          issuedAt: now,
          issuedBy: userId,
          checksum,
          actorId: userId,
          reason: reason ?? null,
        },
      });

      return {
        certificateId: certificate.id,
        status: CertificateStatus.ISSUED,
        certificateNumber,
        certificateType: certificate.certificateType,
        transcriptVersionId: certificate.transcriptVersionId,
        transcriptNumber: certificate.transcriptNumber,
        issuedAt: now,
        checksum,
        verificationCode,
        verificationUrl,
        publicStatus,
      };
    });

    // Publish domain events ONLY after the transaction commits.
    for (const event of events) await eventPublisher.publish(event);

    return result;
  }
}
