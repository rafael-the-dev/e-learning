// =============================================================================
// EXAMINATION ENGINE — FOUNDATION TYPES (Phase 1)
// -----------------------------------------------------------------------------
// Re-exports the domain status/vocabulary union types from `../constants` so the
// rest of the module has one import site for them. NO DTOs, NO command inputs, NO
// repository shapes, NO behaviour — those belong to later phases (repositories,
// eligibility, commands). This barrel exists only to give the data-model layer a
// stable type surface (ADR-013).
// =============================================================================

export type {
  ExamPeriodStatus,
  ExamSessionStatus,
  ExamAttemptStatus,
  ExamCandidateStatus,
  ExamAttendanceStatus,
  ExamResultStatus,
  ExamResultRevisionStatus,
  ExamResultRevisionSourceType,
  ExamAppealStatus,
  ExamPublicationStatus,
  ExamIncidentSeverity,
  ExamIncidentType,
  ExamInvigilatorRole,
  ExamEventAggregateType,
  ExamEventType,
} from "@/modules/examinations/constants";

// Phase 2 — repository record, input & filter types (persistence-shaped).
export * from "./repository";

// Phase 3A — eligibility-source input + facts contracts (read-aggregation shapes).
export * from "./eligibility-source";
