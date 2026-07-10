import type {
  ExamResultRecord,
  ExamResultRevisionRecord,
} from "@/modules/examinations/types/repository";
import { normalizeExamScore } from "./result-entry-shared";

// =============================================================================
// EXAMINATION ENGINE — PHASE 10 APPEALS SHARED HELPERS (pure — no IO / throw)
// -----------------------------------------------------------------------------
// Pure, side-effect-free helpers for the Phase-10 appeal workflow. The official
// exam result is the ExamResult PLUS its CURRENT ExamResultRevision (D14): a revision
// carries a SCORE correction only (the model has no normalizedScore / resultCode /
// remarks columns), so the resolver RE-derives the normalized percentage purely from
// the revised score and the result's own `maxScore` — it never reads a stored one. It
// NEVER mutates, grades, decides pass/fail, or touches progression / transcript /
// certificate. No engine, no persistence, no throw, no event bus lives here — the
// command owns the transaction. `normalizeExamScore` is imported (not duplicated)
// from the Phase-7 result-entry shared helpers.
// =============================================================================

/** The resolved "current official result" view (D14) — the ExamResult overlaid with
 *  its CURRENT revision's score (normalized recomputed purely). */
export interface OfficialExamResultView {
  examResultId: string;
  status: string;
  score: number | null;
  normalizedScore: number | null;
  resultCode: string | null;
  revisionId: string | null;
  revisionNumber: number | null;
  hasRevision: boolean;
}

/**
 * Resolve the current official exam result (pure — NO IO / throw). When a CURRENT
 * revision exists its `revisedScore` overrides the base result's `score`; the
 * normalized percentage is RE-derived from that score against the result's own
 * `maxScore` (only for a SCORED result with a positive maxScore) — the revision
 * model stores no normalizedScore / resultCode, so those are never read back. The
 * `resultCode` and lifecycle `status` always come from the base result (a Phase-10
 * revision corrects the score only, never the code or the publication status).
 */
export function resolveOfficialExamResult(params: {
  result: ExamResultRecord;
  currentRevision: ExamResultRevisionRecord | null;
}): OfficialExamResultView {
  const { result, currentRevision } = params;
  const score = currentRevision?.revisedScore ?? result.score;
  const normalizedScore =
    result.resultCode === "SCORED" && score != null && result.maxScore > 0
      ? normalizeExamScore(score, result.maxScore)
      : result.normalizedScore;

  return {
    examResultId: result.id,
    status: result.status,
    score,
    normalizedScore,
    resultCode: result.resultCode,
    revisionId: currentRevision?.id ?? null,
    revisionNumber: currentRevision?.revisionNumber ?? null,
    hasRevision: !!currentRevision,
  };
}

// ─── Command DTOs ────────────────────────────────────────────────────────────

/** DTO returned by `CreateExamAppealCommand`. */
export interface CreateAppealResult {
  appealId: string;
  status: string;
  reason: string;
  createdAt: Date;
}

/** DTO returned by `ReviewExamAppealCommand`. */
export interface ReviewAppealResult {
  appealId: string;
  status: string;
  reviewedAt: Date;
}

/** DTO returned by `ApproveExamAppealCommand`. */
export interface ApproveAppealResult {
  appealId: string;
  revisionId: string;
  status: string;
}

/** DTO returned by `RejectExamAppealCommand`. */
export interface RejectAppealResult {
  appealId: string;
  status: string;
}

/** DTO returned by `WithdrawExamAppealCommand`. */
export interface WithdrawAppealResult {
  appealId: string;
  status: string;
}
