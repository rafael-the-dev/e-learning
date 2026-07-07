// =============================================================================
// CERTIFICATE ENGINE — ELIGIBILITY SOURCE CONTRACT (Phase 3A)
// -----------------------------------------------------------------------------
// The single input/output contract of `CertificateEligibilitySource`, the read
// aggregation façade the future `CertificateEligibilityEngine` depends on. The
// engine consumes ONLY `CertificateEligibilityFacts`; it never touches Prisma,
// the transcript schema, repositories, finance, or org-settings storage.
//
// Every field here is a COPIED FACT — never a derived/evaluated value. There is
// deliberately no `eligible` flag and no boolean verdict: this layer aggregates,
// it does not decide.
// =============================================================================

import type { TranscriptCertificateSourceDto } from "./transcript-source";

/** What to aggregate facts for. `transcriptVersionId`/`courseId`/`policyId` are
 *  optional; the source loads what it can and returns `null` for the rest. */
export interface CertificateEligibilitySourceInput {
  organizationId: string;
  studentId: string;
  certificateType: string;
  transcriptVersionId?: string | null;
  courseId?: string | null;
  policyId?: string | null;
}

/** Policy gates/settings copied verbatim from the resolved policy record. These
 *  are FACTS the engine will read — this layer never evaluates them. */
export interface CertificatePolicyFacts {
  id: string;
  certificateType: string;
  requiresIssuedTranscript: boolean;
  requiresCourseCompleted: boolean;
  requiresNoPendingSubjects: boolean;
  requiresFinancialClearance: boolean;
  requiresManualApproval: boolean;
  autoIssueOnTranscriptIssued: boolean;
  validityMonths: number | null;
  staleAction: string;
}

/** Non-academic finance clearance read-model result (D-3). NOT implemented in
 *  Phase 3A — the source always returns `null` for now; the shape is fixed here so
 *  a future finance phase can populate it without changing the façade contract. */
export interface FinancialClearanceFacts {
  status: string;
  checkedAt: Date | null;
  reference: string | null;
}

/** Administrative facts (disciplinary actions, org restrictions, external
 *  registries, …). Empty (`{}`) in Phase 3A; future phases widen this type. */
export type AdministrativeFacts = Record<string, never>;

export interface CertificateEligibilityFactsMetadata {
  /** When the façade assembled this fact set. */
  loadedAt: Date;
  /** Contract version of the façade output, for downstream compatibility checks. */
  sourceVersion: string;
}

/** The complete, decision-free fact set for one eligibility question. `policy`
 *  and `transcript` are `null` when not found/not requested; `financialClearance`
 *  is `null` this phase; `administrative` is `{}`. No derived or boolean verdict. */
export interface CertificateEligibilityFacts {
  policy: CertificatePolicyFacts | null;
  transcript: TranscriptCertificateSourceDto | null;
  financialClearance: FinancialClearanceFacts | null;
  administrative: AdministrativeFacts;
  metadata: CertificateEligibilityFactsMetadata;
}
