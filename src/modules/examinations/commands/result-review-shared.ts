import { BusinessRuleError } from "@/shared/lib/command";
import { ExamResultCode } from "@/modules/examinations/constants";
import { resultCodeForAttendance } from "./result-entry-shared";

// =============================================================================
// EXAMINATION ENGINE — PHASE 8 RESULT-REVIEW SHARED HELPERS
// -----------------------------------------------------------------------------
// Pure, side-effect-free helpers reused by the Phase-8 review + approve commands.
// They RE-VALIDATE an already-recorded official exam FACT against its authoritative
// sources (the row's own columns + the current attendance) before advancing it to
// REVIEWED / APPROVED — they never re-derive, mutate, publish, grade, decide
// pass/fail, or touch progression / transcript / certificate / appeal / revision.
// No engine, no persistence, no event bus lives here — the command owns the
// transaction. The attendance → resultCode mapping is imported (not duplicated)
// from the Phase-7 result-entry shared helpers.
// =============================================================================

/** A minimal view of the ExamResult columns these helpers assert against. */
interface ResultConsistencyView {
  score: number | null;
  maxScore: number;
  normalizedScore: number | null;
  resultCode: string | null;
}

/** A minimal view of the attendance columns these helpers assert against. */
interface AttendanceAlignmentView {
  status: string;
}

/**
 * Internal-consistency check (no re-derivation — the row must already agree):
 * a SCORED result carries score + maxScore + normalizedScore all non-null; every
 * other code forces score + normalizedScore null. A contradiction means the row
 * was never a valid fact and is rejected (`RESULT_INCOMPLETE`).
 */
export function assertResultInternallyConsistent(result: ResultConsistencyView): void {
  const isScored = result.resultCode === ExamResultCode.SCORED;
  const consistent = isScored
    ? result.score !== null && result.maxScore !== null && result.normalizedScore !== null
    : result.score === null && result.normalizedScore === null;
  if (!consistent) {
    throw new BusinessRuleError("RESULT_INCOMPLETE", { resultCode: result.resultCode });
  }
}

/**
 * Staleness gate — the recorded `resultCode` must STILL match the code the current
 * attendance fact dictates. If attendance was corrected after the row was recorded
 * (e.g. PRESENT → ABSENT) the frozen code would contradict the authoritative fact;
 * that review / approval is rejected (`RESULT_STALE`), forcing an explicit
 * return-for-correction + update-draft first. Never re-derives / mutates.
 */
export function assertAttendanceStillAligns(
  result: ResultConsistencyView,
  attendance: AttendanceAlignmentView
): void {
  const expectedResultCode = resultCodeForAttendance(attendance.status);
  if (expectedResultCode !== result.resultCode) {
    throw new BusinessRuleError("RESULT_STALE", {
      attendanceStatus: attendance.status,
      expectedResultCode,
      currentResultCode: result.resultCode,
    });
  }
}

// ─── Command DTOs ────────────────────────────────────────────────────────────

/** DTO returned by `ReviewExamResultCommand`. */
export interface ReviewExamResultResult {
  examResultId: string;
  status: string;
  reviewedById: string;
  reviewedAt: Date;
}

/** DTO returned by `ApproveExamResultCommand`. */
export interface ApproveExamResultResult {
  examResultId: string;
  status: string;
  approvedById: string;
  approvedAt: Date;
}

/** DTO returned by `ReturnExamResultForCorrectionCommand`. */
export interface ReturnForCorrectionResult {
  examResultId: string;
  status: string;
  returnedAt: Date;
  reason: string;
}
