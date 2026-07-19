// =============================================================================
// GUARDIAN EXAMINATIONS — DTOs (guardian-facing, supervision, READ-ONLY)
// -----------------------------------------------------------------------------
// The Guardian Examination Portal is a SUPERVISION experience, not a mirror of the
// Student Portal. A guardian follows their linked student(s): upcoming exams,
// attendance, published results, and appeal STATUS — never writing anything. Every
// read is scoped to the guardian's ACTIVE GuardianStudent links and gated by the
// per-link flags: exam academic data (schedule/results/appeals/history) requires
// `canViewAcademic`; exam attendance requires `canViewAttendance`. Values are English
// domain strings; PT-PT is render-layer only. NO writes, NO capabilities to act.
// =============================================================================

/** A student the guardian is linked to (+ the per-link visibility flags). */
export interface GuardianLinkedStudentDto {
  studentId: string;
  studentName: string;
  studentNumber: string | null;
  relationshipType: string;
  isPrimary: boolean;
  canViewAcademic: boolean;
  canViewAttendance: boolean;
}

/** A brief upcoming-exam ref for the overview. */
export interface GuardianUpcomingExamDto {
  examCandidateId: string;
  subjectName: string | null;
  startsAt: Date;
  endsAt: Date;
  roomName: string | null;
  sessionStatus: string;
}

/** A brief published-result ref for the overview. */
export interface GuardianExamResultBriefDto {
  examResultId: string;
  subjectName: string | null;
  normalizedScore: number | null;
  resultCode: string | null;
  publishedAt: Date | null;
}

/** Per-student supervision summary. When `academicVisible` is false, the exam data
 *  is withheld (the guardian's link has `canViewAcademic = false`). */
export interface GuardianExamStudentSummaryDto {
  student: GuardianLinkedStudentDto;
  academicVisible: boolean;
  nextExam: GuardianUpcomingExamDto | null;
  examsThisWeek: number;
  latestResults: GuardianExamResultBriefDto[];
  pendingAppeals: number;
  alerts: string[];
}

/** The Guardian Examination overview — one summary per linked student. */
export interface GuardianExamOverviewDto {
  hasLinks: boolean;
  students: GuardianExamStudentSummaryDto[];
}
