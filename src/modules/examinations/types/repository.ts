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

// H1 hardening (ADR-013): `status` is NOT a metadata field — lifecycle changes go
// only through the conditional-write marks (markExamPeriod*). Removing it makes the
// metadata helper structurally incapable of bypassing the ExamPeriod state machine.
export interface UpdateExamPeriodMetadataInput {
  name?: string;
  academicYear?: string;
  term?: string | null;
  branchId?: string | null;
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

// H1 hardening (ADR-013): `status` (lifecycle), `startsAt` / `endsAt` (the exam window)
// and `roomId` (the sitting location) are domain state, NOT metadata. They are removed
// so the metadata helper cannot re-time, re-room, or re-state a session behind the
// scheduling/lifecycle primitives.
export interface UpdateExamSessionMetadataInput {
  title?: string;
  branchId?: string | null;
  courseId?: string | null;
  courseLevelId?: string | null;
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
  // Phase 5 — registration provenance columns the command resolves from the
  // ServiceContext / engine verdict (never falsified). Optional so the Phase-2
  // callers are unaffected; the repository persists them verbatim.
  registeredAt?: Date | null;
  registeredById?: string | null;
  overriddenById?: string | null;
  overrideReason?: string | null;
}

// H1 hardening (ADR-013): the operational `status` (REGISTERED / WITHDRAWN /
// DISQUALIFIED) is lifecycle owned by the dedicated marks (markExamCandidate*) — never
// a metadata write. Removed so this helper cannot re-state a candidate.
export interface UpdateExamCandidateMetadataInput {
  eligibilityStatus?: string;
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

// H1 hardening (ADR-013 / E-6a): an ExamResult's official facts are IMMUTABLE outside
// the sanctioned lifecycle. Every scoring field (score / maxScore / normalizedScore /
// resultCode), every review-chain stamp (markerId / reviewedById / approvedById /
// submittedAt / reviewedAt / approvedAt), publication (publishedAt), invalidation
// (invalidatedAt / invalidationReason), the lifecycle `status`, and the revision
// pointer (currentRevisionId) are removed — those move ONLY through their dedicated
// conditional-write primitives (markExamResult* / updateDraftExamResultConditionally /
// updateExamResultCurrentRevision). Only genuine, non-lifecycle metadata remains: a
// free-text annotation and the integration checksum.
export interface UpdateExamResultMetadataInput {
  remarks?: string | null;
  resultChecksum?: string | null;
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

// H1 hardening (ADR-013): ExamAppeal has NO mutable non-lifecycle metadata. The
// appeal `reason` is fixed at creation; `status` and the whole decision/close record
// (decision / decisionReason / decidedById / decidedAt / closedAt) are lifecycle owned
// by the dedicated marks (markAppealUnderReview / markAppealApproved / markAppealRejected
// / markAppealWithdrawn). The metadata helper is therefore structurally incapable of
// writing any field — `Record<string, never>` rejects every non-empty patch at compile
// time (an empty `{}` type would NOT catch excess properties).
export type UpdateExamAppealMetadataInput = Record<string, never>;

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
  // Phase 9 — the publish command stamps the publication provenance at creation
  // time (both resolved from the ServiceContext / command clock, never trusted from
  // input). Optional so the Phase-2 callers are unaffected; the repo persists verbatim.
  publishedAt?: Date | null;
  publishedById?: string | null;
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

// =============================================================================
// PHASE 5 — CANDIDATE REGISTRATION PARAM TYPES (thin read / conditional write)
// -----------------------------------------------------------------------------
// Param shapes for the Phase-5 ExamCandidate primitives. Each is org-scoped and,
// for the conditional writes, pins the expected current status in its `where`
// (the guard lives in the repo body). They make NO business decision — the
// command computes eligibility + operational blockers and asserts `count === 1`.
// =============================================================================

export interface CountActiveCandidatesBySessionParams {
  organizationId: string;
  examSessionId: string;
}

export interface FindActiveCandidateBySessionStudentParams {
  organizationId: string;
  examSessionId: string;
  studentId: string;
}

export interface FindActiveCandidateBySessionSeatParams {
  organizationId: string;
  examSessionId: string;
  assignedSeat: string;
}

export interface MarkExamCandidateWithdrawnParams {
  organizationId: string;
  id: string;
  withdrawnById?: string | null;
}

export interface MarkExamCandidateDisqualifiedParams {
  organizationId: string;
  id: string;
  disqualifiedById?: string | null;
  disqualificationReason: string;
}

// =============================================================================
// PHASE 6 — ATTENDANCE PARAM TYPES (thin read / conditional write)
// -----------------------------------------------------------------------------
// Param shapes for the Phase-6 ExamAttendance / ExamCandidate primitives. Each is
// org-scoped; the conditional write pins the expected current attendance status in
// its `where` (the guard lives in the repo body). They make NO business decision —
// the command decides the session-state gate, duplicate guard, and asserts
// `count === 1` on the conditional correction. Exam attendance is SEPARATE from the
// class Attendance Engine (E-10): these types never reference it.
// =============================================================================

/** Columns a conditional attendance correction may write. `status` / `markedAt`
 *  are always set; `checkedInAt` / `remarks` only when the caller supplies them. */
export interface ExamAttendanceConditionalPatch {
  status: string;
  checkedInAt?: Date | null;
  remarks?: string | null;
  markedAt: Date;
  markedById?: string | null;
}

export interface UpdateExamAttendanceConditionallyParams {
  organizationId: string;
  examCandidateId: string;
  /** The status the row must currently hold for the write to match (race pin). */
  expectedStatus: string;
  patch: ExamAttendanceConditionalPatch;
}

export interface AttendanceBySessionParams {
  organizationId: string;
  examSessionId: string;
}

export interface ListRegisteredCandidatesBySessionParams {
  organizationId: string;
  examSessionId: string;
  skip?: number;
  take?: number;
}

// =============================================================================
// PHASE 7 — RESULT-ENTRY PARAM TYPES (thin read / conditional write)
// -----------------------------------------------------------------------------
// Param shapes for the Phase-7 ExamResult primitives. Each is org-scoped; the
// conditional writes pin `status = 'DRAFT'` in their `where` (the guard lives in
// the repo body). They make NO decision — the command derives the resultCode /
// score / normalizedScore from the attendance fact and asserts `count === 1`.
// NO normalization, NO pass/fail, NO progression lives in the repository.
// =============================================================================

/** Columns a conditional DRAFT result edit may write. All are resolved by the
 *  command; `markerId` is written only when the caller supplies it. */
export interface DraftExamResultPatch {
  score: number | null;
  maxScore: number;
  normalizedScore: number | null;
  resultCode: string;
  remarks?: string | null;
  markerId?: string | null;
}

export interface UpdateDraftExamResultConditionallyParams {
  organizationId: string;
  id: string;
  patch: DraftExamResultPatch;
}

export interface MarkExamResultSubmittedParams {
  organizationId: string;
  id: string;
  submittedAt: Date;
  markerId?: string | null;
}

export interface ResultsBySessionParams {
  organizationId: string;
  examSessionId: string;
}

// ─── Phase 8 — review / approval / return conditional-transition params ─────────
// Each pins the expected current status in the repo `where` so a concurrently-moved
// row matches zero rows (`count 0`); the command asserts `count === 1`. The repo
// makes NO lifecycle / separation / attendance decision — the command owns those.

export interface MarkExamResultReviewedParams {
  organizationId: string;
  id: string;
  reviewedById: string;
  reviewedAt: Date;
}

export interface MarkExamResultApprovedParams {
  organizationId: string;
  id: string;
  approvedById: string;
  approvedAt: Date;
}

export interface ReturnExamResultToDraftParams {
  organizationId: string;
  id: string;
  /** The status the caller observed (SUBMITTED | REVIEWED) — pinned in `where`. */
  expectedStatus: string;
  /** When true, `reviewedById` / `reviewedAt` are cleared (returning from REVIEWED). */
  clearReviewMetadata: boolean;
}

// =============================================================================
// PHASE 9 — RESULT-PUBLICATION PARAM TYPES (thin conditional-write / read)
// -----------------------------------------------------------------------------
// Param shapes for the Phase-9 ExamSession / ExamResult / ExamPublication
// primitives. Each is org-scoped; the conditional writes pin the expected current
// status in their `where` (the guard lives in the repo body) so a concurrently-
// moved / wrong-state row matches zero rows and the caller aborts. They make NO
// readiness / visibility decision — the command evaluates publication readiness and
// asserts the expected `count` before / after each write.
// =============================================================================

// ─── ExamSession publication marks ──────────────────────────────────────────

export interface MarkExamSessionResultsRecordedParams {
  organizationId: string;
  id: string;
}

export interface MarkExamSessionPublishedParams {
  organizationId: string;
  id: string;
  publishedById?: string | null;
}

export interface ReturnExamSessionToResultsRecordedParams {
  organizationId: string;
  id: string;
}

// ─── ExamResult batch publication marks (conditional) ───────────────────────

export interface MarkExamResultsPublishedConditionallyParams {
  organizationId: string;
  ids: string[];
}

export interface ReturnExamResultsToApprovedConditionallyParams {
  organizationId: string;
  ids: string[];
}

// ─── ExamPublication active-lookup + retraction mark ────────────────────────

export interface FindActivePublicationBySessionParams {
  organizationId: string;
  examSessionId: string;
}

export interface MarkExamPublicationRetractedParams {
  organizationId: string;
  id: string;
  retractedById?: string | null;
  retractedAt: Date;
  reason: string;
}

// =============================================================================
// PHASE 10 — APPEALS & RESULT-REVISION PARAM TYPES (thin conditional-write / read)
// -----------------------------------------------------------------------------
// Param shapes for the Phase-10 ExamAppeal / ExamResult primitives. Each is
// org-scoped; the conditional appeal-status marks PIN the expected current status in
// their `where` (the guard lives in the repo body) so a concurrently-moved row
// matches zero rows and the command aborts (`APPEAL_CONCURRENTLY_CHANGED`). They make
// NO workflow decision — the command owns the PENDING → UNDER_REVIEW → APPROVED /
// REJECTED / WITHDRAWN lifecycle and the append-only revision orchestration.
// =============================================================================

// ─── ExamAppeal conditional status transitions ──────────────────────────────

export interface MarkAppealUnderReviewParams {
  organizationId: string;
  id: string;
}

/** Shared shape for the two terminal decisions (APPROVED | REJECTED): both stamp
 *  `decidedById` / `decidedAt` / `decisionReason` and require UNDER_REVIEW. */
export interface MarkAppealDecidedParams {
  organizationId: string;
  id: string;
  decidedById: string;
  decidedAt: Date;
  decisionReason: string;
}

export interface MarkAppealWithdrawnParams {
  organizationId: string;
  id: string;
  closedAt: Date;
}

export interface FindActiveAppealByResultParams {
  organizationId: string;
  examResultId: string;
}

// ─── ExamResult current-revision pointer (the ONLY Phase-10 ExamResult mutation) ─

export interface UpdateExamResultCurrentRevisionParams {
  organizationId: string;
  id: string;
  currentRevisionId: string | null;
}

// =============================================================================
// PHASE 11B — EXAM→GRADE-COMPONENT BINDING TYPES (ADR-014)
// -----------------------------------------------------------------------------
// Persistence-shaped record + thin input / lookup param types for the explicit
// canonical binding that maps an ExamSession's results onto a Grade Engine
// `assessmentComponentId`. `assessmentComponentId` / `createdById` are STRING
// pointers (no FK); only `organizationId` / `examSessionId` are real FKs. Soft
// delete via `deletedAt` (one active binding per session — filtered-unique in the
// migration). NO grade math, NO rules — those live in the resolver / command.
// =============================================================================

export interface ExamGradeComponentBindingRecord {
  id: string;
  organizationId: string;
  examSessionId: string;
  assessmentComponentId: string;
  createdById: string | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export interface CreateExamGradeComponentBindingInput {
  organizationId: string;
  examSessionId: string;
  assessmentComponentId: string;
  createdById?: string | null;
}

export interface FindActiveBindingBySessionParams {
  organizationId: string;
  examSessionId: string;
}

export interface FindExamGradeComponentBindingByIdParams {
  organizationId: string;
  id: string;
}

export interface ListExamGradeComponentBindingsParams {
  organizationId: string;
  examSessionId?: string;
}

export interface ArchiveBindingParams {
  organizationId: string;
  id: string;
}
