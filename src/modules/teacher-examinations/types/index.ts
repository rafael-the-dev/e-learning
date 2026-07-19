// =============================================================================
// TEACHER EXAMINATIONS — DTOs (teacher-facing, assignment-scoped, READ-ONLY)
// -----------------------------------------------------------------------------
// The Teacher Examination Portal's OWN read contract. NOT the admin `types/portal.ts`
// DTOs and NOT the student DTOs: a teacher sees ONLY sessions they are actively
// assigned to (ExamInvigilatorAssignment), their role on each, and operational work
// state — never admin configuration, integrations, appeals, publication, or another
// teacher's sessions. Capabilities are the PORTAL's own (derived from role + session
// state + engine rules), never admin `allowedActions`. Values are English domain
// strings; PT-PT is render-layer only. Sprint 1 exposes NO mutations.
// =============================================================================

/** The teacher's own capabilities on a session — derived from assignment role +
 *  session state + engine rules (NOT admin allowedActions). Presentational: the
 *  engine remains the sole authority (the hardened commands re-check in-tx). */
export interface TeacherExamCapabilitiesDto {
  canMarkAttendance: boolean;
  canCorrectAttendance: boolean;
  /** canMarkAttendance AND there are still candidates without a recorded attendance
   *  (bulk "mark all present" only targets the pending — never overwrites). */
  canBulkMarkAttendance: boolean;
  canEnterResults: boolean;
  canUpdateResults: boolean;
  canSubmitResults: boolean;
  /** canEnterResults AND there are candidates eligible to create a result. */
  canBulkEnterResults: boolean;
  /** canSubmitResults AND there are DRAFT results to submit. */
  canBulkSubmitResults: boolean;
  attendanceBlockReason: string | null;
  resultsBlockReason: string | null;
}

/** Per-candidate result capabilities (NOT admin allowedActions). */
export interface TeacherResultCandidateCapabilitiesDto {
  canCreateResult: boolean;
  canUpdateDraft: boolean;
  canSubmitResult: boolean;
  createBlockReason: string | null;
  updateBlockReason: string | null;
  submitBlockReason: string | null;
}

/** A candidate's result row in the results grid. `result` is null before entry. */
export interface TeacherResultRowDto {
  examCandidateId: string;
  studentNumber: string | null;
  studentName: string | null;
  candidateStatus: string;
  attendanceStatus: string | null;
  /** The engine-derived result code the attendance dictates (SCORED needs a score;
   *  ABSENT/EXCUSED/DISQUALIFIED are code-only) — null when no attendance yet. */
  expectedResultCode: string | null;
  result: {
    examResultId: string;
    score: number | null;
    maxScore: number | null;
    normalizedScore: number | null;
    resultCode: string | null;
    status: string;
  } | null;
  capabilities: TeacherResultCandidateCapabilitiesDto;
}

/** The interactive results view for a session detail. */
export interface TeacherExamResultsViewDto {
  examSessionId: string;
  sessionStatus: string;
  role: string;
  capabilities: TeacherExamCapabilitiesDto;
  /** The session's canonical exam max score (from an existing result), else null. */
  maxScore: number | null;
  rows: TeacherResultRowDto[];
}

/** The interactive attendance view (roster + gating) for a session detail. */
export interface TeacherExamAttendanceViewDto {
  examSessionId: string;
  sessionStatus: string;
  role: string;
  capabilities: TeacherExamCapabilitiesDto;
  progress: TeacherExamSessionProgressDto;
  candidates: TeacherExamCandidateRowDto[];
}

/** Operational progress of a session's work. */
export interface TeacherExamSessionProgressDto {
  candidateCount: number;
  attendanceMarked: number;
  resultsDraft: number;
  resultsSubmitted: number;
}

/** A session the teacher is assigned to (list row). */
export interface TeacherExamSessionListItemDto {
  examSessionId: string;
  title: string;
  subjectName: string | null;
  startsAt: Date;
  endsAt: Date;
  roomName: string | null;
  sessionStatus: string;
  /** The teacher's assignment role on THIS session. */
  role: string;
  candidateCount: number;
  attendanceMarked: number;
  resultsSubmitted: number;
  /** A short "próxima acção" hint derived from capabilities + progress, or null. */
  nextAction: string | null;
}

/** Overview KPIs — operational, teacher-scoped only (no admin/global metrics). */
export interface TeacherExamOverviewDto {
  nextSession: TeacherExamSessionListItemDto | null;
  today: TeacherExamSessionListItemDto[];
  todayCount: number;
  attendancePendingCount: number;
  resultsToEnterCount: number;
  resultsToSubmitCount: number;
  recentlyCompleted: TeacherExamSessionListItemDto[];
}

/** A candidate row in the session detail (read-only in Sprint 1). */
export interface TeacherExamCandidateRowDto {
  examCandidateId: string;
  studentName: string | null;
  studentNumber: string | null;
  candidateStatus: string;
  attendanceStatus: string | null;
  resultStatus: string | null;
  resultCode: string | null;
  normalizedScore: number | null;
}

/** Full session detail for `/teacher/examinations/sessions/[sessionId]`. */
export interface TeacherExamSessionDetailDto {
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
  role: string;
  progress: TeacherExamSessionProgressDto;
  capabilities: TeacherExamCapabilitiesDto;
  candidates: TeacherExamCandidateRowDto[];
}

export interface TeacherExamSessionFilters {
  status?: string;
  subjectId?: string;
  periodId?: string;
  role?: string;
  /** "true" → only sessions in an operationally-active status (LOCKED/IN_PROGRESS/COMPLETED). */
  pending?: string;
  page?: number;
  pageSize?: number;
}

export interface TeacherExamSessionPageDto {
  items: TeacherExamSessionListItemDto[];
  total: number;
  page: number;
  pageSize: number;
}

export interface TeacherExamSessionFacetsDto {
  subjects: Array<{ id: string; name: string }>;
  periods: Array<{ id: string; name: string }>;
}
