// =============================================================================
// EXAMINATION ENGINE — REPOSITORY RECORD, INPUT & FILTER TYPES (Phase 2)
// -----------------------------------------------------------------------------
// Plain persistence-shaped types the examination repositories return and accept.
// They mirror the stored columns 1:1 so no Prisma model type ever leaks past the
// repository boundary. These are NOT command DTOs, NOT client/UI/API shapes, and
// carry NO Zod, NO behaviour.
//
// Column mapping rules (ADR-013 / Phase 2):
//   • Decimal (score / maxScore / normalizedScore / previousScore / revisedScore)
//     → `number | null` (or `number` where the column is required). Copied, never
//     recomputed.
//   • DateTime? → `Date | null`; DateTime → `Date`.
//   • NVarChar(Max) JSON/text columns (`eligibilitySnapshot`, `metadata`,
//     `description`) → the raw stored `string | null` — never parsed or reshaped.
//   • Ids / status / type / role → `string`.
//
// `deletedAt` appears ONLY on the five soft-deletable models (ExamPeriod,
// ExamRoom, ExamSession, ExamAttempt, ExamCandidate). ExamEvent is append-only
// and has neither `updatedAt` nor `deletedAt`.
// =============================================================================

// ─── ExamPeriod ───────────────────────────────────────────────────────────────

export interface ExamPeriodRecord {
  id: string;
  organizationId: string;
  branchId: string | null;
  name: string;
  academicYear: string;
  term: string | null;
  status: string;
  startsAt: Date;
  endsAt: Date;
  lockedAt: Date | null;
  completedAt: Date | null;
  cancelledAt: Date | null;
  createdById: string | null;
  lockedById: string | null;
  completedById: string | null;
  cancelledById: string | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export interface CreateExamPeriodInput {
  organizationId: string;
  name: string;
  academicYear: string;
  startsAt: Date;
  endsAt: Date;
  branchId?: string | null;
  term?: string | null;
  status?: string;
  createdById?: string | null;
}

export interface UpdateExamPeriodMetadataInput {
  name?: string;
  academicYear?: string;
  term?: string | null;
  branchId?: string | null;
  status?: string;
  startsAt?: Date;
  endsAt?: Date;
  lockedAt?: Date | null;
  completedAt?: Date | null;
  cancelledAt?: Date | null;
  lockedById?: string | null;
  completedById?: string | null;
  cancelledById?: string | null;
}

export interface ListExamPeriodsFilters {
  organizationId: string;
  status?: string;
  academicYear?: string;
  includeDeleted?: boolean;
  skip?: number;
  take?: number;
}

// ─── ExamRoom ───────────────────────────────────────────────────────────────

export interface ExamRoomRecord {
  id: string;
  organizationId: string;
  branchId: string | null;
  name: string;
  code: string | null;
  capacity: number;
  status: string;
  description: string | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export interface CreateExamRoomInput {
  organizationId: string;
  name: string;
  capacity: number;
  branchId?: string | null;
  code?: string | null;
  status?: string;
  description?: string | null;
}

export interface UpdateExamRoomMetadataInput {
  name?: string;
  code?: string | null;
  capacity?: number;
  status?: string;
  description?: string | null;
  branchId?: string | null;
}

export interface ListExamRoomsFilters {
  organizationId: string;
  branchId?: string;
  status?: string;
  includeDeleted?: boolean;
  skip?: number;
  take?: number;
}

// ─── ExamSession ───────────────────────────────────────────────────────────────

export interface ExamSessionRecord {
  id: string;
  organizationId: string;
  periodId: string;
  branchId: string | null;
  courseId: string | null;
  courseLevelId: string | null;
  levelSubjectId: string;
  roomId: string | null;
  title: string;
  status: string;
  startsAt: Date;
  endsAt: Date;
  capacity: number;
  instructions: string | null;
  lockedAt: Date | null;
  startedAt: Date | null;
  completedAt: Date | null;
  publishedAt: Date | null;
  cancelledAt: Date | null;
  createdById: string | null;
  lockedById: string | null;
  completedById: string | null;
  publishedById: string | null;
  cancelledById: string | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export interface CreateExamSessionInput {
  organizationId: string;
  periodId: string;
  levelSubjectId: string;
  title: string;
  startsAt: Date;
  endsAt: Date;
  capacity: number;
  branchId?: string | null;
  courseId?: string | null;
  courseLevelId?: string | null;
  roomId?: string | null;
  status?: string;
  instructions?: string | null;
  createdById?: string | null;
}

export interface UpdateExamSessionMetadataInput {
  title?: string;
  status?: string;
  roomId?: string | null;
  branchId?: string | null;
  courseId?: string | null;
  courseLevelId?: string | null;
  startsAt?: Date;
  endsAt?: Date;
  capacity?: number;
  instructions?: string | null;
  lockedAt?: Date | null;
  startedAt?: Date | null;
  completedAt?: Date | null;
  publishedAt?: Date | null;
  cancelledAt?: Date | null;
  lockedById?: string | null;
  completedById?: string | null;
  publishedById?: string | null;
  cancelledById?: string | null;
}

export interface ListExamSessionsFilters {
  organizationId: string;
  periodId?: string;
  levelSubjectId?: string;
  status?: string;
  roomId?: string;
  includeDeleted?: boolean;
  skip?: number;
  take?: number;
}

// ─── ExamAttempt ───────────────────────────────────────────────────────────────

export interface ExamAttemptRecord {
  id: string;
  organizationId: string;
  studentId: string;
  enrollmentId: string;
  levelSubjectId: string;
  attemptNumber: number;
  status: string;
  source: string | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export interface CreateExamAttemptInput {
  organizationId: string;
  studentId: string;
  enrollmentId: string;
  levelSubjectId: string;
  attemptNumber: number;
  status?: string;
  source?: string | null;
}

export interface UpdateExamAttemptMetadataInput {
  status?: string;
  source?: string | null;
}

export interface ListExamAttemptsFilters {
  organizationId: string;
  studentId?: string;
  enrollmentId?: string;
  levelSubjectId?: string;
  status?: string;
  includeDeleted?: boolean;
  skip?: number;
  take?: number;
}

// ─── ExamCandidate ───────────────────────────────────────────────────────────────

export interface ExamCandidateRecord {
  id: string;
  organizationId: string;
  examSessionId: string;
  examAttemptId: string;
  studentId: string;
  enrollmentId: string;
  eligibilityStatus: string;
  status: string;
  assignedSeat: string | null;
  registeredAt: Date | null;
  registeredById: string | null;
  withdrawnAt: Date | null;
  withdrawnById: string | null;
  disqualifiedAt: Date | null;
  disqualifiedById: string | null;
  disqualificationReason: string | null;
  overriddenById: string | null;
  overrideReason: string | null;
  eligibilitySnapshot: string | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export interface CreateExamCandidateInput {
  organizationId: string;
  examSessionId: string;
  examAttemptId: string;
  studentId: string;
  enrollmentId: string;
  eligibilityStatus?: string;
  status?: string;
  assignedSeat?: string | null;
  eligibilitySnapshot?: string | null;
}

export interface UpdateExamCandidateMetadataInput {
  eligibilityStatus?: string;
  status?: string;
  assignedSeat?: string | null;
  registeredAt?: Date | null;
  registeredById?: string | null;
  withdrawnAt?: Date | null;
  withdrawnById?: string | null;
  disqualifiedAt?: Date | null;
  disqualifiedById?: string | null;
  disqualificationReason?: string | null;
  overriddenById?: string | null;
  overrideReason?: string | null;
  eligibilitySnapshot?: string | null;
}

export interface ListExamCandidatesFilters {
  organizationId: string;
  examSessionId?: string;
  examAttemptId?: string;
  studentId?: string;
  enrollmentId?: string;
  status?: string;
  includeDeleted?: boolean;
  skip?: number;
  take?: number;
}

// ─── ExamAttendance (no deletedAt) ───────────────────────────────────────────────

export interface ExamAttendanceRecord {
  id: string;
  organizationId: string;
  examCandidateId: string;
  status: string;
  checkedInAt: Date | null;
  markedAt: Date | null;
  markedById: string | null;
  remarks: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateExamAttendanceInput {
  organizationId: string;
  examCandidateId: string;
  status: string;
  checkedInAt?: Date | null;
  markedAt?: Date | null;
  markedById?: string | null;
  remarks?: string | null;
}

export interface UpdateExamAttendanceMetadataInput {
  status?: string;
  checkedInAt?: Date | null;
  markedAt?: Date | null;
  markedById?: string | null;
  remarks?: string | null;
}

export interface ListExamAttendanceFilters {
  organizationId: string;
  status?: string;
  skip?: number;
  take?: number;
}

// ─── ExamResult (no deletedAt) ───────────────────────────────────────────────────

export interface ExamResultRecord {
  id: string;
  organizationId: string;
  examCandidateId: string;
  examAttemptId: string;
  studentId: string;
  enrollmentId: string;
  levelSubjectId: string;
  score: number | null;
  maxScore: number;
  normalizedScore: number | null;
  status: string;
  resultCode: string | null;
  markerId: string | null;
  reviewedById: string | null;
  approvedById: string | null;
  submittedAt: Date | null;
  reviewedAt: Date | null;
  approvedAt: Date | null;
  publishedAt: Date | null;
  invalidatedAt: Date | null;
  invalidationReason: string | null;
  remarks: string | null;
  resultChecksum: string | null;
  currentRevisionId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateExamResultInput {
  organizationId: string;
  examCandidateId: string;
  examAttemptId: string;
  studentId: string;
  enrollmentId: string;
  levelSubjectId: string;
  maxScore: number;
  score?: number | null;
  normalizedScore?: number | null;
  status?: string;
  resultCode?: string | null;
  markerId?: string | null;
  remarks?: string | null;
}

export interface UpdateExamResultMetadataInput {
  score?: number | null;
  maxScore?: number;
  normalizedScore?: number | null;
  status?: string;
  resultCode?: string | null;
  markerId?: string | null;
  reviewedById?: string | null;
  approvedById?: string | null;
  submittedAt?: Date | null;
  reviewedAt?: Date | null;
  approvedAt?: Date | null;
  publishedAt?: Date | null;
  invalidatedAt?: Date | null;
  invalidationReason?: string | null;
  remarks?: string | null;
  resultChecksum?: string | null;
  currentRevisionId?: string | null;
}

export interface ListExamResultsFilters {
  organizationId: string;
  status?: string;
  studentId?: string;
  enrollmentId?: string;
  levelSubjectId?: string;
  skip?: number;
  take?: number;
}

// ─── ExamResultRevision (no deletedAt; append-only create) ───────────────────────

export interface ExamResultRevisionRecord {
  id: string;
  organizationId: string;
  examResultId: string;
  revisionNumber: number;
  previousScore: number | null;
  revisedScore: number | null;
  previousStatus: string | null;
  revisedStatus: string | null;
  reason: string;
  sourceType: string;
  status: string;
  isCurrent: boolean;
  createdById: string | null;
  approvedById: string | null;
  approvedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateExamResultRevisionInput {
  organizationId: string;
  examResultId: string;
  revisionNumber: number;
  reason: string;
  sourceType: string;
  previousScore?: number | null;
  revisedScore?: number | null;
  previousStatus?: string | null;
  revisedStatus?: string | null;
  status?: string;
  isCurrent?: boolean;
  createdById?: string | null;
}

/** The current-revision status flags a repository may toggle (thin primitives).
 *  No score / reason / sourceType is ever updated — revisions are append-only. */
export interface UpdateExamResultRevisionMetadataInput {
  status?: string;
  revisedStatus?: string | null;
  approvedById?: string | null;
  approvedAt?: Date | null;
}

// ─── ExamAppeal (no deletedAt) ───────────────────────────────────────────────────

export interface ExamAppealRecord {
  id: string;
  organizationId: string;
  examResultId: string;
  studentId: string;
  requestedById: string;
  reason: string;
  status: string;
  decision: string | null;
  decisionReason: string | null;
  decidedById: string | null;
  decidedAt: Date | null;
  closedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateExamAppealInput {
  organizationId: string;
  examResultId: string;
  studentId: string;
  requestedById: string;
  reason: string;
  status?: string;
}

export interface UpdateExamAppealMetadataInput {
  status?: string;
  decision?: string | null;
  decisionReason?: string | null;
  decidedById?: string | null;
  decidedAt?: Date | null;
  closedAt?: Date | null;
}

export interface ListExamAppealsFilters {
  organizationId: string;
  status?: string;
  studentId?: string;
  examResultId?: string;
  skip?: number;
  take?: number;
}

// ─── ExamPublication (no deletedAt) ───────────────────────────────────────────────

export interface ExamPublicationRecord {
  id: string;
  organizationId: string;
  examSessionId: string;
  status: string;
  publishedAt: Date | null;
  publishedById: string | null;
  retractedAt: Date | null;
  retractedById: string | null;
  reason: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateExamPublicationInput {
  organizationId: string;
  examSessionId: string;
  status?: string;
  reason?: string | null;
}

export interface UpdateExamPublicationMetadataInput {
  status?: string;
  publishedAt?: Date | null;
  publishedById?: string | null;
  retractedAt?: Date | null;
  retractedById?: string | null;
  reason?: string | null;
}

export interface ListExamPublicationsFilters {
  organizationId: string;
  status?: string;
  skip?: number;
  take?: number;
}

// ─── ExamIncident (no deletedAt) ───────────────────────────────────────────────────

export interface ExamIncidentRecord {
  id: string;
  organizationId: string;
  examSessionId: string;
  examCandidateId: string | null;
  type: string;
  severity: string;
  description: string;
  actionTaken: string | null;
  reportedById: string | null;
  reportedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateExamIncidentInput {
  organizationId: string;
  examSessionId: string;
  type: string;
  severity: string;
  description: string;
  examCandidateId?: string | null;
  actionTaken?: string | null;
  reportedById?: string | null;
  reportedAt?: Date;
}

export interface UpdateExamIncidentMetadataInput {
  type?: string;
  severity?: string;
  description?: string;
  actionTaken?: string | null;
  reportedById?: string | null;
}

export interface ListExamIncidentsFilters {
  organizationId: string;
  examSessionId?: string;
  examCandidateId?: string;
  severity?: string;
  skip?: number;
  take?: number;
}

// ─── ExamInvigilatorAssignment (no deletedAt) ────────────────────────────────────

export interface ExamInvigilatorAssignmentRecord {
  id: string;
  organizationId: string;
  examSessionId: string;
  teacherId: string | null;
  userId: string | null;
  role: string;
  assignedAt: Date;
  assignedById: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateExamInvigilatorAssignmentInput {
  organizationId: string;
  examSessionId: string;
  role: string;
  teacherId?: string | null;
  userId?: string | null;
  assignedAt?: Date;
  assignedById?: string | null;
}

export interface UpdateExamInvigilatorAssignmentMetadataInput {
  role?: string;
  teacherId?: string | null;
  userId?: string | null;
  assignedById?: string | null;
}

export interface ListExamInvigilatorAssignmentsFilters {
  organizationId: string;
  teacherId?: string;
  userId?: string;
  skip?: number;
  take?: number;
}

// ─── ExamEvent (append-only; no updatedAt / deletedAt) ────────────────────────────

export interface ExamEventRecord {
  id: string;
  organizationId: string;
  aggregateType: string;
  aggregateId: string;
  eventType: string;
  previousStatus: string | null;
  newStatus: string | null;
  actorId: string | null;
  reason: string | null;
  metadata: string | null;
  createdAt: Date;
}

export interface CreateExamEventInput {
  organizationId: string;
  aggregateType: string;
  aggregateId: string;
  eventType: string;
  previousStatus?: string | null;
  newStatus?: string | null;
  actorId?: string | null;
  reason?: string | null;
  metadata?: string | null;
}

export interface ListExamEventsFilters {
  organizationId: string;
  aggregateType?: string;
  eventType?: string;
  skip?: number;
  take?: number;
}

// =============================================================================
// PHASE 4 — SCHEDULING PARAM TYPES (conditional-write / read primitives)
// -----------------------------------------------------------------------------
// Thin param shapes for the Phase-4 repository primitives. Every conditional
// write is org-scoped and carries the expected current status in its `where`
// (the actual guard lives in the repo function body); these types only describe
// the columns the caller resolves. They make NO business decision.
// =============================================================================

// ─── ExamPeriod lifecycle marks ─────────────────────────────────────────────

export interface MarkExamPeriodOpenParams {
  organizationId: string;
  id: string;
}

export interface MarkExamPeriodLockedParams {
  organizationId: string;
  id: string;
  lockedById?: string | null;
}

export interface MarkExamPeriodCompletedParams {
  organizationId: string;
  id: string;
  completedById?: string | null;
}

export interface MarkExamPeriodCancelledParams {
  organizationId: string;
  id: string;
  cancelledById?: string | null;
}

// ─── ExamSession lifecycle marks ────────────────────────────────────────────

export interface MarkExamSessionScheduledParams {
  organizationId: string;
  id: string;
}

export interface MarkExamSessionLockedParams {
  organizationId: string;
  id: string;
  lockedById?: string | null;
}

export interface MarkExamSessionStartedParams {
  organizationId: string;
  id: string;
}

export interface MarkExamSessionCompletedParams {
  organizationId: string;
  id: string;
  completedById?: string | null;
}

export interface MarkExamSessionCancelledParams {
  organizationId: string;
  id: string;
  cancelledById?: string | null;
}

// ─── ExamRoom archive + future-session read ─────────────────────────────────

export interface ArchiveExamRoomParams {
  organizationId: string;
  id: string;
}

export interface FindFutureSessionsByRoomParams {
  organizationId: string;
  roomId: string;
  after: Date;
}

/** Minimal projection returned by `findFutureSessionsByRoom` — enough for the
 *  archive guard to reason about occupancy, never the full session record. */
export interface ExamRoomFutureSessionRef {
  id: string;
  status: string;
  startsAt: Date;
  endsAt: Date;
}

// ─── ExamInvigilatorAssignment duplicate lookups ────────────────────────────

export interface FindAssignmentBySessionTeacherParams {
  organizationId: string;
  examSessionId: string;
  teacherId: string;
}

export interface FindAssignmentBySessionUserParams {
  organizationId: string;
  examSessionId: string;
  userId: string;
}
