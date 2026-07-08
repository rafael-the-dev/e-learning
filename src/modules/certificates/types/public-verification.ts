// =============================================================================
// CERTIFICATE ENGINE — PUBLIC VERIFICATION CONTRACTS (Phase 7)
// -----------------------------------------------------------------------------
// The privacy-safe shapes the public verification surface produces. The engine
// certifies a FROZEN projection (`CertificateVerification`) and NEVER reads
// Academic Core, the transcript, grades, attendance, or finance here.
//
// Two shapes:
//   • `CertificatePublicSource` — the INTERNAL, composed read (verification row +
//     minimal certificate columns + organization name). It still carries a couple
//     of internal ids so the service can increment the counter; it is NEVER
//     returned to a public caller.
//   • `CertificatePublicVerificationDto` — the OUTWARD response. It exposes ONLY
//     the whitelisted, non-sensitive fields (§3): no transcript pointer/checksum,
//     no certificate checksum, no student document number, no grades/attendance/
//     finance, no internal ids, no audit metadata.
// =============================================================================

/** Internal, composed source for public verification. Not a public response. */
export interface CertificatePublicSource {
  /** Internal — used only to scope the counter increment; never surfaced. */
  organizationId: string;
  /** Internal — used only to scope the counter increment; never surfaced. */
  verificationId: string;
  organizationName: string | null;
  verificationPublicStatus: string;
  certificateStatus: string;
  certificateNumber: string | null;
  certificateType: string;
  issuedAt: Date | null;
  expiresAt: Date | null;
  /** `true` when the certificate is soft-deleted → treated as NOT_FOUND. */
  certificateDeleted: boolean;
  /** Raw stored JSON of the frozen student identity (parsed by the service to
   *  derive a MASKED display name; never returned verbatim). */
  studentSnapshot: string;
  /** Raw stored JSON of the frozen course identity, or null. */
  courseSnapshot: string | null;
}

/** The outward, privacy-safe public verification response (§3). */
export interface CertificatePublicVerificationDto {
  /** Resolved public status: VALID | REVOKED | SUSPENDED | EXPIRED | NOT_FOUND. */
  status: string;
  /** Duplicate of `status` — the projection's resolved public status. */
  publicStatus: string;
  certificateNumber: string | null;
  certificateType: string | null;
  organizationName: string | null;
  /** Masked/minimal (e.g. "João S.") — never the full identity or document number. */
  studentDisplayName: string | null;
  courseName: string | null;
  issuedAt: Date | null;
  expiresAt: Date | null;
}
