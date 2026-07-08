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
// `RestoreCertificateCommand` (SUSPENDED → ISSUED).
// Phase 8 — `ExportCertificateCommand`: renders an ISSUED/SUSPENDED certificate to
// a PDF artifact and tracks it in a `CertificateExport` row (consumes frozen
// snapshots only; never reads Academic Core / Transcript). Still absent: STALE
// handling, authenticated download route, ministry export — later phases.
// =============================================================================

export * from "./generate-certificate.command";
export * from "./issue-certificate.command";
export * from "./revoke-certificate.command";
export * from "./suspend-certificate.command";
export * from "./restore-certificate.command";
export * from "./export-certificate.command";
