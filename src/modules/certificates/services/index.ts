// =============================================================================
// CERTIFICATE ENGINE — SERVICES (Phase 3 + Phase 7)
// -----------------------------------------------------------------------------
// Part A — `CertificateEligibilitySource`: read-aggregation façade (loads facts).
// Part B — `CertificateEligibilityEngine`: pure, deterministic decision function
//          (`evaluateCertificateEligibility`) over those facts.
// Phase 7 — public verification + expiry:
//   • `VerifyCertificatePublicService`: privacy-safe, projection-only public lookup.
//   • `CertificateExpiryService`: org-scoped VALID → EXPIRED projection sweep
//     (never mutates `Certificate.status`).
//   • `public-rate-limiter`: in-memory throttle seam for the public endpoint.
// Phase 8C — `CertificateExportDownloadService`: authorizes + streams a READY export
//   artifact through the server (read-only; never exposes the storage key / fileUrl).
// Phase 10 — portal read models (READ-ONLY): `CertificateAdminReadService` (org-scoped
//   list/detail + server-side allowedActions) and `CertificateStudentReadService`
//   (own-scope, redacted DTOs). Guardian access is DEFERRED (denied by default).
// Still absent: ministry export — a later phase.
// =============================================================================

export * from "./certificate-eligibility-source.service";
export * from "./certificate-eligibility.engine";
export * from "./certificate-public-verification.service";
export * from "./certificate-expiry.service";
export * from "./public-rate-limiter";
export * from "./certificate-export-download.service";
export * from "./certificate-admin-read.service";
export * from "./certificate-student-read.service";
// Phase 12 — certificate request workflow read models (admin + student, read-only).
export * from "./certificate-request-read.service";
// Phase 13 — bulk operation preview (read-only input validation before execution).
export * from "./certificate-bulk-preview.service";
