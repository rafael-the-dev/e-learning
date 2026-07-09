// =============================================================================
// EXAMINATION ENGINE — MODULE BARREL
// -----------------------------------------------------------------------------
// Single import site for the module's public surface delivered so far:
//   • Phase 1 — constants (domain vocabularies + derived union types).
//   • Phase 2 — tenant-safe, persistence-only repositories for the 13 Exam*
//     models, plus their record / input / filter types.
// No commands, services, routes, or UI are exported (later phases).
//
// `./constants` already exports both the const objects and their derived union
// types, so it is the single source for the Phase-1 vocabulary here (re-exporting
// `./types` as well would make those union names ambiguous under `export *`).
// =============================================================================

export * from "./constants";
export * from "./types/repository";
export * from "./repositories";
