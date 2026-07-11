import type { AuthContext } from "@/server/auth/context";
import { PERMISSIONS } from "@/server/auth/permissions";
import {
  ExamAppealStatus,
  ExamCandidateStatus,
  ExamPeriodStatus,
  ExamResultStatus,
  ExamSessionStatus,
} from "@/modules/examinations/constants";
import type {
  ExamPeriodRecord,
  ExamSessionRecord,
} from "@/modules/examinations/types/repository";
import type {
  ExamAppealAllowedActions,
  ExamAttendanceAllowedActions,
  ExamCandidateAllowedActions,
  ExamPeriodAllowedActions,
  ExamPeriodDetailDto,
  ExamPeriodListItemDto,
  ExamPublicationAllowedActions,
  ExamResultAllowedActions,
  ExamRoomAllowedActions,
  ExamSessionAllowedActions,
  ExamSessionDetailDto,
  ExamSessionListItemDto,
} from "@/modules/examinations/types/portal";

// =============================================================================
// EXAMINATION PORTAL MAPPER (Phase 12) — pure, READ-ONLY DTO shaping + gating
// -----------------------------------------------------------------------------
// Maps ExamPeriod / ExamSession records → outward portal DTOs and computes the
// server-side `allowedActions` from the caller's permissions + the entity status
// (conservative UI flags; the commands remain authoritative — a `true` flag never
// grants, it only reveals a button). PURE: no DB, no writes, no command, no
// event/audit read, no cross-engine read. The read services own data access.
// =============================================================================

// ─── Caller capabilities (RBAC only) ──────────────────────────────────────────

export interface ExamPeriodActionCaps {
  canSchedule: boolean;
}

export interface ExamSessionActionCaps {
  canSchedule: boolean;
  canRegisterCandidate: boolean;
  canMarkAttendance: boolean;
  canEnterResults: boolean;
  canPublish: boolean;
  canRetract: boolean;
  canIntegrate: boolean;
}

export function resolvePeriodCaps(context: AuthContext): ExamPeriodActionCaps {
  return { canSchedule: context.ability.can(PERMISSIONS.EXAMS_SCHEDULE) };
}

export function resolveSessionCaps(context: AuthContext): ExamSessionActionCaps {
  const a = context.ability;
  return {
    canSchedule: a.can(PERMISSIONS.EXAMS_SCHEDULE),
    canRegisterCandidate: a.can(PERMISSIONS.EXAMS_REGISTER_CANDIDATES),
    canMarkAttendance: a.can(PERMISSIONS.EXAMS_MARK_ATTENDANCE),
    canEnterResults: a.can(PERMISSIONS.EXAMS_ENTER_RESULTS),
    canPublish: a.can(PERMISSIONS.EXAMS_PUBLISH_RESULTS),
    canRetract: a.can(PERMISSIONS.EXAMS_RETRACT_PUBLICATION),
    canIntegrate: a.can(PERMISSIONS.EXAMS_INTEGRATE_RESULTS),
  };
}

// ─── ExamPeriod ───────────────────────────────────────────────────────────────

const PERIOD_CANCELLABLE: ReadonlySet<string> = new Set([
  ExamPeriodStatus.DRAFT,
  ExamPeriodStatus.OPEN,
  ExamPeriodStatus.LOCKED,
]);

/** Period action flags (mirror the command state machine: DRAFT→OPEN→LOCKED→
 *  COMPLETED; pre-terminal→CANCELLED). Conservative — the command re-checks. */
export function computePeriodAllowedActions(
  status: string,
  caps: ExamPeriodActionCaps
): ExamPeriodAllowedActions {
  return {
    canOpen: caps.canSchedule && status === ExamPeriodStatus.DRAFT,
    canLock: caps.canSchedule && status === ExamPeriodStatus.OPEN,
    canComplete: caps.canSchedule && status === ExamPeriodStatus.LOCKED,
    canCancel: caps.canSchedule && PERIOD_CANCELLABLE.has(status),
  };
}

export function toPeriodListItemDto(
  r: ExamPeriodRecord,
  caps: ExamPeriodActionCaps
): ExamPeriodListItemDto {
  return {
    id: r.id,
    name: r.name,
    academicYear: r.academicYear,
    term: r.term,
    branchId: r.branchId,
    status: r.status,
    startsAt: r.startsAt,
    endsAt: r.endsAt,
    allowedActions: computePeriodAllowedActions(r.status, caps),
  };
}

export function toPeriodDetailDto(
  r: ExamPeriodRecord,
  sessionCount: number,
  caps: ExamPeriodActionCaps
): ExamPeriodDetailDto {
  return {
    ...toPeriodListItemDto(r, caps),
    lockedAt: r.lockedAt,
    completedAt: r.completedAt,
    cancelledAt: r.cancelledAt,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    sessionCount,
  };
}

// ─── ExamSession ───────────────────────────────────────────────────────────────

const SESSION_CANCELLABLE: ReadonlySet<string> = new Set([
  ExamSessionStatus.DRAFT,
  ExamSessionStatus.SCHEDULED,
  ExamSessionStatus.LOCKED,
]);
const ATTENDANCE_OPEN: ReadonlySet<string> = new Set([
  ExamSessionStatus.LOCKED,
  ExamSessionStatus.IN_PROGRESS,
]);
const RESULTS_OPEN: ReadonlySet<string> = new Set([
  ExamSessionStatus.IN_PROGRESS,
  ExamSessionStatus.COMPLETED,
]);
const PUBLISH_OPEN: ReadonlySet<string> = new Set([
  ExamSessionStatus.COMPLETED,
  ExamSessionStatus.RESULTS_RECORDED,
]);

/** Session action flags across the two-track lifecycle (scheduling + operational).
 *  Conservative UI flags; every command re-validates state + attendance + separation. */
export function computeSessionAllowedActions(
  status: string,
  caps: ExamSessionActionCaps
): ExamSessionAllowedActions {
  return {
    canSchedule: caps.canSchedule && status === ExamSessionStatus.DRAFT,
    canLock: caps.canSchedule && status === ExamSessionStatus.SCHEDULED,
    canStart: caps.canSchedule && status === ExamSessionStatus.LOCKED,
    canComplete: caps.canSchedule && status === ExamSessionStatus.IN_PROGRESS,
    canCancel: caps.canSchedule && SESSION_CANCELLABLE.has(status),
    canRegisterCandidate: caps.canRegisterCandidate && status === ExamSessionStatus.SCHEDULED,
    canMarkAttendance: caps.canMarkAttendance && ATTENDANCE_OPEN.has(status),
    canEnterResults: caps.canEnterResults && RESULTS_OPEN.has(status),
    canPublish: caps.canPublish && PUBLISH_OPEN.has(status),
    canRetract: caps.canRetract && status === ExamSessionStatus.PUBLISHED,
    // Binding is allowed while the session is not cancelled (consumption is
    // re-checked by the command); integration only once the session is PUBLISHED.
    canBindGradeComponent: caps.canIntegrate && status !== ExamSessionStatus.CANCELLED,
    canIntegrate: caps.canIntegrate && status === ExamSessionStatus.PUBLISHED,
  };
}

export function toSessionListItemDto(
  r: ExamSessionRecord,
  caps: ExamSessionActionCaps
): ExamSessionListItemDto {
  return {
    id: r.id,
    title: r.title,
    periodId: r.periodId,
    levelSubjectId: r.levelSubjectId,
    courseId: r.courseId,
    courseLevelId: r.courseLevelId,
    branchId: r.branchId,
    roomId: r.roomId,
    status: r.status,
    startsAt: r.startsAt,
    endsAt: r.endsAt,
    capacity: r.capacity,
    allowedActions: computeSessionAllowedActions(r.status, caps),
  };
}

export interface SessionDetailCounts {
  registeredCandidateCount: number;
  attendanceMarkedCount: number;
  resultCount: number;
}

export function toSessionDetailDto(
  r: ExamSessionRecord,
  counts: SessionDetailCounts,
  caps: ExamSessionActionCaps
): ExamSessionDetailDto {
  return {
    ...toSessionListItemDto(r, caps),
    instructions: r.instructions,
    lockedAt: r.lockedAt,
    startedAt: r.startedAt,
    completedAt: r.completedAt,
    publishedAt: r.publishedAt,
    cancelledAt: r.cancelledAt,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    registeredCandidateCount: counts.registeredCandidateCount,
    attendanceMarkedCount: counts.attendanceMarkedCount,
    resultCount: counts.resultCount,
  };
}

// =============================================================================
// INCREMENT 2 — allowedActions (PURE). Each mirrors the command state machine +
// permissions; conservative UI flags — the command re-validates authoritatively.
// =============================================================================

const REGISTERED = ExamCandidateStatus.REGISTERED;
const ATTENDANCE_OPEN_STATUSES: ReadonlySet<string> = new Set([
  ExamSessionStatus.LOCKED,
  ExamSessionStatus.IN_PROGRESS,
]);
const RESULT_OPEN_STATUSES: ReadonlySet<string> = new Set([
  ExamSessionStatus.IN_PROGRESS,
  ExamSessionStatus.COMPLETED,
]);
const PUBLISH_OPEN_STATUSES: ReadonlySet<string> = new Set([
  ExamSessionStatus.COMPLETED,
  ExamSessionStatus.RESULTS_RECORDED,
]);
const ROOM_ARCHIVED = "ARCHIVED";

// ─── Room ─────────────────────────────────────────────────────────────────────

export interface ExamRoomActionCaps {
  canManage: boolean; // exams.schedule
}
export function resolveRoomCaps(context: AuthContext): ExamRoomActionCaps {
  return { canManage: context.ability.can(PERMISSIONS.EXAMS_SCHEDULE) };
}
export function computeRoomAllowedActions(
  status: string,
  hasFutureActiveSessions: boolean,
  caps: ExamRoomActionCaps
): ExamRoomAllowedActions {
  const notArchived = status !== ROOM_ARCHIVED;
  return {
    canEdit: caps.canManage && notArchived,
    canArchive: caps.canManage && notArchived && !hasFutureActiveSessions,
  };
}

// ─── Candidate ────────────────────────────────────────────────────────────────

export interface ExamCandidateActionCaps {
  canRegister: boolean; // exams.registerCandidates (also withdraw/disqualify)
  canMarkAttendance: boolean;
  canEnterResults: boolean;
  canView: boolean;
}
export function resolveCandidateCaps(context: AuthContext): ExamCandidateActionCaps {
  const a = context.ability;
  return {
    canRegister: a.can(PERMISSIONS.EXAMS_REGISTER_CANDIDATES),
    canMarkAttendance: a.can(PERMISSIONS.EXAMS_MARK_ATTENDANCE),
    canEnterResults: a.can(PERMISSIONS.EXAMS_ENTER_RESULTS),
    canView: a.can(PERMISSIONS.EXAMS_VIEW),
  };
}
export function computeCandidateAllowedActions(
  candidateStatus: string,
  sessionStatus: string,
  hasAttendance: boolean,
  hasResult: boolean,
  caps: ExamCandidateActionCaps
): ExamCandidateAllowedActions {
  const isRegistered = candidateStatus === REGISTERED;
  return {
    canWithdraw: caps.canRegister && isRegistered,
    canDisqualify: caps.canRegister && isRegistered,
    canMarkAttendance:
      caps.canMarkAttendance && isRegistered && !hasAttendance && ATTENDANCE_OPEN_STATUSES.has(sessionStatus),
    canEnterResult:
      caps.canEnterResults && isRegistered && hasAttendance && !hasResult && RESULT_OPEN_STATUSES.has(sessionStatus),
    canViewAttendance: caps.canView,
    canViewResult: caps.canView,
  };
}

// ─── Attendance ────────────────────────────────────────────────────────────────

export interface ExamAttendanceActionCaps {
  canMark: boolean;
  canCorrect: boolean;
}
export function resolveAttendanceCaps(context: AuthContext): ExamAttendanceActionCaps {
  return {
    canMark: context.ability.can(PERMISSIONS.EXAMS_MARK_ATTENDANCE),
    canCorrect: context.ability.can(PERMISSIONS.EXAMS_CORRECT_ATTENDANCE),
  };
}
export function computeAttendanceAllowedActions(
  candidateStatus: string,
  sessionStatus: string,
  hasAttendance: boolean,
  caps: ExamAttendanceActionCaps
): ExamAttendanceAllowedActions {
  return {
    canMark:
      caps.canMark &&
      candidateStatus === REGISTERED &&
      !hasAttendance &&
      ATTENDANCE_OPEN_STATUSES.has(sessionStatus),
    canCorrect:
      caps.canCorrect &&
      hasAttendance &&
      (ATTENDANCE_OPEN_STATUSES.has(sessionStatus) || sessionStatus === ExamSessionStatus.COMPLETED),
  };
}

// ─── Result ───────────────────────────────────────────────────────────────────

export interface ExamResultActionCaps {
  canEnter: boolean;
  canSubmit: boolean;
  canReview: boolean;
  canApprove: boolean;
  canReturn: boolean;
  canIntegrate: boolean;
}
export function resolveResultCaps(context: AuthContext): ExamResultActionCaps {
  const a = context.ability;
  return {
    canEnter: a.can(PERMISSIONS.EXAMS_ENTER_RESULTS),
    canSubmit: a.can(PERMISSIONS.EXAMS_SUBMIT_RESULTS),
    canReview: a.can(PERMISSIONS.EXAMS_REVIEW_RESULTS),
    canApprove: a.can(PERMISSIONS.EXAMS_APPROVE_RESULTS),
    canReturn: a.can(PERMISSIONS.EXAMS_RETURN_RESULTS_FOR_CORRECTION),
    canIntegrate: a.can(PERMISSIONS.EXAMS_INTEGRATE_RESULTS),
  };
}
export function computeResultAllowedActions(
  resultStatus: string | null,
  sessionStatus: string,
  caps: ExamResultActionCaps
): ExamResultAllowedActions {
  const hasResult = resultStatus !== null;
  return {
    canCreate: caps.canEnter && !hasResult && RESULT_OPEN_STATUSES.has(sessionStatus),
    canEdit: caps.canEnter && resultStatus === ExamResultStatus.DRAFT,
    canSubmit:
      caps.canSubmit && resultStatus === ExamResultStatus.DRAFT && sessionStatus === ExamSessionStatus.COMPLETED,
    canReview: caps.canReview && resultStatus === ExamResultStatus.SUBMITTED,
    canApprove: caps.canApprove && resultStatus === ExamResultStatus.REVIEWED,
    canReturnForCorrection:
      caps.canReturn &&
      (resultStatus === ExamResultStatus.SUBMITTED || resultStatus === ExamResultStatus.REVIEWED),
    canIntegrate: caps.canIntegrate && resultStatus === ExamResultStatus.PUBLISHED,
    canReconcile: caps.canIntegrate && resultStatus === ExamResultStatus.PUBLISHED,
  };
}

// ─── Publication ──────────────────────────────────────────────────────────────

export interface ExamPublicationActionCaps {
  canPublish: boolean;
  canRetract: boolean;
}
export function resolvePublicationCaps(context: AuthContext): ExamPublicationActionCaps {
  return {
    canPublish: context.ability.can(PERMISSIONS.EXAMS_PUBLISH_RESULTS),
    canRetract: context.ability.can(PERMISSIONS.EXAMS_RETRACT_PUBLICATION),
  };
}
export function computePublicationAllowedActions(
  ready: boolean,
  sessionStatus: string,
  hasActivePublication: boolean,
  downstreamConsumed: boolean,
  caps: ExamPublicationActionCaps
): ExamPublicationAllowedActions {
  return {
    canPublish:
      caps.canPublish && ready && !hasActivePublication && PUBLISH_OPEN_STATUSES.has(sessionStatus),
    canRetract:
      caps.canRetract &&
      hasActivePublication &&
      sessionStatus === ExamSessionStatus.PUBLISHED &&
      !downstreamConsumed,
  };
}

// ─── Appeal ───────────────────────────────────────────────────────────────────

export interface ExamAppealActionCaps {
  canReview: boolean;
  canApprove: boolean;
  canReject: boolean;
}
export function resolveAppealCaps(context: AuthContext): ExamAppealActionCaps {
  const a = context.ability;
  return {
    canReview: a.can(PERMISSIONS.EXAMS_REVIEW_APPEAL),
    canApprove: a.can(PERMISSIONS.EXAMS_APPROVE_APPEAL),
    canReject: a.can(PERMISSIONS.EXAMS_REJECT_APPEAL),
  };
}
export function computeAppealAllowedActions(
  status: string,
  caps: ExamAppealActionCaps
): ExamAppealAllowedActions {
  return {
    canReview: caps.canReview && status === ExamAppealStatus.PENDING,
    canApprove: caps.canApprove && status === ExamAppealStatus.UNDER_REVIEW,
    canReject: caps.canReject && status === ExamAppealStatus.UNDER_REVIEW,
  };
}

// ─── Integration ──────────────────────────────────────────────────────────────

export interface ExamIntegrationActionCaps {
  canIntegrate: boolean; // exams.integrateResults (also binding)
}
export function resolveIntegrationCaps(context: AuthContext): ExamIntegrationActionCaps {
  return { canIntegrate: context.ability.can(PERMISSIONS.EXAMS_INTEGRATE_RESULTS) };
}
/** Per-result integrate/reconcile flags: integrate a MISSING grade, reconcile a STALE one;
 *  UNSUPPORTED / CURRENT offer neither. */
export function computeResultIntegrationActions(
  gradeState: "MISSING" | "CURRENT" | "STALE" | "UNSUPPORTED",
  supported: boolean,
  caps: ExamIntegrationActionCaps
): { canIntegrate: boolean; canReconcile: boolean } {
  return {
    canIntegrate: caps.canIntegrate && supported && gradeState === "MISSING",
    canReconcile: caps.canIntegrate && supported && gradeState === "STALE",
  };
}
