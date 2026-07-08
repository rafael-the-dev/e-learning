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

import type { FinancialClearanceStatus } from "@/modules/certificates/constants";

/** Snapshot of a NON-ACADEMIC finance clearance check (D-3). Frozen onto the
 *  certificate at generation; never recomputed afterwards. */
export interface FinancialClearanceSnapshot {
  status: FinancialClearanceStatus;
  checkedAt: Date | null;
  /** Optional finance-side reference (e.g. clearance/statement id). Pointer, not FK. */
  reference: string | null;
}

// The eligibility RESULT contract (`CertificateEligibilityResult`) is defined in
// `./eligibility-source` alongside the facts it embeds, and re-exported below.

// The checksum contract type (`CertificateChecksumInput`) lives in
// `../lib/certificate-checksum` and is re-exported from the module root
// (`@/modules/certificates`). It is intentionally NOT re-exported here to avoid a
// duplicate `export *` binding at the module root.

// Transcript source DTOs — the read contract the Certificate Engine consumes in
// place of the Transcript Engine's persistence model (Phase 2, Part A).
export * from "./transcript-source";

// Repository record & filter types — persistence-shaped types the Phase 2B
// certificate-model repositories return and accept.
export * from "./repository";

// Eligibility source contract — the input/output of the Phase 3A read-aggregation
// façade consumed by the future eligibility engine.
export * from "./eligibility-source";
