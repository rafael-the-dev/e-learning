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
// Still absent: portal UI, ministry export — later phases.
// =============================================================================

export * from "./certificate-eligibility-source.service";
export * from "./certificate-eligibility.engine";
export * from "./certificate-public-verification.service";
export * from "./certificate-expiry.service";
export * from "./public-rate-limiter";
export * from "./certificate-export-download.service";
