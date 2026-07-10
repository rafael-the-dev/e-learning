import type { PrismaClientOrTx } from "@/server/db";
import { findCurrentOfficialResult } from "@/modules/examinations/repositories/exam-result.repository";
import { findExamCandidateById } from "@/modules/examinations/repositories/exam-candidate.repository";
import { resolveOfficialExamResult } from "@/modules/examinations/commands/appeals-shared";
import { ExamResultStatus } from "@/modules/examinations/constants";

// =============================================================================
// EXAMINATION ENGINE — GRADE-INTEGRATION READ SOURCE (Phase 11; anti-corruption)
// -----------------------------------------------------------------------------
// A pure, READ-ONLY façade that projects the current official PUBLISHED exam result
// into the SMALL, engine-neutral fact set the Phase-11 Grade/Progression integration
// consumes (E-13). It performs NO write, decides nothing, grades nothing, and returns
// NO Prisma entities / snapshots / personal data / attendance internals — only the
// integratable facts (ids + the resolved score / resultCode overlay). The score /
// normalized / resultCode are taken from `resolveOfficialExamResult` (the D14 "current
// official result" projection: ExamResult overlaid with its CURRENT ExamResultRevision,
// normalized recomputed purely) — this source NEVER recomputes a score of its own and
// NEVER converts a non-scored code to a number. A non-PUBLISHED result yields `null`
// (only the visible, official result may cross the integration boundary).
//
// `officialVersion` is the idempotency/staleness key written to the append-only
// ExamEvent metadata ledger (no ledger table): it changes iff the CURRENT revision
// pointer changes, so a superseding appeal revision makes a prior integration STALE.
// =============================================================================

/** Which exam-side event triggered the integration read (audit context only). */
export type ExamIntegrationSourceEvent = "PUBLICATION" | "APPEAL_REVISION" | "RECONCILIATION";

/**
 * The engine-neutral fact set the Grade/Progression integration consumes. Deliberately
 * flat + primitive: NO Prisma entities, NO snapshot, NO personal data, NO attendance
 * internals beyond the derived `resultCode`.
 */
export interface OfficialExamResultIntegrationDto {
  organizationId: string;
  examResultId: string;
  currentRevisionId: string | null;
  examSessionId: string | null;
  examAttemptId: string;
  examCandidateId: string;
  studentId: string;
  enrollmentId: string;
  levelSubjectId: string;
  resultCode: string | null;
  score: number | null;
  maxScore: number;
  normalizedScore: number | null;
  publishedAt: Date | null;
  /** Idempotency/staleness key — `result:<id>` or `result:<id>:revision:<revId>`. */
  officialVersion: string;
  /** Deterministic string of the integratable facts (change detection convenience). */
  sourceFingerprint: string;
  sourceEvent: ExamIntegrationSourceEvent;
}

export interface LoadOfficialResultForIntegrationParams {
  organizationId: string;
  examResultId: string;
  sourceEvent: ExamIntegrationSourceEvent;
}

/**
 * Load the current official result for integration, or `null` when there is no result
 * for the organization OR the result is not PUBLISHED. Read-only — accepts an optional
 * tx `client`. When a CURRENT revision exists the resolved score overlay is used and
 * `sourceEvent` is forced to `"APPEAL_REVISION"` (a revision is the real trigger).
 */
export async function loadOfficialResultForIntegration(
  params: LoadOfficialResultForIntegrationParams,
  client?: PrismaClientOrTx
): Promise<OfficialExamResultIntegrationDto | null> {
  const current = await findCurrentOfficialResult(
    { organizationId: params.organizationId, examResultId: params.examResultId },
    client
  );
  if (!current) return null;
  if (current.result.status !== ExamResultStatus.PUBLISHED) return null;

  const view = resolveOfficialExamResult({
    result: current.result,
    currentRevision: current.currentRevision,
  });

  // examSessionId is not on ExamResult — resolve it via the owning candidate (reuse).
  const candidate = await findExamCandidateById(
    { organizationId: params.organizationId, id: current.result.examCandidateId },
    client
  );

  const currentRevisionId = view.revisionId;
  const officialVersion = currentRevisionId
    ? `result:${params.examResultId}:revision:${currentRevisionId}`
    : `result:${params.examResultId}`;
  const sourceEvent: ExamIntegrationSourceEvent = current.currentRevision
    ? "APPEAL_REVISION"
    : params.sourceEvent;
  const sourceFingerprint = `${officialVersion}|${view.resultCode}|${view.score}|${current.result.maxScore}`;

  return {
    organizationId: params.organizationId,
    examResultId: params.examResultId,
    currentRevisionId,
    examSessionId: candidate?.examSessionId ?? null,
    examAttemptId: current.result.examAttemptId,
    examCandidateId: current.result.examCandidateId,
    studentId: current.result.studentId,
    enrollmentId: current.result.enrollmentId,
    levelSubjectId: current.result.levelSubjectId,
    resultCode: view.resultCode,
    score: view.score,
    maxScore: current.result.maxScore,
    normalizedScore: view.normalizedScore,
    publishedAt: current.result.publishedAt,
    officialVersion,
    sourceFingerprint,
    sourceEvent,
  };
}
