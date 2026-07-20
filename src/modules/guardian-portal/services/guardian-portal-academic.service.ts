import type { StudentAssessmentRow } from "@/modules/student-portal/types";

// =============================================================================
// GUARDIAN PORTAL — ACADEMIC DERIVATIONS
// The academic headline figures (average / status label / approved / pending)
// now come from the single canonical read model (student-academic-summary.service),
// so the guardian, the student and Student 360 always agree. Only the guardian-
// specific upcoming-assessments count remains here.
// =============================================================================

/** Assessments scheduled today or later. */
export function countUpcomingAssessments(assessments: StudentAssessmentRow[], from: Date): number {
  return assessments.filter((a) => a.assessmentDate >= from).length;
}
