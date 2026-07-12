// =============================================================================
// EXAMINATION ADMINISTRATION PORTAL — DTOs / FILTERS / allowedActions (Phase 12)
// -----------------------------------------------------------------------------
// Outward, privacy-safe shapes the admin portal consumes. NO Prisma entities, NO
// eligibilitySnapshot / ExamEvent.metadata / AuditLog blobs, NO Transcript /
// Certificate / Grade internals. Every detail + list-item DTO carries a
// server-computed `allowedActions` block; the UI renders those flags and never
// re-derives a lifecycle/eligibility rule. Commands remain authoritative.
//
// This file is the portal CONTRACT. Increment 1 covers Period + Session + the
// admin Overview; Rooms/Candidates/Attendance/Results/Appeals/Integration/
// Operations extend it on the identical pattern.
// =============================================================================

// ─── Shared list envelope (mirrors the certificate portal) ────────────────────

export interface PortalListResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

// ─── ExamPeriod ───────────────────────────────────────────────────────────────

export interface ExamPeriodAllowedActions {
  canOpen: boolean;
  canLock: boolean;
  canComplete: boolean;
  canCancel: boolean;
}

export interface ExamPeriodListItemDto {
  id: string;
  name: string;
  academicYear: string;
  term: string | null;
  branchId: string | null;
  status: string;
  startsAt: Date;
  endsAt: Date;
  allowedActions: ExamPeriodAllowedActions;
}

export interface ExamPeriodDetailDto extends ExamPeriodListItemDto {
  lockedAt: Date | null;
  completedAt: Date | null;
  cancelledAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  /** Count of (non-deleted) sessions in the period — computed on detail only. */
  sessionCount: number;
}

export interface ExamPeriodAdminListFilters {
  status?: string;
  academicYear?: string;
  search?: string;
  page?: number;
  pageSize?: number;
}

// ─── ExamSession ───────────────────────────────────────────────────────────────

export interface ExamSessionAllowedActions {
  canSchedule: boolean;
  canLock: boolean;
  canStart: boolean;
  canComplete: boolean;
  canCancel: boolean;
  canRegisterCandidate: boolean;
  canMarkAttendance: boolean;
  canEnterResults: boolean;
  canPublish: boolean;
  canRetract: boolean;
  canBindGradeComponent: boolean;
  canIntegrate: boolean;
}

export interface ExamSessionListItemDto {
  id: string;
  title: string;
  periodId: string;
  levelSubjectId: string;
  courseId: string | null;
  courseLevelId: string | null;
  branchId: string | null;
  roomId: string | null;
  status: string;
  startsAt: Date;
  endsAt: Date;
  capacity: number;
  allowedActions: ExamSessionAllowedActions;
}

export interface ExamSessionDetailDto extends ExamSessionListItemDto {
  instructions: string | null;
  lockedAt: Date | null;
  startedAt: Date | null;
  completedAt: Date | null;
  publishedAt: Date | null;
  cancelledAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  /** Operational counters (batched, no N+1). */
  registeredCandidateCount: number;
  attendanceMarkedCount: number;
  resultCount: number;
}

export interface ExamSessionAdminListFilters {
  periodId?: string;
  levelSubjectId?: string;
  roomId?: string;
  status?: string;
  search?: string;
  page?: number;
  pageSize?: number;
}

// ─── Admin Overview (Phase 12 §5 — count-based KPIs over existing facts) ───────

export interface ExaminationOverviewDto {
  periods: {
    draft: number;
    open: number;
    locked: number;
    completed: number;
  };
  sessions: {
    scheduled: number;
    locked: number;
    inProgress: number;
    completed: number;
    resultsRecorded: number;
    published: number;
  };
  results: {
    draft: number;
    submitted: number;
    reviewed: number;
    approved: number;
    published: number;
  };
  appeals: {
    pending: number;
    underReview: number;
  };
}

// =============================================================================
// INCREMENT 2 — Rooms / Candidates / Attendance / Results / Publication /
// Appeals / Grade-Integration / Operations. Same rules: privacy-safe DTOs, every
// list/detail carries server-computed allowedActions, no raw Prisma / snapshot /
// event-metadata / audit / Grade internals.
// =============================================================================

// ─── ExamRoom ─────────────────────────────────────────────────────────────────

export interface ExamRoomAllowedActions {
  canEdit: boolean;
  canArchive: boolean;
}

export interface ExamRoomListItemDto {
  roomId: string;
  name: string;
  code: string | null;
  branchId: string | null;
  branchName: string | null;
  capacity: number;
  status: string;
  description: string | null;
  upcomingSessionCount: number;
  nextSessionAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  allowedActions: ExamRoomAllowedActions;
}

export interface ExamRoomUpcomingSessionDto {
  sessionId: string;
  title: string;
  status: string;
  startsAt: Date;
  endsAt: Date;
}

export interface ExamRoomDetailDto extends ExamRoomListItemDto {
  upcomingSessions: ExamRoomUpcomingSessionDto[];
  activeSessionCount: number;
  archiveBlockedReason: string | null;
}

export interface ExamRoomAdminListFilters {
  branchId?: string;
  status?: string;
  minCapacity?: number;
  maxCapacity?: number;
  search?: string;
  page?: number;
  pageSize?: number;
}

// ─── ExamCandidate ────────────────────────────────────────────────────────────

export interface ExamCandidateAllowedActions {
  canWithdraw: boolean;
  canDisqualify: boolean;
  canMarkAttendance: boolean;
  canEnterResult: boolean;
  canViewAttendance: boolean;
  canViewResult: boolean;
}

export interface ExamCandidateListItemDto {
  examCandidateId: string;
  examSessionId: string;
  studentId: string;
  studentNumber: string | null;
  studentName: string | null;
  enrollmentId: string;
  enrollmentNumber: string | null;
  examAttemptId: string;
  attemptNumber: number | null;
  eligibilityStatus: string;
  candidateStatus: string;
  assignedSeat: string | null;
  attendanceStatus: string | null;
  resultStatus: string | null;
  overridden: boolean;
  overrideReasonPresent: boolean;
  registeredAt: Date | null;
  allowedActions: ExamCandidateAllowedActions;
}

/** Allowlisted eligibility provenance — NEVER the raw eligibilitySnapshot JSON. */
export interface ExamCandidateEligibilityProvenanceDto {
  blockers: string[];
  warnings: string[];
  requiresApproval: boolean;
  overridden: boolean;
  overriddenById: string | null;
  overrideReason: string | null;
  overriddenAt: Date | null;
}

export interface ExamCandidateDetailDto extends ExamCandidateListItemDto {
  eligibility: ExamCandidateEligibilityProvenanceDto;
  attendance: {
    status: string;
    checkedInAt: Date | null;
    markedAt: Date | null;
    remarks: string | null;
  } | null;
  result: {
    status: string;
    resultCode: string | null;
    score: number | null;
    maxScore: number | null;
    normalizedScore: number | null;
  } | null;
}

export interface ExamCandidateAdminListFilters {
  examSessionId?: string;
  eligibilityStatus?: string;
  candidateStatus?: string;
  attendanceStatus?: string;
  resultStatus?: string;
  overridden?: boolean;
  search?: string;
  page?: number;
  pageSize?: number;
}

// ─── ExamAttendance ───────────────────────────────────────────────────────────

export interface ExamAttendanceAllowedActions {
  canMark: boolean;
  canCorrect: boolean;
}

export interface ExamAttendanceRosterItemDto {
  attendanceId: string | null;
  examCandidateId: string;
  examSessionId: string;
  studentNumber: string | null;
  studentName: string | null;
  candidateStatus: string;
  attendanceStatus: string | null;
  checkedInAt: Date | null;
  markedAt: Date | null;
  markedById: string | null;
  remarks: string | null;
  hasAttendance: boolean;
  allowedActions: ExamAttendanceAllowedActions;
}

export interface ExamAttendanceSummaryDto {
  totalRegistered: number;
  marked: number;
  unmarked: number;
  present: number;
  absent: number;
  late: number;
  excused: number;
  disqualified: number;
  completionPercentage: number;
}

export interface ExamAttendanceRosterDto {
  examSessionId: string;
  summary: ExamAttendanceSummaryDto;
  items: ExamAttendanceRosterItemDto[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ExamAttendanceAdminListFilters {
  status?: string;
  search?: string;
  page?: number;
  pageSize?: number;
}

// ─── ExamResult ───────────────────────────────────────────────────────────────

export interface ExamResultAllowedActions {
  canCreate: boolean;
  canEdit: boolean;
  canSubmit: boolean;
  canReview: boolean;
  canApprove: boolean;
  canReturnForCorrection: boolean;
  canIntegrate: boolean;
  canReconcile: boolean;
}

/** The current OFFICIAL result (Phase-10 resolver overlay). `normalizedScore` is the
 *  exam PERCENTAGE (0–100), NOT a final subject grade. */
export interface ExamOfficialResultDto {
  source: "BASE" | "REVISION";
  score: number | null;
  normalizedScore: number | null;
  resultCode: string | null;
}

export interface ExamResultListItemDto {
  examResultId: string | null;
  examCandidateId: string;
  examSessionId: string;
  studentNumber: string | null;
  studentName: string | null;
  attendanceStatus: string | null;
  resultStatus: string | null;
  resultCode: string | null;
  /** Raw exam score (NOT a final grade). */
  score: number | null;
  maxScore: number | null;
  /** Exam percentage (0–100) — NOT a final subject grade. */
  normalizedScore: number | null;
  markerId: string | null;
  reviewedById: string | null;
  approvedById: string | null;
  submittedAt: Date | null;
  reviewedAt: Date | null;
  approvedAt: Date | null;
  publishedAt: Date | null;
  currentRevisionId: string | null;
  officialResult: ExamOfficialResultDto | null;
  allowedActions: ExamResultAllowedActions;
}

export interface ExamResultRevisionSummaryDto {
  revisionId: string;
  revisionNumber: number;
  previousScore: number | null;
  revisedScore: number | null;
  sourceType: string;
  isCurrent: boolean;
  createdAt: Date;
}

export interface ExamResultDetailDto extends ExamResultListItemDto {
  remarks: string | null;
  revisions: ExamResultRevisionSummaryDto[];
  appeal: { appealId: string; status: string } | null;
}

export interface ExamResultAdminListFilters {
  status?: string;
  resultCode?: string;
  attendanceStatus?: string;
  markerId?: string;
  reviewerId?: string;
  approverId?: string;
  search?: string;
  page?: number;
  pageSize?: number;
}

// ─── ExamPublication ──────────────────────────────────────────────────────────

export interface ExamPublicationAllowedActions {
  canPublish: boolean;
  canRetract: boolean;
}

export interface ExamPublicationReadinessDto {
  examSessionId: string;
  sessionStatus: string;
  requiredCandidateCount: number;
  resultCount: number;
  missingCandidateIds: string[];
  nonApprovedResultIds: string[];
  staleResultIds: string[];
  activePublicationId: string | null;
  publicationStatus: string | null;
  downstreamConsumed: boolean;
  ready: boolean;
  blockers: string[];
  allowedActions: ExamPublicationAllowedActions;
}

export interface ExamPublicationDetailDto {
  publicationId: string | null;
  examSessionId: string;
  publicationStatus: string | null;
  publishedAt: Date | null;
  publishedById: string | null;
  retractedAt: Date | null;
  retractedById: string | null;
  retractionReasonPresent: boolean;
  downstreamConsumed: boolean;
  readiness: ExamPublicationReadinessDto;
  allowedActions: ExamPublicationAllowedActions;
}

// ─── ExamAppeal ───────────────────────────────────────────────────────────────

export interface ExamAppealAllowedActions {
  canReview: boolean;
  canApprove: boolean;
  canReject: boolean;
}

export interface ExamAppealListItemDto {
  appealId: string;
  examResultId: string;
  examSessionId: string | null;
  studentId: string;
  studentNumber: string | null;
  studentName: string | null;
  subjectName: string | null;
  status: string;
  reasonSummary: string;
  createdAt: Date;
  decidedAt: Date | null;
  currentOfficialScore: number | null;
  allowedActions: ExamAppealAllowedActions;
}

export interface ExamAppealDetailDto {
  appealId: string;
  examResultId: string;
  status: string;
  reason: string;
  decision: string | null;
  decisionReason: string | null;
  createdAt: Date;
  decidedAt: Date | null;
  closedAt: Date | null;
  originalResult: ExamOfficialResultDto | null;
  currentOfficialResult: ExamOfficialResultDto | null;
  revisions: ExamResultRevisionSummaryDto[];
  ownership: { studentId: string; requestedById: string };
  allowedActions: ExamAppealAllowedActions;
}

export interface ExamAppealAdminListFilters {
  status?: string;
  examSessionId?: string;
  levelSubjectId?: string;
  studentId?: string;
  createdFrom?: Date;
  createdTo?: Date;
  search?: string;
  page?: number;
  pageSize?: number;
}

// ─── Grade Binding / Integration ──────────────────────────────────────────────

export interface ExamGradeBindingDto {
  examSessionId: string;
  levelSubjectId: string;
  bindingId: string | null;
  assessmentComponentId: string | null;
  componentName: string | null;
  componentMaxGrade: number | null;
  examMaxScore: number | null;
  compatible: boolean;
  consumed: boolean;
  canBind: boolean;
  canRebind: boolean;
  blockers: string[];
}

export interface ExamIntegrationResultStatusDto {
  examResultId: string;
  currentRevisionId: string | null;
  officialVersion: string;
  resultCode: string | null;
  gradeState: "MISSING" | "CURRENT" | "STALE" | "UNSUPPORTED";
  progressionState: string;
  supported: boolean;
  latestIntegratedVersion: string | null;
  latestIntegratedAt: Date | null;
  lastErrorCode: string | null;
  canIntegrate: boolean;
  canReconcile: boolean;
}

export interface ExamIntegrationStatusDto {
  examSessionId: string;
  results: ExamIntegrationResultStatusDto[];
  summary: {
    total: number;
    current: number;
    missing: number;
    stale: number;
    unsupported: number;
    failed: number;
  };
}

// ─── Operations ───────────────────────────────────────────────────────────────

export interface ExamConflictSessionRef {
  sessionId: string;
  title: string;
  startsAt: Date;
  endsAt: Date;
}

export interface ExamRoomConflictDto {
  roomId: string;
  /** Resolved room name (id is kept only for internal navigation). */
  roomName: string | null;
  sessions: ExamConflictSessionRef[];
}

export interface ExamInvigilatorConflictDto {
  invigilatorId: string;
  /** Resolved invigilator name (teacher or user; id kept only for navigation). */
  invigilatorName: string | null;
  sessions: ExamConflictSessionRef[];
}

export interface ExaminationConflictsDto {
  roomConflicts: ExamRoomConflictDto[];
  invigilatorConflicts: ExamInvigilatorConflictDto[];
  sessionsWithoutRoom: ExamConflictSessionRef[];
  sessionsWithoutInvigilators: ExamConflictSessionRef[];
  overCapacitySessions: ExamConflictSessionRef[];
  sessionsOutsidePeriodWindow: ExamConflictSessionRef[];
  counts: {
    roomConflicts: number;
    invigilatorConflicts: number;
    sessionsWithoutRoom: number;
    sessionsWithoutInvigilators: number;
    overCapacitySessions: number;
    sessionsOutsidePeriodWindow: number;
  };
}

// ─── Bulk candidate registration roster (Sprint 2.1 P3) ───────────────────────

export interface ExamRegisterableStudentDto {
  studentId: string;
  enrollmentId: string;
  name: string;
  number: string | null;
  alreadyRegistered: boolean;
}

export interface ExamRegisterablePanelDto {
  examSessionId: string;
  capacity: number;
  registeredCount: number;
  items: ExamRegisterableStudentDto[];
  /** Server-computed: may the viewer register (exams.registerCandidates)? */
  canRegister: boolean;
}

// ─── Invigilators (Increment 4 — append-only in v1; no unassign) ──────────────

export interface ExamInvigilatorDto {
  assignmentId: string;
  examSessionId: string;
  teacherId: string | null;
  userId: string | null;
  role: string;
  name: string;
}

export interface ExamInvigilatorOptionDto {
  teacherId: string;
  name: string;
}

export interface ExamInvigilatorPanelDto {
  examSessionId: string;
  items: ExamInvigilatorDto[];
  /** Active teachers to choose from (picker source). */
  assignableTeachers: ExamInvigilatorOptionDto[];
  /** Server-computed: may the viewer assign (exams.schedule)? */
  canAssign: boolean;
}

export interface ExaminationIntegrationHealthDto {
  missingBindings: number;
  unsupportedResults: number;
  staleIntegrations: number;
  failedIntegrations: number;
  consumedPublications: number;
  unreconciledRevisions: number;
  summary: {
    totalPublishedSessions: number;
    totalPublishedResults: number;
  };
}

