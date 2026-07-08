import type {
  CertificateMinistryPayload,
  CertificateMinistrySourceDto,
} from "@/modules/certificates/types/ministry";

// =============================================================================
// CERTIFICATE MINISTRY PAYLOAD BUILDER (Phase 11) — pure, no side effects
// -----------------------------------------------------------------------------
// Normalizes a (already minimized) certificate source into the official ministry
// payload. It is a PURE function: no DB, no API, no storage, no audit, no event,
// no clock. It COPIES only the whitelisted official-verification fields (§4/§11) —
// there is deliberately no path here for a transcript pointer/checksum, grade,
// attendance, finance reference, internal id, raw snapshot, or audit metadata.
// Dates are emitted as ISO-8601 strings so the serialized artifact is deterministic.
// =============================================================================

/** The exact set of keys the ministry payload exposes (documented allow-list, §11). */
export const MINISTRY_PAYLOAD_FIELDS = [
  "certificateNumber",
  "certificateType",
  "studentName",
  "courseName",
  "organizationName",
  "issuedAt",
  "expiresAt",
  "verificationCode",
  "verificationUrl",
  "certificateChecksum",
  "status",
] as const;

function toIso(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}

/** Build the normalized ministry payload from the minimized source. Pure. */
export function buildCertificateMinistryPayload(
  source: CertificateMinistrySourceDto
): CertificateMinistryPayload {
  // Explicit field-by-field copy (never a spread) so an unexpected source field can
  // never leak into the official payload.
  return {
    certificateNumber: source.certificateNumber,
    certificateType: source.certificateType,
    studentName: source.studentName,
    courseName: source.courseName,
    organizationName: source.organizationName,
    issuedAt: toIso(source.issuedAt),
    expiresAt: toIso(source.expiresAt),
    verificationCode: source.verificationCode,
    verificationUrl: source.verificationUrl,
    certificateChecksum: source.certificateChecksum,
    status: source.status,
  };
}
