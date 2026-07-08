// =============================================================================
// CERTIFICATE ENGINE — COMMANDS (Phase 4+)
// -----------------------------------------------------------------------------
// State-mutating operations, each a `BaseCommand` (validate → authorize → execute).
// Commands ORCHESTRATE and PERSIST; they never decide eligibility — that is the
// sole authority of `CertificateEligibilityEngine` (Rules C-3/C-5).
//
// Phase 4 — `GenerateCertificateCommand`: creates a DRAFT / PENDING_APPROVAL
// certificate from an issued transcript. Still absent: issue, revoke/suspend/
// restore, stale handling, export — later phases.
// =============================================================================

export * from "./generate-certificate.command";
