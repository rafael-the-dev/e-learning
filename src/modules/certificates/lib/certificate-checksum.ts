import { canonicalize, contentChecksum } from "@/shared/lib/checksum";
import type { CertificateType, FinancialClearanceStatus } from "@/modules/certificates/constants";

// =============================================================================
// CERTIFICATE CHECKSUM CONTRACT (Phase 0)
// -----------------------------------------------------------------------------
// Defines the CONTENT-ONLY canonical input shape for a certificate's checksum and
// delegates hashing to the shared `@/shared/lib/checksum` utility (sorted keys,
// Decimal→number, Date→ISO, undefined-omission, null-preservation, array-order
// preservation). This module does NOT reimplement canonicalization.
//
// CONTENT-ONLY (ADR-002 / D-7): this is a deterministic content digest, NOT a
// tamper-evident signature. No secret, no organization key, and no PDF/file bytes
// are mixed in. A cryptographic organization signature is a separate future phase
// and must NOT reuse this digest as if it were a signature (same discipline as
// the transcript engine and `@/shared/lib/checksum`).
//
// The checksum is generated ONCE at issue time (a later phase) and never
// recomputed — an immutable certificate has immutable content. Phase 0 ships the
// contract + helpers and their tests; no command computes a checksum yet.
//
// DELIBERATELY EXCLUDED from the checksum (envelope/transport): verification
// counters/timestamps, export rows, `updatedAt`, and stale/suspend bookkeeping.
// The checksummed set is exactly the fields listed in `CertificateChecksumInput`.
// =============================================================================

/**
 * The exact content that identifies an issued certificate. Frozen student/course
 * snapshots are passed as already-projected JSON-like objects (the values the
 * certificate froze), not live records. `issuedAt` IS included (D-7): a certificate
 * is a point-in-time official act, so two issues of identical content still differ.
 */
export interface CertificateChecksumInput {
  certificateNumber: string;
  transcriptVersionId: string;
  transcriptChecksum: string;
  /** Frozen student identity projection (as stored in `contentSnapshot`). */
  studentSnapshot: Record<string, unknown>;
  /** Frozen course identity projection, or null for non-course certificates. */
  courseSnapshot: Record<string, unknown> | null;
  /** Frozen structured statement of what was certified (completion status / issue
   *  basis), as stored in `issueBasisSnapshot`. Part of the certificate's identity
   *  (§20), so it is checksummed. */
  issueBasisSnapshot: Record<string, unknown>;
  certificateType: CertificateType | string;
  issuedAt: Date;
  policyId: string;
  /** Null when no template was resolved. */
  templateId: string | null;
  /** Snapshot of the administrative finance-clearance result (D-3). */
  financialClearanceStatus: FinancialClearanceStatus | string;
}

/**
 * Content-only projection of the checksum input. Values are copied by reference (no
 * coercion) so `Date`s and Decimal-like values reach the canonicalizer intact and
 * are normalized there. Key order is irrelevant (the canonicalizer sorts keys).
 */
export function toCanonicalCertificateContent(
  input: CertificateChecksumInput
): Record<string, unknown> {
  return {
    certificateNumber: input.certificateNumber,
    transcriptVersionId: input.transcriptVersionId,
    transcriptChecksum: input.transcriptChecksum,
    student: input.studentSnapshot,
    course: input.courseSnapshot,
    issueBasis: input.issueBasisSnapshot,
    certificateType: input.certificateType,
    issuedAt: input.issuedAt,
    policyId: input.policyId,
    templateId: input.templateId,
    financialClearanceStatus: input.financialClearanceStatus,
  };
}

/** Deterministic canonical string of a certificate's content. Stable across calls
 *  and independent of object-key insertion order. */
export function canonicalCertificateString(input: CertificateChecksumInput): string {
  return canonicalize(toCanonicalCertificateContent(input));
}

/** Lowercase-hex SHA-256 of the certificate's canonical content. CONTENT-ONLY.
 *  The future issue command stores this on the certificate row. */
export function certificateContentChecksum(input: CertificateChecksumInput): string {
  return contentChecksum(toCanonicalCertificateContent(input));
}
