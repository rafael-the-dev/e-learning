import type { PrismaClientOrTx } from "@/server/db";
import { findCurrentOfficialResult } from "@/modules/examinations/repositories/exam-result.repository";
import {
  resolveOfficialExamResult,
  type OfficialExamResultView,
} from "@/modules/examinations/commands/appeals-shared";

// =============================================================================
// EXAMINATION ENGINE — OFFICIAL EXAM RESULT SERVICE (Phase 10; read-only)
// -----------------------------------------------------------------------------
// A pure read façade over the "current official result" projection (D14): it loads
// the ExamResult + its CURRENT ExamResultRevision (via `findCurrentOfficialResult`)
// and returns the resolved view (`resolveOfficialExamResult` — revised score with a
// purely-recomputed normalized percentage). It performs NO write, decides nothing,
// grades nothing, and is not yet consumed outside the Examination Engine (Grade /
// Progression / Transcript integration is a later phase).
// =============================================================================

export interface GetOfficialExamResultParams {
  organizationId: string;
  examResultId: string;
}

/** Resolve the current official exam result, or `null` when no result matches for
 *  the organization. Read-only — accepts an optional tx `client`. */
export async function getOfficialExamResult(
  params: GetOfficialExamResultParams,
  client?: PrismaClientOrTx
): Promise<OfficialExamResultView | null> {
  const current = await findCurrentOfficialResult(
    { organizationId: params.organizationId, examResultId: params.examResultId },
    client
  );
  if (!current) return null;
  return resolveOfficialExamResult({
    result: current.result,
    currentRevision: current.currentRevision,
  });
}
