import { resultCodeForAttendance } from "./result-entry-shared";

// =============================================================================
// EXAMINATION ENGINE — PHASE 9 RESULT-PUBLICATION SHARED HELPERS
// -----------------------------------------------------------------------------
// Pure, side-effect-free readiness evaluation reused by the Phase-9 publish command.
// It RE-VALIDATES an entire session's official exam FACTS against their authoritative
// sources (the required-candidate roster, each result's own status / resultCode, and
// the current attendance) before the session's results become visible. It NEVER
// re-derives, mutates, grades, decides pass/fail, or touches progression / transcript
// / certificate / appeal / revision. No engine, no persistence, no throw, no event
// bus lives here — the command owns the transaction and raises the domain errors. The
// attendance → resultCode mapping is imported (not duplicated) from the Phase-7
// result-entry shared helpers.
// =============================================================================

/** A minimal view of the ExamResult columns readiness asserts against. */
export interface PublicationResultView {
  id: string;
  examCandidateId: string;
  status: string;
  resultCode: string | null;
}

/** The authoritative facts the readiness verdict is computed from. */
export interface PublicationReadinessFacts {
  /** Ids of the active candidates that MUST each have an ExamResult (REGISTERED). */
  requiredCandidateIds: string[];
  /** Every ExamResult recorded for the session's candidates. */
  results: PublicationResultView[];
  /** The current attendance status per candidate (last-wins). */
  attendanceByCandidate: Record<string, string>;
  /** Whether an active PUBLISHED publication already exists for the session. */
  hasActivePublication: boolean;
}

/** The pure verdict — a set of disjoint blocker id-lists plus the publishable set.
 *  The command decides the ORDER in which a non-empty list becomes a domain error. */
export interface PublicationReadinessVerdict {
  hasActivePublication: boolean;
  hasNothingToPublish: boolean;
  /** Required candidates with no matching result. */
  missingCandidateIds: string[];
  /** Result ids whose status is not APPROVED. */
  nonApprovedResultIds: string[];
  /** Result ids whose recorded resultCode no longer aligns with current attendance. */
  staleResultIds: string[];
  /** Every result id in the session (the set that would be published). */
  publishableResultIds: string[];
}

/**
 * Evaluate publication readiness for a session (pure — NO throw / IO). A session is
 * publishable only when: no active publication exists; there is something to publish;
 * every required (REGISTERED) candidate has a result; every result is APPROVED; and
 * every result's recorded `resultCode` STILL matches the code the current attendance
 * dictates (a stale row means attendance changed after the result was recorded). The
 * command inspects the verdict and raises the first applicable blocker in priority
 * order — this helper only classifies, it decides nothing.
 */
export function evaluatePublicationReadiness(
  facts: PublicationReadinessFacts
): PublicationReadinessVerdict {
  const resultByCandidate = new Map<string, PublicationResultView>();
  for (const r of facts.results) resultByCandidate.set(r.examCandidateId, r);

  // Missing — a required candidate with no result at all.
  const missingCandidateIds = facts.requiredCandidateIds.filter(
    (candidateId) => !resultByCandidate.has(candidateId)
  );

  // Non-approved — any result not in the APPROVED state.
  const nonApprovedResultIds = facts.results
    .filter((r) => r.status !== "APPROVED")
    .map((r) => r.id);

  // Stale — the frozen resultCode no longer agrees with the current attendance fact
  // (missing attendance for the candidate is treated as stale — the fact is unknown).
  const staleResultIds = facts.results
    .filter((r) => {
      const attendanceStatus = facts.attendanceByCandidate[r.examCandidateId];
      if (attendanceStatus === undefined) return true;
      return resultCodeForAttendance(attendanceStatus) !== r.resultCode;
    })
    .map((r) => r.id);

  return {
    hasActivePublication: facts.hasActivePublication,
    hasNothingToPublish: facts.requiredCandidateIds.length === 0 && facts.results.length === 0,
    missingCandidateIds,
    nonApprovedResultIds,
    staleResultIds,
    publishableResultIds: facts.results.map((r) => r.id),
  };
}

// ─── Command DTOs ────────────────────────────────────────────────────────────

/** DTO returned by `PublishExamSessionResultsCommand`. */
export interface PublishExamSessionResultsResult {
  publicationId: string;
  examSessionId: string;
  status: string;
  resultCount: number;
  publishedAt: Date;
  publishedById: string;
}

/** DTO returned by `RetractExamSessionPublicationCommand`. */
export interface RetractExamSessionPublicationResult {
  publicationId: string;
  examSessionId: string;
  publicationStatus: string;
  sessionStatus: string;
  resultCount: number;
  retractedAt: Date;
  retractedById: string;
}
