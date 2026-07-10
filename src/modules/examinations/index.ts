// =============================================================================
// EXAMINATION ENGINE — MODULE BARREL
// -----------------------------------------------------------------------------
// Single import site for the module's public surface delivered so far:
//   • Phase 1 — constants (domain vocabularies + derived union types).
//   • Phase 2 — tenant-safe, persistence-only repositories for the 13 Exam*
//     models, plus their record / input / filter types.
//   • Phase 3A — ExaminationEligibilitySource (read-aggregation façade) + its
//     input/facts contracts. Loads facts only; decides nothing.
// No commands, routes, or UI are exported (later phases).
//
// `./constants` already exports both the const objects and their derived union
// types, so it is the single source for the Phase-1 vocabulary here (re-exporting
// `./types` as well would make those union names ambiguous under `export *`).
// =============================================================================

export * from "./constants";
export * from "./types/repository";
export * from "./repositories";
// Phase 3A — eligibility-source facts contracts + the read-aggregation service.
export * from "./types/eligibility-source";
export * from "./services";
// Phase 4 — scheduling input schemas + scheduling commands.
export * from "./schemas/scheduling.schema";
// Phase 5 — candidate-registration input schemas.
export * from "./schemas/registration.schema";
// Phase 6 — exam-attendance input schemas.
export * from "./schemas/attendance.schema";
// Phase 7 — result-entry input schemas.
export * from "./schemas/result-entry.schema";
// Phase 8 — result-review input schemas (review / approve / return-for-correction).
export * from "./schemas/result-review.schema";
// Phase 9 — result-publication input schemas (publish / retract).
export * from "./schemas/publication.schema";
// Phase 10 — appeal workflow input schemas (create / review / approve / reject /
// withdraw). The official-exam-result service is re-exported via `./services`.
export * from "./schemas/appeal.schema";
// Phase 11B — exam→grade-component binding input schemas (bind / archive).
export * from "./schemas/binding.schema";
export * from "./commands";
