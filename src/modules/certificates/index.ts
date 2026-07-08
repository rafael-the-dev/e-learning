// =============================================================================
// CERTIFICATE ENGINE — MODULE ENTRY POINT
// -----------------------------------------------------------------------------
// Downstream consumer of the Academic Transcript Engine (ADR-002).
//   • constants     — certificate-domain vocabularies (const objects, no DB enums)
//   • schemas       — enum-only Zod validators derived from the constants
//   • lib           — certificate numbering + content-checksum helpers
//   • types         — eligibility/finance/checksum contracts + transcript source DTOs
//   • repositories  — Phase 2: the Transcript source ACL (A) + the seven
//                     certificate-model repositories (B), persistence-only
//   • services      — Phase 3A: the eligibility read-aggregation façade
//                     (`CertificateEligibilitySource`) — loads facts, decides nothing
//
// Still absent: the eligibility engine itself, commands, lifecycle, UI, PDF/export,
// public verification. The engine NEVER reads Grade/Attendance raw tables and NEVER
// recalculates academic facts; all transcript reads go through
// `CertificateTranscriptSourceRepository`, the single Anti-Corruption Layer.
// =============================================================================

export * from "./constants";
export * from "./schemas/certificate.schema";
export * from "./lib/certificate-number";
export * from "./lib/certificate-checksum";
export * from "./lib/certificate-verification-url";
export * from "./types";
export * from "./repositories";
export * from "./services";
export * from "./export";
export * from "./commands";
