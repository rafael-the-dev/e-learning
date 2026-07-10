// =============================================================================
// EXAMINATION ENGINE — SERVICES BARREL
// -----------------------------------------------------------------------------
// Phase 3A — ExaminationEligibilitySource: a pure read-aggregation façade that
// loads the facts the ExaminationEligibilityEngine (Phase 3B) decides on. The source
// decides nothing; the engine is a pure, synchronous function of those facts.
// =============================================================================

export * from "./examination-eligibility-source.service";
export * from "./examination-eligibility.engine";
// Phase 10 — read-only current-official-result projection (ExamResult + currentRevision).
export * from "./official-exam-result.service";
// Phase 11 — read-only grade-integration source (engine-neutral integratable facts).
export * from "./examination-grade-integration.source";
