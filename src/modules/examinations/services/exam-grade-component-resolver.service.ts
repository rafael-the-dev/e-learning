import { getDb } from "@/server/db";
import type { PrismaClientOrTx } from "@/server/db";
import { findActiveBindingBySession } from "@/modules/examinations/repositories/exam-grade-component-binding.repository";
import { findComponentById } from "@/modules/assessments/repositories/assessment-component.repository";
import { findAssessmentPolicyById } from "@/modules/assessments/repositories/assessment-policy.repository";

// =============================================================================
// EXAMINATION ENGINE — CANONICAL EXAM→GRADE-COMPONENT RESOLVER (Phase 11B; ADR-014)
// -----------------------------------------------------------------------------
// The EXPLICIT resolver that maps an ExamSession onto the Grade Engine
// `assessmentComponentId` its results integrate into. There is NO heuristic — the
// target is the session's single active `ExamGradeComponentBinding`, and only when
// the bound component's `AssessmentPolicy.levelSubjectId` matches the exam session's
// `levelSubjectId`. It NEVER inspects component name / weight / order / componentType.
// A missing or incompatible binding returns `null` (→ EXAM_RESULT_INTEGRATION_UNSUPPORTED
// upstream). This reads the assessment-component / policy CONFIG (Grade domain reads,
// not writes) and the academic LevelSubject → subjectId; it writes nothing.
// =============================================================================

export interface ResolveCanonicalAssessmentComponentParams {
  organizationId: string;
  examSessionId: string;
  levelSubjectId: string;
}

export interface ResolvedCanonicalAssessmentComponent {
  assessmentComponentId: string;
  subjectId: string;
  bindingId: string;
}

/**
 * Resolve the canonical grade target for an exam session from its explicit binding.
 *   1. No active binding ⇒ `null`.
 *   2. Bound component missing (org-scoped) ⇒ `null`.
 *   3. Compatibility (no heuristic): the component's `AssessmentPolicy.levelSubjectId`
 *      MUST equal the exam session's `levelSubjectId` ⇒ else `null`.
 *   4. Resolve `subjectId` from the LevelSubject; return `{ assessmentComponentId,
 *      subjectId, bindingId }`.
 */
export async function resolveCanonicalAssessmentComponentForExamSession(
  params: ResolveCanonicalAssessmentComponentParams,
  client?: PrismaClientOrTx
): Promise<ResolvedCanonicalAssessmentComponent | null> {
  const { organizationId, examSessionId, levelSubjectId } = params;

  // 1. Explicit binding only — no binding ⇒ UNSUPPORTED upstream.
  const binding = await findActiveBindingBySession({ organizationId, examSessionId }, client);
  if (!binding) return null;

  // 2. The bound component must still exist for this org.
  const component = await findComponentById(binding.assessmentComponentId, organizationId);
  if (!component) return null;

  // 3. Compatibility check (NO heuristic — policy levelSubject must match the exam's).
  const policy = await findAssessmentPolicyById(component.assessmentPolicyId, organizationId);
  if (!policy || policy.levelSubjectId !== levelSubjectId) return null;

  // 4. Resolve subjectId from the (matching) LevelSubject.
  const db = client ?? (await getDb());
  const levelSubjectRow = await db.levelSubject.findFirst({
    where: { id: levelSubjectId, organizationId, deletedAt: null },
    select: { subjectId: true },
  });
  if (!levelSubjectRow) return null;

  return {
    assessmentComponentId: binding.assessmentComponentId,
    subjectId: levelSubjectRow.subjectId as string,
    bindingId: binding.id,
  };
}
