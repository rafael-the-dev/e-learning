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
// snapshots only; never reads Academic Core / Transcript).
// Phase 9 — `ReconcileCertificateStalenessCommand`: manual/admin backfill that marks
// certificates STALE when their linked transcript version was invalidated (same
// rules as the transcript-staleness event handler; idempotent; no regeneration).
// Phase 11 — `ExportCertificateToMinistryCommand`: adapter-driven ministry/government
// export (JSON/CSV/XML) of an ISSUED certificate's frozen, privacy-minimized snapshot;
// separate from PDF export; no real external API yet (local transport).
// =============================================================================

export * from "./generate-certificate.command";
export * from "./issue-certificate.command";
export * from "./revoke-certificate.command";
export * from "./suspend-certificate.command";
export * from "./restore-certificate.command";
export * from "./export-certificate.command";
export * from "./reconcile-certificate-staleness.command";
export * from "./export-certificate-to-ministry.command";
// Phase 12 — certificate request workflow (administrative; no eligibility duplication).
export * from "./request-certificate.command";
export * from "./approve-certificate-request.command";
export * from "./reject-certificate-request.command";
export * from "./cancel-certificate-request.command";
export * from "./fulfill-certificate-request.command";
// Phase 13 — bulk operations (orchestrate the single-item commands; no new rules).
export * from "./bulk-certificate.commands";
