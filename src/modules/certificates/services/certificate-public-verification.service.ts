import type { PrismaClientOrTx } from "@/server/db";
import { CertificateStatus, CertificateVerificationPublicStatus } from "@/modules/certificates/constants";
import { findPublicVerificationByCode } from "@/modules/certificates/repositories/certificate-public-verification.repository";
import { incrementVerificationCount } from "@/modules/certificates/repositories/certificate-verification.repository";
import { readCourseName, readStudentFullName } from "@/modules/certificates/lib/certificate-snapshot";
import type {
  CertificatePublicSource,
  CertificatePublicVerificationDto,
} from "@/modules/certificates/types/public-verification";

// =============================================================================
// VERIFY CERTIFICATE (PUBLIC) SERVICE (Phase 7)
// -----------------------------------------------------------------------------
// The unauthenticated "is this certificate real?" lookup. It reads ONLY the
// `CertificateVerification` projection (+ minimal certificate columns + the org
// name) and returns a privacy-safe DTO. It NEVER reads Academic Core, the
// transcript, grades, attendance, or finance, and NEVER recomputes validity — the
// status is a pure function of the frozen certificate status + projection (§4).
//
// Privacy (§3): the response exposes only whitelisted fields. The student name is
// MASKED ("João S."); the transcript pointer/checksum, certificate checksum,
// document number, internal ids, and audit metadata never leave this layer.
//
// NOT_FOUND is returned for an unknown code, a soft-deleted certificate, and any
// not-publicly-issued status (DRAFT / PENDING_APPROVAL / STALE) — so existence is
// never leaked and a non-issued certificate can never read as VALID.
// =============================================================================

const NOT_FOUND_DTO: CertificatePublicVerificationDto = {
  status: CertificateVerificationPublicStatus.NOT_FOUND,
  publicStatus: CertificateVerificationPublicStatus.NOT_FOUND,
  certificateNumber: null,
  certificateType: null,
  organizationName: null,
  studentDisplayName: null,
  courseName: null,
  issuedAt: null,
  expiresAt: null,
};

export interface VerifyCertificatePublicInput {
  verificationCode: string;
  /** Injected clock; unused by the mapping today but reserved for the counter. */
  now?: Date;
}

/** Resolve the public status from the FROZEN certificate status + projection (§4).
 *  Order matters: terminal/suspended states win, then not-publicly-issued states
 *  map to NOT_FOUND, then the expiry projection, else VALID. No academic recompute. */
function resolvePublicStatus(source: CertificatePublicSource): string {
  if (source.certificateDeleted) return CertificateVerificationPublicStatus.NOT_FOUND;
  if (source.certificateStatus === CertificateStatus.REVOKED) {
    return CertificateVerificationPublicStatus.REVOKED;
  }
  if (source.certificateStatus === CertificateStatus.SUSPENDED) {
    return CertificateVerificationPublicStatus.SUSPENDED;
  }
  // Only an ISSUED certificate is ever publicly visible as VALID/EXPIRED. DRAFT,
  // PENDING_APPROVAL and STALE are never public → NOT_FOUND (hardening over the
  // bare §4 list; STALE handling itself is a future phase).
  if (source.certificateStatus !== CertificateStatus.ISSUED) {
    return CertificateVerificationPublicStatus.NOT_FOUND;
  }
  if (source.verificationPublicStatus === CertificateVerificationPublicStatus.EXPIRED) {
    return CertificateVerificationPublicStatus.EXPIRED;
  }
  return CertificateVerificationPublicStatus.VALID;
}

/** Mask a full name to first-name + trailing initials ("Maria Santos" → "Maria S.").
 *  Uses the shared frozen-snapshot reader, then masks. */
function maskStudentName(studentSnapshotJson: string): string | null {
  const fullName = readStudentFullName(studentSnapshotJson);
  if (!fullName) return null;

  const [first, ...rest] = fullName.split(/\s+/);
  if (rest.length === 0) return first;
  const initials = rest.map((part) => `${part.charAt(0).toUpperCase()}.`).join(" ");
  return `${first} ${initials}`;
}

export class VerifyCertificatePublicService {
  async verify(
    input: VerifyCertificatePublicInput,
    client?: PrismaClientOrTx
  ): Promise<CertificatePublicVerificationDto> {
    const source = await findPublicVerificationByCode(
      { verificationCode: input.verificationCode },
      client
    );

    // Unknown code (or a data-integrity hole) → NOT_FOUND, no counter movement.
    if (!source) return NOT_FOUND_DTO;

    const status = resolvePublicStatus(source);

    // Soft-deleted / not-publicly-issued → NOT_FOUND: never leak existence, never
    // count the hit.
    if (status === CertificateVerificationPublicStatus.NOT_FOUND) return NOT_FOUND_DTO;

    // Successful lookup (§5): record the hit. Best-effort — a counter write must
    // never deny a legitimate verification, so failures are swallowed.
    const now = input.now ?? new Date();
    try {
      await incrementVerificationCount(
        { id: source.verificationId, organizationId: source.organizationId, lastVerifiedAt: now },
        client
      );
    } catch {
      // telemetry only; ignore
    }

    return {
      status,
      publicStatus: status,
      certificateNumber: source.certificateNumber,
      certificateType: source.certificateType,
      organizationName: source.organizationName,
      studentDisplayName: maskStudentName(source.studentSnapshot),
      courseName: readCourseName(source.courseSnapshot),
      issuedAt: source.issuedAt,
      expiresAt: source.expiresAt,
    };
  }
}

export const verifyCertificatePublicService = new VerifyCertificatePublicService();
