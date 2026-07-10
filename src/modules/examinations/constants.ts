// =============================================================================
// EXAMINATION ENGINE — CONSTANTS (const objects, no native enums)
// -----------------------------------------------------------------------------
// Phase 1: Data Model. Domain vocabularies as `const` objects + derived
// string-literal types, per the project convention (SQL Server has no native
// enums — every status is a String column). Values are the canonical domain
// strings that travel in payloads / DB columns and are NEVER translated
// (translation happens only at the render layer).
//
// This file carries NO behaviour — only the vocabularies the schema's String
// status columns align to (ADR-013). Eligibility / scheduling / publication /
// appeal logic are later phases.
//
// The Examination Engine is a bounded context (E-1) that consumes Academic Core
// facts but never owns them, never writes grades (E-13), and never mutates the
// Transcript/Certificate engines (E-11). See docs/examination-engine.md.
// =============================================================================

/** Exam calendar container lifecycle (§4). */
export const ExamPeriodStatus = {
  DRAFT: "DRAFT",
  OPEN: "OPEN",
  LOCKED: "LOCKED",
  COMPLETED: "COMPLETED",
  CANCELLED: "CANCELLED",
} as const;
export type ExamPeriodStatus = (typeof ExamPeriodStatus)[keyof typeof ExamPeriodStatus];

/** Scheduled exam sitting lifecycle (§4). */
export const ExamSessionStatus = {
  DRAFT: "DRAFT",
  SCHEDULED: "SCHEDULED",
  LOCKED: "LOCKED",
  IN_PROGRESS: "IN_PROGRESS",
  COMPLETED: "COMPLETED",
  RESULTS_RECORDED: "RESULTS_RECORDED",
  PUBLISHED: "PUBLISHED",
  CANCELLED: "CANCELLED",
} as const;
export type ExamSessionStatus = (typeof ExamSessionStatus)[keyof typeof ExamSessionStatus];

/** First-class attempt / re-sit lifecycle (§4 / D12). */
export const ExamAttemptStatus = {
  OPEN: "OPEN",
  SAT: "SAT",
  RESULTED: "RESULTED",
  ABANDONED: "ABANDONED",
} as const;
export type ExamAttemptStatus = (typeof ExamAttemptStatus)[keyof typeof ExamAttemptStatus];

/** Candidate registration/eligibility lifecycle (§4). */
export const ExamCandidateStatus = {
  PENDING_ELIGIBILITY: "PENDING_ELIGIBILITY",
  ELIGIBLE: "ELIGIBLE",
  INELIGIBLE: "INELIGIBLE",
  REGISTERED: "REGISTERED",
  WITHDRAWN: "WITHDRAWN",
  DISQUALIFIED: "DISQUALIFIED",
} as const;
export type ExamCandidateStatus =
  (typeof ExamCandidateStatus)[keyof typeof ExamCandidateStatus];

/** Exam attendance — SEPARATE from class attendance (E-10). Value-set (§8). */
export const ExamAttendanceStatus = {
  PRESENT: "PRESENT",
  ABSENT: "ABSENT",
  LATE: "LATE",
  EXCUSED: "EXCUSED",
  DISQUALIFIED: "DISQUALIFIED",
} as const;
export type ExamAttendanceStatus =
  (typeof ExamAttendanceStatus)[keyof typeof ExamAttendanceStatus];

/** Official exam result lifecycle (§4). PUBLISHED is never mutated; INVALIDATED is
 *  pre-publication only; post-publication corrections use ExamResultRevision (E-6a). */
export const ExamResultStatus = {
  DRAFT: "DRAFT",
  SUBMITTED: "SUBMITTED",
  REVIEWED: "REVIEWED",
  APPROVED: "APPROVED",
  PUBLISHED: "PUBLISHED",
  INVALIDATED: "INVALIDATED",
} as const;
export type ExamResultStatus = (typeof ExamResultStatus)[keyof typeof ExamResultStatus];

/** Append-only post-publication correction/revision lifecycle (§4 / D14). */
export const ExamResultRevisionStatus = {
  DRAFT: "DRAFT",
  APPROVED: "APPROVED",
  CURRENT: "CURRENT",
  REJECTED: "REJECTED",
  CANCELLED: "CANCELLED",
} as const;
export type ExamResultRevisionStatus =
  (typeof ExamResultRevisionStatus)[keyof typeof ExamResultRevisionStatus];

/** Source that produced an ExamResultRevision (§3.7 / D14). */
export const ExamResultRevisionSourceType = {
  APPEAL: "APPEAL",
  RETRACTION: "RETRACTION",
  CORRECTION: "CORRECTION",
} as const;
export type ExamResultRevisionSourceType =
  (typeof ExamResultRevisionSourceType)[keyof typeof ExamResultRevisionSourceType];

/** Appeal workflow lifecycle (§4 / §11). */
export const ExamAppealStatus = {
  PENDING: "PENDING",
  UNDER_REVIEW: "UNDER_REVIEW",
  APPROVED: "APPROVED",
  REJECTED: "REJECTED",
  CLOSED: "CLOSED",
} as const;
export type ExamAppealStatus = (typeof ExamAppealStatus)[keyof typeof ExamAppealStatus];

/** Publication (visibility boundary) lifecycle (§4 / §10 / E-7). */
export const ExamPublicationStatus = {
  DRAFT: "DRAFT",
  PUBLISHED: "PUBLISHED",
  RETRACTED: "RETRACTED",
} as const;
export type ExamPublicationStatus =
  (typeof ExamPublicationStatus)[keyof typeof ExamPublicationStatus];

/** Incident severity (§3.10). */
export const ExamIncidentSeverity = {
  LOW: "LOW",
  MEDIUM: "MEDIUM",
  HIGH: "HIGH",
  CRITICAL: "CRITICAL",
} as const;
export type ExamIncidentSeverity =
  (typeof ExamIncidentSeverity)[keyof typeof ExamIncidentSeverity];

/** Incident type (§3.10). Extensible vocabulary; stored as String. */
export const ExamIncidentType = {
  MISCONDUCT: "MISCONDUCT",
  MEDICAL: "MEDICAL",
  TECHNICAL: "TECHNICAL",
  ABSENCE: "ABSENCE",
  IRREGULARITY: "IRREGULARITY",
  OTHER: "OTHER",
} as const;
export type ExamIncidentType = (typeof ExamIncidentType)[keyof typeof ExamIncidentType];

/** Invigilator/marker role on a session (§3.12). Stored as String. */
export const ExamInvigilatorRole = {
  CHIEF: "CHIEF",
  INVIGILATOR: "INVIGILATOR",
  MARKER: "MARKER",
  OBSERVER: "OBSERVER",
} as const;
export type ExamInvigilatorRole =
  (typeof ExamInvigilatorRole)[keyof typeof ExamInvigilatorRole];

/** Reasons the ExaminationEligibilityEngine (Phase 3B) blocks generation/registration.
 *  ACADEMIC/ADMINISTRATIVE only — race-sensitive operational blockers (SESSION_FULL,
 *  ALREADY_REGISTERED, room/invigilator/seat/timetable conflicts) are NOT here; they
 *  are decided by commands via conditional writes (E-3a / §5 command-level blockers). */
export const ExaminationEligibilityBlocker = {
  NO_STUDENT: "NO_STUDENT",
  NO_ACTIVE_ENROLLMENT: "NO_ACTIVE_ENROLLMENT",
  LEVEL_SUBJECT_NOT_FOUND: "LEVEL_SUBJECT_NOT_FOUND",
  SUBJECT_NOT_REGISTERED: "SUBJECT_NOT_REGISTERED",
  SUBJECT_ALREADY_PASSED: "SUBJECT_ALREADY_PASSED",
  ATTENDANCE_BELOW_REQUIRED: "ATTENDANCE_BELOW_REQUIRED",
  PREREQUISITE_NOT_MET: "PREREQUISITE_NOT_MET",
  FINANCIAL_CLEARANCE_REQUIRED: "FINANCIAL_CLEARANCE_REQUIRED",
  DISCIPLINARY_BLOCK: "DISCIPLINARY_BLOCK",
  EXAM_PERIOD_CLOSED: "EXAM_PERIOD_CLOSED",
  EXAM_SESSION_NOT_AVAILABLE: "EXAM_SESSION_NOT_AVAILABLE",
} as const;
export type ExaminationEligibilityBlocker =
  (typeof ExaminationEligibilityBlocker)[keyof typeof ExaminationEligibilityBlocker];

/** Informational signals the engine surfaces without blocking eligibility. */
export const ExaminationEligibilityWarning = {
  FINANCIAL_CLEARANCE_UNKNOWN: "FINANCIAL_CLEARANCE_UNKNOWN",
  DISCIPLINARY_STATUS_UNKNOWN: "DISCIPLINARY_STATUS_UNKNOWN",
  ATTENDANCE_UNKNOWN: "ATTENDANCE_UNKNOWN",
  PREREQUISITE_STATUS_UNKNOWN: "PREREQUISITE_STATUS_UNKNOWN",
  MANUAL_APPROVAL_REQUIRED: "MANUAL_APPROVAL_REQUIRED",
  PREVIOUS_ATTEMPTS_FOUND: "PREVIOUS_ATTEMPTS_FOUND",
  EXAM_PERIOD_MISSING: "EXAM_PERIOD_MISSING",
  EXAM_SESSION_MISSING: "EXAM_SESSION_MISSING",
} as const;
export type ExaminationEligibilityWarning =
  (typeof ExaminationEligibilityWarning)[keyof typeof ExaminationEligibilityWarning];

/** Aggregate a domain/audit event refers to (ExamEvent.aggregateType, §3.13). */
export const ExamEventAggregateType = {
  EXAM_PERIOD: "EXAM_PERIOD",
  EXAM_SESSION: "EXAM_SESSION",
  EXAM_ATTEMPT: "EXAM_ATTEMPT",
  EXAM_CANDIDATE: "EXAM_CANDIDATE",
  EXAM_ATTENDANCE: "EXAM_ATTENDANCE",
  EXAM_RESULT: "EXAM_RESULT",
  EXAM_RESULT_REVISION: "EXAM_RESULT_REVISION",
  EXAM_APPEAL: "EXAM_APPEAL",
  EXAM_PUBLICATION: "EXAM_PUBLICATION",
  EXAM_INCIDENT: "EXAM_INCIDENT",
  EXAM_INVIGILATOR_ASSIGNMENT: "EXAM_INVIGILATOR_ASSIGNMENT",
} as const;
export type ExamEventAggregateType =
  (typeof ExamEventAggregateType)[keyof typeof ExamEventAggregateType];

/** Domain/audit event vocabulary (ExamEvent.eventType, §13). Stored as String;
 *  transition-based, emitted post-commit through the Outbox in later phases. */
export const ExamEventType = {
  EXAM_PERIOD_OPENED: "exam_period.opened",
  EXAM_PERIOD_LOCKED: "exam_period.locked",
  EXAM_PERIOD_COMPLETED: "exam_period.completed",
  EXAM_PERIOD_CANCELLED: "exam_period.cancelled",
  EXAM_SESSION_SCHEDULED: "exam_session.scheduled",
  EXAM_SESSION_LOCKED: "exam_session.locked",
  EXAM_SESSION_STARTED: "exam_session.started",
  EXAM_SESSION_COMPLETED: "exam_session.completed",
  EXAM_SESSION_RESULTS_RECORDED: "exam_session.results_recorded",
  EXAM_SESSION_CANCELLED: "exam_session.cancelled",
  EXAM_CANDIDATE_REGISTERED: "exam_candidate.registered",
  EXAM_CANDIDATE_WITHDRAWN: "exam_candidate.withdrawn",
  EXAM_CANDIDATE_DISQUALIFIED: "exam_candidate.disqualified",
  EXAM_CANDIDATE_ELIGIBILITY_OVERRIDDEN: "exam_candidate.eligibility_overridden",
  EXAM_ATTENDANCE_MARKED: "exam_attendance.marked",
  EXAM_ATTENDANCE_CORRECTED: "exam_attendance.corrected",
  EXAM_RESULT_SUBMITTED: "exam_result.submitted",
  EXAM_RESULT_REVIEWED: "exam_result.reviewed",
  EXAM_RESULT_APPROVED: "exam_result.approved",
  EXAM_RESULT_PUBLISHED: "exam_result.published",
  EXAM_RESULT_INVALIDATED: "exam_result.invalidated",
  EXAM_RESULT_REVISION_CREATED: "exam_result.revision_created",
  EXAM_RESULT_SUPERSEDED: "exam_result.superseded",
  EXAM_APPEAL_CREATED: "exam_appeal.created",
  EXAM_APPEAL_DECIDED: "exam_appeal.decided",
  EXAM_PUBLICATION_PUBLISHED: "exam_publication.published",
  EXAM_PUBLICATION_RETRACTED: "exam_publication.retracted",
  EXAM_PUBLICATION_COMPLETED: "exam_publication.completed",
  EXAM_INVIGILATOR_ASSIGNED: "exam_invigilator.assigned",
} as const;
export type ExamEventType = (typeof ExamEventType)[keyof typeof ExamEventType];
