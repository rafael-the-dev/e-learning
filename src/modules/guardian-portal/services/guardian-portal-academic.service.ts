import type { Student360Core } from "@/modules/students/student-360/services/student-360.service";
import type { StudentGradeRow, StudentAssessmentRow } from "@/modules/student-portal/types";

// =============================================================================
// GUARDIAN PORTAL — ACADEMIC DERIVATIONS
// Pure functions (no DB) reused by the orchestrator once raw reads are in hand.
// Identical academic semantics to the Student Portal — the guardian sees the
// same numbers the student does, never more. Gating by canViewAcademic happens
// in the orchestrator; these helpers just compute.
// =============================================================================

/** Mirrors the Student Portal's academic-status derivation. */
export function deriveGuardianAcademicStatusLabel(core: Student360Core): string {
  if (core.levelProgress.some((p) => p.status === "BLOCKED")) return "Bloqueado";
  if (core.levelProgress.some((p) => p.status === "RECOVERY_REQUIRED")) return "Em Recuperação";
  if (core.subjectProgress.some((p) => p.status === "FAILED")) return "Risco Académico";
  if (core.subjectProgress.some((p) => p.status === "IN_PROGRESS")) return "Em Curso";
  return "Regular";
}

/** Average of published-grade percentages, 1 decimal place. null when there are none. */
export function computeGuardianOverallAverage(grades: StudentGradeRow[]): number | null {
  if (grades.length === 0) return null;
  return Math.round((grades.reduce((sum, g) => sum + g.percentage, 0) / grades.length) * 10) / 10;
}

export function countApprovedSubjects(core: Student360Core): number {
  return core.subjectProgress.filter((p) => p.status === "PASSED").length;
}

export function countPendingSubjects(core: Student360Core): number {
  return core.subjectProgress.length - countApprovedSubjects(core);
}

/** Assessments scheduled today or later. */
export function countUpcomingAssessments(assessments: StudentAssessmentRow[], from: Date): number {
  return assessments.filter((a) => a.assessmentDate >= from).length;
}
