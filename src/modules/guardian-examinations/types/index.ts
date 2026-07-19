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

/** A brief published-result ref for the overview. `examCandidateId` links to the
 *  exam detail (the canonical entity, mirroring the Student Portal). */
export interface GuardianExamResultBriefDto {
  examCandidateId: string;
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

// ─── Sprint 2: Exam Details (supervision, read-only) ─────────────────────────

/** A PUBLISHED result, guardian view. No drafts/submitted/review/approval/internal
 *  remarks/audit — only what the Student Portal publishes. */
export interface GuardianExamResultDetailDto {
  examResultId: string;
  score: number | null;
  maxScore: number;
  normalizedScore: number | null;
  resultCode: string | null;
  publishedAt: Date | null;
}

/** Read-only appeal STATUS. No create/withdraw/edit; no private decisionReason. */
export interface GuardianExamAppealStatusDto {
  appealId: string;
  status: string;
  publicDecision: string | null;
  submittedAt: Date;
  decidedAt: Date | null;
}

/** Full exam detail for `/guardian/examinations/[examId]` (examId = examCandidateId).
 *  100% read-only; no admin config (invigilators/examiners/integration/operations),
 *  no write capability. Attendance is gated by `attendanceVisible` (canViewAttendance)
 *  — the whole section is hidden when false. */
export interface GuardianExamDetailDto {
  student: GuardianLinkedStudentDto;
  examCandidateId: string;
  examSessionId: string;
  title: string;
  subjectName: string | null;
  levelName: string | null;
  courseName: string | null;
  periodName: string | null;
  startsAt: Date;
  endsAt: Date;
  durationMinutes: number | null;
  roomName: string | null;
  instructions: string | null;
  sessionStatus: string;
  candidateStatus: string;
  /** canViewAttendance — when false, hide the entire attendance section. */
  attendanceVisible: boolean;
  /** The attendance status, or null when not recorded (only meaningful if visible). */
  attendanceStatus: string | null;
  /** PUBLISHED result only (masked otherwise). */
  result: GuardianExamResultDetailDto | null;
  /** Read-only appeal status, if any. */
  appeal: GuardianExamAppealStatusDto | null;
}
