import type { PrismaClientOrTx } from "@/server/db";
import { BusinessRuleError } from "@/shared/lib/command";
import { findCertificateVerificationByCertificateId } from "@/modules/certificates/repositories/certificate-verification.repository";
import type {
  CertificateRecord,
  CertificateVerificationRecord,
} from "@/modules/certificates/types/repository";

// =============================================================================
// CERTIFICATE LIFECYCLE — SHARED HELPERS (Phase 6)
// -----------------------------------------------------------------------------
// Small internal helpers shared by the post-issue lifecycle commands
// (Revoke / Suspend / Restore) so their verification lookup, domain-event payload
// (§9), and CertificateEvent metadata (§11) stay identical. NOT a command and NOT
// re-exported from the module surface. Contains no lifecycle DECISION — each
// command owns its status guard and conditional write.
// =============================================================================

/** Load the 1:1 verification projection for an issued certificate. An issued
 *  certificate must always have one (created by `IssueCertificateCommand`); its
 *  absence is a data-integrity failure, so we abort rather than silently continue. */
export async function loadVerificationOrThrow(
  organizationId: string,
  certificateId: string,
  tx: PrismaClientOrTx
): Promise<CertificateVerificationRecord> {
  const verification = await findCertificateVerificationByCertificateId(
    { organizationId, certificateId },
    tx
  );
  if (!verification) {
    throw new BusinessRuleError("Certificate has no verification projection to update.");
  }
  return verification;
}

export interface LifecycleTransition {
  previousStatus: string;
  newStatus: string;
  actorId: string;
  reason: string | null;
  occurredAt: Date;
}

/** The common domain-event payload for a lifecycle transition (§9). */
export function buildLifecyclePayload(
  certificate: CertificateRecord,
  t: LifecycleTransition
): Record<string, unknown> {
  return {
    organizationId: certificate.organizationId,
    certificateId: certificate.id,
    certificateNumber: certificate.certificateNumber,
    certificateType: certificate.certificateType,
    studentId: certificate.studentId,
    enrollmentId: certificate.enrollmentId,
    courseId: certificate.courseId,
    transcriptVersionId: certificate.transcriptVersionId,
    transcriptNumber: certificate.transcriptNumber,
    previousStatus: t.previousStatus,
    newStatus: t.newStatus,
    actorId: t.actorId,
    reason: t.reason,
    occurredAt: t.occurredAt,
    checksum: certificate.checksum,
  };
}

/** The common append-only `CertificateEvent.metadata` for a lifecycle transition (§11). */
export function buildLifecycleEventMetadata(
  certificate: CertificateRecord,
  verificationPublicStatus: string
): string {
  return JSON.stringify({
    certificateNumber: certificate.certificateNumber,
    checksum: certificate.checksum,
    transcriptVersionId: certificate.transcriptVersionId,
    transcriptNumber: certificate.transcriptNumber,
    verificationPublicStatus,
  });
}
