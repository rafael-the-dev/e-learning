// =============================================================================
// CERTIFICATE ENGINE — FOUNDATION TYPES (Phase 0)
// -----------------------------------------------------------------------------
// Domain-level contract types only. No persisted record types yet (Phase 1 owns
// the data model) and no client DTOs (a later phase). These are the shared shapes
// the future eligibility/generation flows will produce and consume.
//
// The Certificate Engine never recalculates academic facts (ADR-002); the types
// here describe certificate-domain results, not academic derivations.
// =============================================================================

import type {
  CertificateEligibilityBlocker,
  CertificateType,
  FinancialClearanceStatus,
} from "@/modules/certificates/constants";

/** Snapshot of a NON-ACADEMIC finance clearance check (D-3). Frozen onto the
 *  certificate at generation; never recomputed afterwards. */
export interface FinancialClearanceSnapshot {
  status: FinancialClearanceStatus;
  checkedAt: Date | null;
  /** Optional finance-side reference (e.g. clearance/statement id). Pointer, not FK. */
  reference: string | null;
}

/** Result of evaluating whether a certificate may be issued against an ISSUED
 *  transcript version + policy. Read-only; produced by the future eligibility
 *  command. `warnings` carries soft gates such as MANUAL_APPROVAL_REQUIRED. */
export interface CertificateEligibilityResult {
  eligible: boolean;
  blockers: CertificateEligibilityBlocker[];
  warnings: CertificateEligibilityBlocker[];
  transcriptVersionId: string;
  policyId: string | null;
  certificateType: CertificateType | string;
  /** Null when the policy does not require a finance check. */
  financialClearance: FinancialClearanceSnapshot | null;
}

// The checksum contract type (`CertificateChecksumInput`) lives in
// `../lib/certificate-checksum` and is re-exported from the module root
// (`@/modules/certificates`). It is intentionally NOT re-exported here to avoid a
// duplicate `export *` binding at the module root.
