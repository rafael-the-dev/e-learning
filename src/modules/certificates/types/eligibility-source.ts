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

import type {
  CertificateEligibilityBlocker,
  CertificateEligibilityWarning,
} from "@/modules/certificates/constants";
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
 *  registries, …). Loaded by the source, never derived by the engine. Mostly empty
 *  in Phase 3A; future phases widen this type. */
export interface AdministrativeFacts {
  /** Set by the source when an active certificate already exists for this
   *  `(transcriptVersionId, certificateType)`. Absent/`false` → none known. The
   *  engine only READS this flag (it never queries to discover it). */
  alreadyIssued?: boolean;
}

/** Optional decision context. When present, the engine uses `evaluatedAt` as the
 *  decision timestamp; otherwise it falls back to `metadata.loadedAt`. Supplied by
 *  the caller/source — the engine never reads the clock itself (Rule C-6). */
export interface CertificateEvaluationContext {
  evaluatedAt: Date;
}

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
  /** Optional; when absent the engine uses `metadata.loadedAt` as `evaluatedAt`. */
  evaluationContext?: CertificateEvaluationContext;
}

// ─── Engine output (Phase 3B) ─────────────────────────────────────────────────

/** The deterministic verdict produced by `CertificateEligibilityEngine` from a
 *  `CertificateEligibilityFacts` (Rules C-3…C-6). `eligible` is exactly
 *  `blockingReasons.length === 0`; warnings never affect it. `facts` is the input,
 *  returned unchanged (never mutated). */
export interface CertificateEligibilityResult {
  eligible: boolean;
  blockingReasons: CertificateEligibilityBlocker[];
  warnings: CertificateEligibilityWarning[];
  /** Non-blocking gate: `true` when the resolved policy sets `requiresManualApproval`.
   *  Manual approval NEVER makes the certificate ineligible — an eligible certificate
   *  with `requiresApproval === true` must route to `PENDING_APPROVAL` (a human sign-off
   *  before issue) instead of being issued directly (§14/§15, D-5, Rule C-5). Commands
   *  read this flag to choose DRAFT vs PENDING_APPROVAL; they never re-decide it. */
  requiresApproval: boolean;
  evaluatedPolicyId: string | null;
  evaluatedAt: Date;
  facts: CertificateEligibilityFacts;
}
