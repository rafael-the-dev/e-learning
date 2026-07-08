import {
  CertificateEligibilityBlocker,
  CertificateEligibilityWarning,
} from "@/modules/certificates/constants";
import type {
  CertificateEligibilityFacts,
  CertificateEligibilityResult,
} from "@/modules/certificates/types/eligibility-source";

// =============================================================================
// CERTIFICATE ELIGIBILITY ENGINE (Phase 3B) — pure, deterministic domain service
// -----------------------------------------------------------------------------
// The SINGLE authority for whether a certificate may be generated/issued (Rule
// C-3). It evaluates ONLY the `CertificateEligibilityFacts` handed to it (Rule
// C-4) and is a PURE FUNCTION of that input (Rule C-6): given the same facts it
// always returns the same result. It therefore:
//   • does NOT read the DB, repositories, services, or external APIs;
//   • does NOT publish events or write audit;
//   • does NOT read the clock or randomness — `evaluatedAt` comes from the facts
//     (`evaluationContext.evaluatedAt`, else `metadata.loadedAt`);
//   • does NOT recompute any academic/finance value — it only COMPARES copied
//     facts (statuses the Transcript already froze, the finance flag the source
//     loaded, the policy gates).
// Commands consume this result and execute it (Rule C-5); they never re-decide.
// =============================================================================

/** Subject statuses that count as "not pending" for a required subject. Copied
 *  labels only — the engine never recomputes a subject outcome. */
const SUBJECT_PASSING_STATUSES: ReadonlySet<string> = new Set(["PASSED", "COMPLETED", "PROMOTED"]);

/**
 * Evaluate certificate eligibility from facts alone. Pure and deterministic:
 * no I/O, no clock, no randomness, no mutation of the input. `eligible` is exactly
 * `blockingReasons.length === 0`; warnings are informational and never block.
 */
export function evaluateCertificateEligibility(
  facts: CertificateEligibilityFacts
): CertificateEligibilityResult {
  const blockingReasons: CertificateEligibilityBlocker[] = [];
  const warnings: CertificateEligibilityWarning[] = [];

  const { policy, transcript } = facts;

  // A. Policy must be resolved.
  if (!policy) {
    blockingReasons.push(CertificateEligibilityBlocker.POLICY_NOT_FOUND);
  }

  // B–E. Transcript must exist and be ISSUED. One mutually-exclusive reason per
  // status: a certificate is generated from the current issued transcript version.
  if (!transcript) {
    blockingReasons.push(CertificateEligibilityBlocker.TRANSCRIPT_NOT_ISSUED);
  } else if (transcript.transcriptStatus === "REVOKED") {
    blockingReasons.push(CertificateEligibilityBlocker.TRANSCRIPT_REVOKED);
  } else if (transcript.transcriptStatus === "SUPERSEDED") {
    blockingReasons.push(CertificateEligibilityBlocker.TRANSCRIPT_SUPERSEDED);
  } else if (transcript.transcriptStatus !== "ISSUED") {
    blockingReasons.push(CertificateEligibilityBlocker.TRANSCRIPT_NOT_ISSUED);
  }

  // Policy gates — compare copied facts only, never recompute.
  if (policy) {
    // F. Course completion (reads the frozen course-progress snapshot status).
    if (policy.requiresCourseCompleted && transcript) {
      if (transcript.courseProgressSnapshot?.status !== "COMPLETED") {
        blockingReasons.push(CertificateEligibilityBlocker.COURSE_NOT_COMPLETED);
      }
    }

    // G. No pending required subjects (reads copied subject statuses).
    if (policy.requiresNoPendingSubjects && transcript) {
      const hasPendingRequired = transcript.subjects.some(
        (subject) => subject.isRequired && !SUBJECT_PASSING_STATUSES.has(subject.status)
      );
      if (hasPendingRequired) {
        blockingReasons.push(CertificateEligibilityBlocker.PENDING_REQUIRED_SUBJECTS);
      }
    }

    // H. Financial clearance (blocker) — required and not CLEARED (null / NOT_CLEARED
    //    / UNKNOWN all block). The UNKNOWN warning is added separately below.
    if (policy.requiresFinancialClearance) {
      const clearance = facts.financialClearance;
      if (!clearance || clearance.status !== "CLEARED") {
        blockingReasons.push(CertificateEligibilityBlocker.FINANCIAL_CLEARANCE_REQUIRED);
      }
    }

    // I. Manual approval is a hard gate here — never auto-approved.
    if (policy.requiresManualApproval) {
      blockingReasons.push(CertificateEligibilityBlocker.MANUAL_APPROVAL_REQUIRED);
    }
  }

  // Informational: an UNKNOWN finance status is always surfaced. It only *blocks*
  // when the policy requires clearance (handled above); on its own it is a warning.
  if (facts.financialClearance?.status === "UNKNOWN") {
    warnings.push(CertificateEligibilityWarning.FINANCIAL_CLEARANCE_UNKNOWN);
  }

  // J. An active certificate already exists (fact supplied by the source).
  if (facts.administrative.alreadyIssued === true) {
    blockingReasons.push(CertificateEligibilityBlocker.CERTIFICATE_ALREADY_ISSUED);
  }

  // Decision timestamp comes from the facts — never the system clock (Rule C-6).
  const evaluatedAt = facts.evaluationContext?.evaluatedAt ?? facts.metadata.loadedAt;

  return {
    eligible: blockingReasons.length === 0,
    blockingReasons,
    warnings,
    evaluatedPolicyId: policy?.id ?? null,
    evaluatedAt,
    // The input facts, returned unchanged (never mutated).
    facts,
  };
}
