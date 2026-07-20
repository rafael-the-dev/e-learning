import type { StudentSubjectProgress } from "@/modules/assessments/types";
import type { StudentLevelProgress, StudentCourseProgress } from "@/modules/prerequisites/types";
import type { Enrollment } from "@/modules/enrollments/types";

// =============================================================================
// STUDENT ACADEMIC SUMMARY — the SINGLE source of truth for a student's academic
// headline figures (H2). Every surface (Student 360, Student Portal, Guardian
// Portal) consumes THIS read model instead of computing its own average/tallies,
// so the same student always shows the same numbers.
//
// It computes NOTHING new about grades — it only reads the values the Grade Engine
// already persisted via the cascade:
//   - StudentSubjectProgress.finalGrade  (0–100, canonical per-subject grade)
//   - StudentCourseProgress.finalGrade   (0–100, weighted rollup — what the Transcript shows)
//   - StudentLevelProgress.status        (BLOCKED / RECOVERY_REQUIRED)
//
// Two averages are exposed deliberately (both always computed the same way):
//   - subjectAverage:  simple mean of graded subjects' finalGrade — operational,
//                      available as soon as one subject is graded.
//   - courseFinalGrade: the current enrollment's persisted course rollup — the
//                      official weighted "Média Final do Curso" the Transcript renders.
// =============================================================================

export const ACADEMIC_GRADE_SCALE = 100 as const;

export interface StudentAcademicSummaryInput {
  subjectProgress: StudentSubjectProgress[];
  levelProgress: StudentLevelProgress[];
  courseProgress: StudentCourseProgress[];
  currentEnrollment: Enrollment | null;
}

export interface StudentAcademicSummary {
  /** Simple (unweighted) mean of graded subjects' finalGrade, 0–100, rounded to 1 dp. null if none graded. */
  subjectAverage: number | null;
  /** Current enrollment's persisted course rollup (weighted), 0–100 — identical to the Transcript. null until it exists. */
  courseFinalGrade: number | null;
  scale: typeof ACADEMIC_GRADE_SCALE;
  gradedSubjects: number; // subjects with a non-null finalGrade
  passedSubjects: number;
  failedSubjects: number;
  inProgressSubjects: number;
  incompleteSubjects: number;
  currentLevel: { id: string | null; name: string | null };
  /** PT-PT academic status label — the single definition of the student's progression state. */
  progressionStatus: string;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function deriveProgressionStatus(
  subjectProgress: StudentSubjectProgress[],
  levelProgress: StudentLevelProgress[]
): string {
  if (levelProgress.some((p) => p.status === "BLOCKED")) return "Bloqueado";
  if (levelProgress.some((p) => p.status === "RECOVERY_REQUIRED")) return "Em Recuperação";
  if (subjectProgress.some((p) => p.status === "FAILED")) return "Risco Académico";
  if (subjectProgress.some((p) => p.status === "IN_PROGRESS")) return "Em Curso";
  return "Regular";
}

// currentLevelId is written on promotion; courseLevelId is the frozen original level.
// Same resolution the eligibility engine uses — the level the student is really at now.
function resolveCurrentLevel(enrollment: Enrollment | null): { id: string | null; name: string | null } {
  if (!enrollment) return { id: null, name: null };
  return {
    id: enrollment.currentLevelId ?? enrollment.courseLevelId ?? null,
    name: enrollment.currentLevelName ?? enrollment.courseLevelName ?? null,
  };
}

export function buildStudentAcademicSummary(input: StudentAcademicSummaryInput): StudentAcademicSummary {
  const { subjectProgress, levelProgress, courseProgress, currentEnrollment } = input;

  const graded = subjectProgress.filter((p) => p.finalGrade != null);
  const subjectAverage =
    graded.length > 0
      ? round1(graded.reduce((sum, p) => sum + (p.finalGrade ?? 0), 0) / graded.length)
      : null;

  // The official course rollup of the CURRENT enrollment (what the Transcript shows).
  const currentCourseProgress = currentEnrollment
    ? courseProgress.find((c) => c.enrollmentId === currentEnrollment.id) ?? null
    : null;
  const courseFinalGrade =
    currentCourseProgress?.finalGrade != null ? round1(currentCourseProgress.finalGrade) : null;

  return {
    subjectAverage,
    courseFinalGrade,
    scale: ACADEMIC_GRADE_SCALE,
    gradedSubjects: graded.length,
    passedSubjects: subjectProgress.filter((p) => p.status === "PASSED").length,
    failedSubjects: subjectProgress.filter((p) => p.status === "FAILED").length,
    inProgressSubjects: subjectProgress.filter((p) => p.status === "IN_PROGRESS").length,
    incompleteSubjects: subjectProgress.filter((p) => p.status === "INCOMPLETE").length,
    currentLevel: resolveCurrentLevel(currentEnrollment),
    progressionStatus: deriveProgressionStatus(subjectProgress, levelProgress),
  };
}
