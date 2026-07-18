// =============================================================================
// STUDENT EXAMINATIONS — DTOs (student-facing, privacy-safe)
// -----------------------------------------------------------------------------
// The Student Examination Portal's OWN read contract. Deliberately NOT the admin
// `types/portal.ts` DTOs: a student sees only their own exams, never lifecycle
// `allowedActions`, never another student's data, never the raw eligibility
// snapshot / marker / reviewer / approver internals. Only PUBLISHED results are
// ever surfaced. Values are English domain strings; PT-PT is render-layer only.
// =============================================================================

/** One of the student's exam registrations (a candidacy in a session). */
export interface StudentExamListItemDto {
  examCandidateId: string;
  examSessionId: string;
  title: string;
  subjectName: string | null;
  startsAt: Date;
  endsAt: Date;
  durationMinutes: number | null;
  roomName: string | null;
  /** ExamSession lifecycle (SCHEDULED | IN_PROGRESS | COMPLETED | PUBLISHED | …). */
  sessionStatus: string;
  /** The student's candidate status (REGISTERED | WITHDRAWN | DISQUALIFIED | …). */
  candidateStatus: string;
  /** ELIGIBLE | INELIGIBLE | PENDING_ELIGIBILITY. */
  eligibilityStatus: string;
  /** True when a PUBLISHED result exists for this candidacy. */
  hasPublishedResult: boolean;
}

/** Overview KPIs — attention-only figures for the module home. */
export interface StudentExamOverviewDto {
  nextExam: StudentExamListItemDto | null;
  examsThisWeek: number;
  resultsPendingPublication: number;
  pendingAppeals: number;
  upcoming: StudentExamListItemDto[];
  latestResults: StudentExamResultListItemDto[];
  alerts: string[];
}

/** Allowlisted eligibility provenance for the student's OWN candidacy. The raw
 *  `eligibilitySnapshot` JSON never leaves the service. */
export interface StudentExamEligibilityDto {
  eligible: boolean;
  status: string;
  blockers: string[];
  overridden: boolean;
}

/** The four-step progress a student reads at a glance. */
export interface StudentExamTimelineDto {
  registered: boolean;
  eligible: boolean;
  sat: boolean;
  resultPublished: boolean;
}

/** Full exam detail for `/student/examinations/[examId]`. */
export interface StudentExamDetailDto {
  examCandidateId: string;
  examSessionId: string;
  title: string;
  subjectName: string | null;
  levelName: string | null;
  courseName: string | null;
  periodName: string | null;
  academicYear: string | null;
  term: string | null;
  startsAt: Date;
  endsAt: Date;
  durationMinutes: number | null;
  roomName: string | null;
  /** Free-text "Informações para o exame" (ExamSession.instructions). Structured
   *  rules/type/campus are a future Exam Policy domain (v1.2). */
  instructions: string | null;
  sessionStatus: string;
  candidateStatus: string;
  eligibility: StudentExamEligibilityDto;
  timeline: StudentExamTimelineDto;
  /** Present only when a PUBLISHED result exists. */
  result: StudentExamResultSummaryDto | null;
}

/** A row in the student's Results list — PUBLISHED results only. */
export interface StudentExamResultListItemDto {
  examResultId: string;
  examCandidateId: string;
  examSessionId: string;
  subjectName: string | null;
  /** Raw exam score (e.g. 15 of 20) — the exam score, NEVER a final subject grade. */
  score: number | null;
  maxScore: number;
  /** Normalized percentage — labelled "Percentagem do exame", never a final grade. */
  normalizedScore: number | null;
  /** SCORED | ABSENT | EXCUSED | DISQUALIFIED. */
  resultCode: string | null;
  publishedAt: Date | null;
}

/** The result summary embedded in the exam detail (same shape, no session refs). */
export interface StudentExamResultSummaryDto {
  examResultId: string;
  score: number | null;
  maxScore: number;
  normalizedScore: number | null;
  resultCode: string | null;
  publishedAt: Date | null;
}

// ─── Phase 2: Result Details ────────────────────────────────────────────────

/** Full detail for `/student/examinations/results/[resultId]` — PUBLISHED only.
 *  No `outcome`/pass-fail (the frozen engine owns none — ADR-013 D13); no reviewer/
 *  approver/revision-internals/decisionReason/audit/integration state. */
export interface StudentExamResultDetailDto {
  examResultId: string;
  examCandidateId: string;
  examSessionId: string;
  subjectName: string | null;
  courseName: string | null;
  levelName: string | null;
  sessionDate: Date;
  publishedAt: Date | null;
  score: number | null;
  maxScore: number;
  /** Normalized percentage — "Percentagem do exame", never a final grade. */
  normalizedScore: number | null;
  resultCode: string | null;
  /** Reserved: the frozen result has no designated PUBLIC comment (`remarks` is
   *  internal marker notes and is never exposed) — always null in v1. */
  publicComment: string | null;
  appeal: StudentExamAppealSummaryDto | null;
  canCreateAppeal: boolean;
  createAppealBlockedReason: string | null;
}

// ─── Phase 2: Appeals ───────────────────────────────────────────────────────

/** The appeal summary embedded in a result detail. `publicDecision` is the outcome
 *  enum (APPROVED | REJECTED) — never the private `decisionReason`. */
export interface StudentExamAppealSummaryDto {
  appealId: string;
  status: string;
  submittedAt: Date;
  decidedAt: Date | null;
  publicDecision: string | null;
  canWithdraw: boolean;
}

/** A row in the student's appeals list. */
export interface StudentExamAppealListItemDto {
  appealId: string;
  examResultId: string;
  subjectName: string | null;
  sessionDate: Date | null;
  submittedAt: Date;
  status: string;
  publicDecision: string | null;
  canWithdraw: boolean;
}

/** Full detail for `/student/examinations/appeals/[appealId]`. Excludes internal
 *  notes, admin actors, audit, private reasons and internal events. */
export interface StudentExamAppealDetailDto {
  appealId: string;
  examResultId: string;
  subjectName: string | null;
  sessionDate: Date | null;
  /** The student's own stated motive (they authored it). */
  reason: string;
  submittedAt: Date;
  status: string;
  publicDecision: string | null;
  decidedAt: Date | null;
  canWithdraw: boolean;
  withdrawBlockedReason: string | null;
}

/** Student-specific capabilities for a result/appeal (NOT admin allowedActions). */
export interface StudentAppealCapabilitiesDto {
  canCreateAppeal: boolean;
  createAppealBlockedReason: string | null;
  canWithdrawAppeal: boolean;
  withdrawAppealBlockedReason: string | null;
}

// ─── Phase 2: History ───────────────────────────────────────────────────────

/** Candidacy-based history row — includes exams with no published result. `result`
 *  is null until PUBLISHED. */
export interface StudentExamHistoryItemDto {
  examCandidateId: string;
  subjectName: string | null;
  sessionDate: Date;
  roomName: string | null;
  candidateStatus: string;
  attendanceStatus: string | null;
  result: {
    examResultId: string;
    score: number | null;
    maxScore: number;
    normalizedScore: number | null;
    resultCode: string | null;
    publishedAt: Date | null;
  } | null;
}

export interface StudentExamHistoryFilters {
  year?: number;
  subjectId?: string;
  status?: string;
  page?: number;
  pageSize?: number;
}

export interface StudentExamHistoryPageDto {
  items: StudentExamHistoryItemDto[];
  total: number;
  page: number;
  pageSize: number;
}
