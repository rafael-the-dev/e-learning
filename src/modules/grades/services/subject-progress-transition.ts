// =============================================================================
// SUBJECT PROGRESS TRANSITION DETECTION (pure, no I/O)
//
// Academic events (STUDENT_SUBJECT_PASSED / STUDENT_SUBJECT_FAILED) and the
// generic `student_subject_progress.updated` audit must represent real STATE
// TRANSITIONS. A recalculation that produces identical state must be silent —
// otherwise the Timeline, Notifications, and the future Transcript accumulate
// duplicate history and the audit log fills with noise.
//
// This helper is the single, testable place that decides "did anything
// meaningful change, and did we cross into a terminal PASSED/FAILED state".
// =============================================================================

/** The comparable, meaningful fields of a StudentSubjectProgress row. */
export interface SubjectProgressSnapshot {
  status: string | null;
  finalGrade: number | null;
  attendancePercentage: number | null;
  completedAt: Date | null;
  progressReason: string | null;
}

export interface SubjectProgressTransition {
  previousStatus: string | null;
  newStatus: string;
  hasStatusChanged: boolean;
  hasGradeChanged: boolean;
  hasAttendanceChanged: boolean;
  hasCompletionChanged: boolean;
  hasReasonChanged: boolean;
  /** True when ANY meaningful field changed → the `updated` audit should fire. */
  hasMeaningfulChange: boolean;
  /** Entered PASSED from a non-PASSED status → emit STUDENT_SUBJECT_PASSED. */
  enteredPassed: boolean;
  /** Entered FAILED from a non-FAILED status → emit STUDENT_SUBJECT_FAILED. */
  enteredFailed: boolean;
}

function sameInstant(a: Date | null, b: Date | null): boolean {
  if (a === null || b === null) return a === b;
  return a.getTime() === b.getTime();
}

/**
 * Detect the transition between a previous progress snapshot (null when the row
 * did not exist) and the freshly computed current one. Pure — no side effects.
 */
export function detectSubjectProgressTransition(
  previous: SubjectProgressSnapshot | null,
  current: SubjectProgressSnapshot & { status: string }
): SubjectProgressTransition {
  const previousStatus = previous?.status ?? null;

  const hasStatusChanged = previousStatus !== current.status;
  const hasGradeChanged = (previous?.finalGrade ?? null) !== (current.finalGrade ?? null);
  const hasAttendanceChanged =
    (previous?.attendancePercentage ?? null) !== (current.attendancePercentage ?? null);
  const hasCompletionChanged = !sameInstant(previous?.completedAt ?? null, current.completedAt);
  const hasReasonChanged = (previous?.progressReason ?? null) !== (current.progressReason ?? null);

  return {
    previousStatus,
    newStatus: current.status,
    hasStatusChanged,
    hasGradeChanged,
    hasAttendanceChanged,
    hasCompletionChanged,
    hasReasonChanged,
    hasMeaningfulChange:
      hasStatusChanged ||
      hasGradeChanged ||
      hasAttendanceChanged ||
      hasCompletionChanged ||
      hasReasonChanged,
    enteredPassed: current.status === "PASSED" && previousStatus !== "PASSED",
    enteredFailed: current.status === "FAILED" && previousStatus !== "FAILED",
  };
}
