import { findTeacherRiskRows } from "@/modules/teacher-portal/repositories/teacher-portal.repository";
import type { StudentRiskRow } from "@/modules/teacher-portal/types";

const DISPLAY_LIMIT = 20;

export interface TeacherStudentRiskList {
  rows: StudentRiskRow[];
  distinctStudentCount: number;
}

/**
 * `distinctStudentCount` (the "Alunos em Risco" KPI) is derived in JS from
 * the already-fetched rows rather than a SQL `COUNT(DISTINCT studentId)` —
 * a deliberate, documented choice, not an oversight:
 *
 * - `findTeacherRiskRows` would need a UNION across four different models
 *   (StudentLevelProgress / StudentCourseProgress / StudentSubjectProgress /
 *   AssessmentResult) joined through two different scoping paths
 *   (enrollment.classGroupId for three of them, assessment.teacherId for the
 *   fourth) to express this as one SQL aggregate — meaningfully riskier to
 *   get right than the rest of this module's raw queries.
 * - The result set is already bounded twice over: scoped to the teacher's
 *   *active* class groups only (never org-wide), and each source query in
 *   `findTeacherRiskRows` carries its own `RISK_SOURCE_QUERY_LIMIT` (200)
 *   safety cap. A teacher's active-student population staying within that
 *   bound is the assumption this approach relies on.
 *
 * Revisit with a real SQL UNION/COUNT DISTINCT if a teacher's active
 * roster ever realistically approaches that cap.
 */
export async function getTeacherStudentRiskList(
  teacherId: string,
  organizationId: string,
  activeClassGroupIds: string[]
): Promise<TeacherStudentRiskList> {
  const allRows = await findTeacherRiskRows(teacherId, organizationId, activeClassGroupIds);

  return {
    rows: allRows.slice(0, DISPLAY_LIMIT),
    distinctStudentCount: new Set(allRows.map((r) => r.studentId)).size,
  };
}
