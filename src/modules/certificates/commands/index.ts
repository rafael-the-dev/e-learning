// =============================================================================
// CERTIFICATE ENGINE — COMMANDS (Phase 4+)
// -----------------------------------------------------------------------------
// State-mutating operations, each a `BaseCommand` (validate → authorize → execute).
// Commands ORCHESTRATE and PERSIST; they never decide eligibility — that is the
// sole authority of `CertificateEligibilityEngine` (Rules C-3/C-5).
//
// Phase 4 — `GenerateCertificateCommand`: creates a DRAFT / PENDING_APPROVAL
// certificate from an issued transcript.
// Phase 5 — `IssueCertificateCommand`: promotes a generated certificate to the
// official ISSUED record (number + checksum + verification row, event post-commit).
// Phase 6 — post-issue lifecycle: `RevokeCertificateCommand` (ISSUED|SUSPENDED →
// REVOKED, terminal), `SuspendCertificateCommand` (ISSUED → SUSPENDED),
// `RestoreCertificateCommand` (SUSPENDED → ISSUED). Still absent: STALE handling,
// export, public verification endpoint — later phases.
// =============================================================================

export * from "./generate-certificate.command";
export * from "./issue-certificate.command";
export * from "./revoke-certificate.command";
export * from "./suspend-certificate.command";
export * from "./restore-certificate.command";
