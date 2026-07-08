// =============================================================================
// CERTIFICATE ENGINE — CONSTANTS (const objects, no native enums)
// -----------------------------------------------------------------------------
// Phase 0: Foundation Contracts. Domain vocabularies as `const` objects + derived
// string-literal types, per the project convention (SQL Server has no native
// enums). Values are the canonical domain strings that travel in payloads/DB
// columns and are NEVER translated (translation happens only at the render layer).
//
// The Certificate Engine is a downstream consumer of the Transcript Engine
// (ADR-002): it certifies frozen transcript facts and never recalculates academic
// state. These constants describe certificate-domain concepts only; no academic
// vocabulary is redefined here.
// =============================================================================

/** Certificate types supported by the engine. Classification (official vs
 *  informal statement) is a policy/seed concern, not encoded in the value. */
export const CertificateType = {
  COURSE_COMPLETION: "COURSE_COMPLETION",
  LEVEL_COMPLETION: "LEVEL_COMPLETION",
  PARTICIPATION: "PARTICIPATION",
  ATTENDANCE: "ATTENDANCE",
  ACHIEVEMENT: "ACHIEVEMENT",
  PROFESSIONAL_TRAINING: "PROFESSIONAL_TRAINING",
  DRIVING_SCHOOL: "DRIVING_SCHOOL",
  LANGUAGE_COURSE: "LANGUAGE_COURSE",
  IT_COURSE: "IT_COURSE",
  DESIGN_COURSE: "DESIGN_COURSE",
} as const;
export type CertificateType = (typeof CertificateType)[keyof typeof CertificateType];

/** Certificate lifecycle status. `REVOKED` is terminal; `SUSPENDED`/`STALE` are
 *  recoverable (D-4/D-6). Expiry is NOT a status — it lives on the verification
 *  projection only. Transitions are enforced by future commands, never here. */
export const CertificateStatus = {
  DRAFT: "DRAFT",
  PENDING_APPROVAL: "PENDING_APPROVAL",
  ISSUED: "ISSUED",
  SUSPENDED: "SUSPENDED",
  REVOKED: "REVOKED",
  STALE: "STALE",
} as const;
export type CertificateStatus = (typeof CertificateStatus)[keyof typeof CertificateStatus];

/** Certificate policy lifecycle. */
export const CertificatePolicyStatus = {
  ACTIVE: "ACTIVE",
  INACTIVE: "INACTIVE",
  ARCHIVED: "ARCHIVED",
} as const;
export type CertificatePolicyStatus =
  (typeof CertificatePolicyStatus)[keyof typeof CertificatePolicyStatus];

/** Certificate template lifecycle. */
export const CertificateTemplateStatus = {
  ACTIVE: "ACTIVE",
  INACTIVE: "INACTIVE",
  ARCHIVED: "ARCHIVED",
} as const;
export type CertificateTemplateStatus =
  (typeof CertificateTemplateStatus)[keyof typeof CertificateTemplateStatus];

/** Certificate request workflow status. Mirrors the transcript request lifecycle. */
export const CertificateRequestStatus = {
  PENDING: "PENDING",
  APPROVED: "APPROVED",
  REJECTED: "REJECTED",
  FULFILLED: "FULFILLED",
  CANCELLED: "CANCELLED",
} as const;
export type CertificateRequestStatus =
  (typeof CertificateRequestStatus)[keyof typeof CertificateRequestStatus];

/** Public verification status — a PROJECTION of certificate state, kept in sync by
 *  future lifecycle commands. `EXPIRED` reflects `expiresAt` passing while the
 *  certificate itself stays ISSUED (D-6). `NOT_FOUND` is the safe response for an
 *  unknown code or a not-yet-issued (DRAFT/PENDING_APPROVAL) certificate. */
export const CertificateVerificationPublicStatus = {
  VALID: "VALID",
  REVOKED: "REVOKED",
  SUSPENDED: "SUSPENDED",
  EXPIRED: "EXPIRED",
  NOT_FOUND: "NOT_FOUND",
} as const;
export type CertificateVerificationPublicStatus =
  (typeof CertificateVerificationPublicStatus)[keyof typeof CertificateVerificationPublicStatus];

/** Export artifact channel. */
export const CertificateExportType = {
  PDF: "PDF",
  API: "API",
  MINISTRY: "MINISTRY",
} as const;
export type CertificateExportType =
  (typeof CertificateExportType)[keyof typeof CertificateExportType];

/** Export artifact lifecycle. */
export const CertificateExportStatus = {
  PENDING: "PENDING",
  READY: "READY",
  FAILED: "FAILED",
} as const;
export type CertificateExportStatus =
  (typeof CertificateExportStatus)[keyof typeof CertificateExportStatus];

/** Reasons a certificate cannot be issued. Each is derived from a FROZEN transcript
 *  fact or an administrative gate — never from re-running an academic rule (ADR-002).
 *  `MANUAL_APPROVAL_REQUIRED` routes to PENDING_APPROVAL rather than a hard block. */
export const CertificateEligibilityBlocker = {
  POLICY_NOT_FOUND: "POLICY_NOT_FOUND",
  TRANSCRIPT_NOT_ISSUED: "TRANSCRIPT_NOT_ISSUED",
  TRANSCRIPT_REVOKED: "TRANSCRIPT_REVOKED",
  TRANSCRIPT_SUPERSEDED: "TRANSCRIPT_SUPERSEDED",
  COURSE_NOT_COMPLETED: "COURSE_NOT_COMPLETED",
  PENDING_REQUIRED_SUBJECTS: "PENDING_REQUIRED_SUBJECTS",
  FINANCIAL_CLEARANCE_REQUIRED: "FINANCIAL_CLEARANCE_REQUIRED",
  MANUAL_APPROVAL_REQUIRED: "MANUAL_APPROVAL_REQUIRED",
  CERTIFICATE_ALREADY_ISSUED: "CERTIFICATE_ALREADY_ISSUED",
} as const;
export type CertificateEligibilityBlocker =
  (typeof CertificateEligibilityBlocker)[keyof typeof CertificateEligibilityBlocker];

/** Informational, NON-blocking eligibility signals. Warnings never change
 *  `eligible`; they surface conditions a caller may want to act on (e.g. surface a
 *  notice, prompt manual approval). The engine sets them purely from copied facts. */
export const CertificateEligibilityWarning = {
  TRANSCRIPT_SUPERSEDED_WARNING: "TRANSCRIPT_SUPERSEDED_WARNING",
  TRANSCRIPT_STALE_WARNING: "TRANSCRIPT_STALE_WARNING",
  CERTIFICATE_EXPIRING_SOON: "CERTIFICATE_EXPIRING_SOON",
  FINANCIAL_CLEARANCE_UNKNOWN: "FINANCIAL_CLEARANCE_UNKNOWN",
  MANUAL_APPROVAL_REQUIRED_WARNING: "MANUAL_APPROVAL_REQUIRED_WARNING",
} as const;
export type CertificateEligibilityWarning =
  (typeof CertificateEligibilityWarning)[keyof typeof CertificateEligibilityWarning];

/** Snapshot of a NON-ACADEMIC finance clearance check (D-3). Evaluated externally
 *  against a finance read-model and FROZEN onto the certificate; never recomputed.
 *  Finance never enters Academic Core / Grade / Transcript engines. */
export const FinancialClearanceStatus = {
  NOT_REQUIRED: "NOT_REQUIRED",
  CLEARED: "CLEARED",
  NOT_CLEARED: "NOT_CLEARED",
  UNKNOWN: "UNKNOWN",
} as const;
export type FinancialClearanceStatus =
  (typeof FinancialClearanceStatus)[keyof typeof FinancialClearanceStatus];

/** Why a certificate was marked STALE/SUSPENDED. The transcript-driven reasons are
 *  set by the future transcript-invalidation subscriber; policy/template changes are
 *  administrative. A stale certificate is never silently regenerated or re-issued. */
export const StaleReason = {
  TRANSCRIPT_SUPERSEDED: "TRANSCRIPT_SUPERSEDED",
  TRANSCRIPT_REVOKED: "TRANSCRIPT_REVOKED",
  TRANSCRIPT_MARKED_STALE: "TRANSCRIPT_MARKED_STALE",
  POLICY_CHANGED: "POLICY_CHANGED",
  TEMPLATE_CHANGED: "TEMPLATE_CHANGED",
} as const;
export type StaleReason = (typeof StaleReason)[keyof typeof StaleReason];

/** Human-facing certificate number format prefix. The visible number is
 *  `CERT-YYYY-NNNNNN` and deliberately excludes the certificate type (D-2). */
export const CERTIFICATE_NUMBER_PREFIX = "CERT";

/** Bumped when the certificate checksum payload SHAPE changes in a way that would
 *  alter the canonical content for identical inputs. Kept OUT of the checksummed
 *  content (transport/envelope concern), mirroring SNAPSHOT_BUILDER_VERSION. */
export const CERTIFICATE_CHECKSUM_VERSION = "1.0.0";
