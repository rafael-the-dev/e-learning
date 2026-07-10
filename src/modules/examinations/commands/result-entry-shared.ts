import {
  AuthorizationError,
  BusinessRuleError,
  NotFoundError,
  ValidationError,
} from "@/shared/lib/command";
import {
  ExamAttendanceStatus,
  ExamResultCode,
} from "@/modules/examinations/constants";

// =============================================================================
// EXAMINATION ENGINE — PHASE 7 RESULT-ENTRY SHARED HELPERS
// -----------------------------------------------------------------------------
// Pure, side-effect-free helpers reused by the Phase-7 result-entry commands.
// They derive the OFFICIAL EXAM FACT ONLY — the attendance status drives the
// resultCode, and (for a SCORED result) the raw score is normalized to a 0–100
// percentage of maxScore. This is NOT a final subject grade, NOT a pass/fail
// decision, and NEVER touches progression / transcript / certificate. No engine,
// no persistence, no event bus lives here — the command owns the transaction.
//
// Attendance → resultCode (deterministic, §9):
//   PRESENT | LATE → SCORED       (numeric score required, 0 ≤ score ≤ maxScore)
//   ABSENT         → ABSENT       (score forced null)
//   EXCUSED        → EXCUSED      (score forced null)
//   DISQUALIFIED   → DISQUALIFIED (score forced null, reason required)
// =============================================================================

/** normalizedScore = round((score / maxScore) * 100) to 2 decimal places.
 *  Deterministic exam-score normalization ONLY (e.g. 45/60 → 75.00). It is NOT a
 *  subject grade and carries NO pass/fail meaning. */
export function normalizeExamScore(score: number, maxScore: number): number {
  return Math.round((score / maxScore) * 10000) / 100;
}

/** The resultCode the attendance fact dictates. Never a free choice. */
export function resultCodeForAttendance(attendanceStatus: string): string {
  switch (attendanceStatus) {
    case ExamAttendanceStatus.PRESENT:
    case ExamAttendanceStatus.LATE:
      return ExamResultCode.SCORED;
    case ExamAttendanceStatus.ABSENT:
      return ExamResultCode.ABSENT;
    case ExamAttendanceStatus.EXCUSED:
      return ExamResultCode.EXCUSED;
    case ExamAttendanceStatus.DISQUALIFIED:
      return ExamResultCode.DISQUALIFIED;
    default:
      throw new BusinessRuleError("ATTENDANCE_STATUS_UNSUPPORTED", { attendanceStatus });
  }
}

export interface DeriveResultFactsInput {
  attendanceStatus: string;
  /** Client-supplied score (SCORED only); ignored / forced null otherwise. */
  score?: number | null;
  maxScore: number;
  /** Client-supplied resultCode — must MATCH the attendance-derived one. */
  resultCode?: string;
  /** Justification (required for a DISQUALIFIED result). */
  reason?: string | null;
}

export interface DerivedResultFacts {
  resultCode: string;
  score: number | null;
  maxScore: number;
  normalizedScore: number | null;
}

/**
 * Derive + validate the official exam facts from the recorded attendance. The
 * attendance status is authoritative for the resultCode; a client-supplied
 * `resultCode` may only CONFIRM it (a mismatch is rejected). For a SCORED result
 * the score is mandatory and bounded, then normalized; every other code forces a
 * null score / normalizedScore. Decides nothing about pass/fail or progression.
 */
export function deriveResultFacts(input: DeriveResultFactsInput): DerivedResultFacts {
  const resultCode = resultCodeForAttendance(input.attendanceStatus);

  if (input.resultCode !== undefined && input.resultCode !== resultCode) {
    throw new BusinessRuleError("RESULT_CODE_MISMATCH", {
      attendanceStatus: input.attendanceStatus,
      expectedResultCode: resultCode,
      providedResultCode: input.resultCode,
    });
  }

  if (!(input.maxScore > 0)) {
    throw new BusinessRuleError("MAX_SCORE_INVALID", { maxScore: input.maxScore });
  }

  if (resultCode === ExamResultCode.SCORED) {
    const score = input.score;
    if (score === undefined || score === null) {
      throw new BusinessRuleError("SCORE_REQUIRED", { resultCode });
    }
    if (score < 0 || score > input.maxScore) {
      throw new BusinessRuleError("SCORE_OUT_OF_RANGE", {
        score,
        maxScore: input.maxScore,
      });
    }
    return {
      resultCode,
      score,
      maxScore: input.maxScore,
      normalizedScore: normalizeExamScore(score, input.maxScore),
    };
  }

  // Non-SCORED: score is forced null; DISQUALIFIED requires a reason.
  if (resultCode === ExamResultCode.DISQUALIFIED && !input.reason) {
    throw new BusinessRuleError("REASON_REQUIRED", { resultCode });
  }
  return { resultCode, score: null, maxScore: input.maxScore, normalizedScore: null };
}

// ─── Bulk per-item error mapping ─────────────────────────────────────────────

/** Per-item outcome in a bulk result-entry run. */
export interface BulkResultItemOutcome {
  ok: boolean;
  code?: string;
  message?: string;
}

/** Map an error into a stable `{ code, message }`: domain errors keep their code
 *  + message; anything unexpected is sanitised to a generic INTERNAL_ERROR. */
export function toResultItemError(err: unknown): { code: string; message: string } {
  if (err instanceof BusinessRuleError) return { code: err.message, message: err.message };
  if (err instanceof NotFoundError) return { code: "NOT_FOUND", message: err.message };
  if (err instanceof ValidationError) return { code: "VALIDATION_ERROR", message: err.message };
  if (err instanceof AuthorizationError) return { code: "FORBIDDEN", message: err.message };
  return { code: "INTERNAL_ERROR", message: "Erro interno ao registar o resultado." };
}
