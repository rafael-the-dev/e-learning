// =============================================================================
// CERTIFICATE ENGINE — MODULE ENTRY POINT (Phase 0: Foundation Contracts)
// -----------------------------------------------------------------------------
// Downstream consumer of the Academic Transcript Engine (ADR-002). Phase 0 ships
// ONLY foundation contracts:
//   • constants — certificate-domain vocabularies (const objects, no DB enums)
//   • schemas   — enum-only Zod validators derived from the constants
//   • lib       — certificate numbering + content-checksum helpers
//   • types     — eligibility/finance/checksum contract shapes
//
// No repositories, services, commands, UI, eligibility, PDF/export, or public
// verification exist yet. The only Prisma model added in Phase 0 is
// `CertificateNumberCounter`. This engine NEVER reads Grade/Attendance raw tables
// and NEVER recalculates academic facts.
// =============================================================================

export * from "./constants";
export * from "./schemas/certificate.schema";
export * from "./lib/certificate-number";
export * from "./lib/certificate-checksum";
export * from "./types";
