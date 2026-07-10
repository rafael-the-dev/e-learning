// =============================================================================
// EXAMINATION ENGINE — REPOSITORIES (Phase 2)
// -----------------------------------------------------------------------------
// Tenant-safe, transaction-aware, persistence-only access for the 13 Exam*
// models. No commands, services, routes, or UI; no eligibility / scheduling /
// result / publication / appeal logic; no events published, no audit. Soft
// delete only where the model carries `deletedAt` (ExamPeriod, ExamRoom,
// ExamSession, ExamAttempt, ExamCandidate). ExamEvent is append-only. The
// scheduling conflict helpers are READ-ONLY (a Phase 4 command decides).
// =============================================================================

export * from "./exam-period.repository";
export * from "./exam-room.repository";
export * from "./exam-session.repository";
export * from "./exam-attempt.repository";
export * from "./exam-candidate.repository";
export * from "./exam-attendance.repository";
export * from "./exam-result.repository";
export * from "./exam-result-revision.repository";
export * from "./exam-appeal.repository";
export * from "./exam-publication.repository";
export * from "./exam-incident.repository";
export * from "./exam-invigilator-assignment.repository";
export * from "./exam-event.repository";
// Phase 11B — exam→grade-component binding (ADR-014); persistence only.
export * from "./exam-grade-component-binding.repository";
