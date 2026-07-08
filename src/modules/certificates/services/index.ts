// =============================================================================
// CERTIFICATE ENGINE — SERVICES (Phase 3)
// -----------------------------------------------------------------------------
// Part A — `CertificateEligibilitySource`: read-aggregation façade (loads facts).
// Part B — `CertificateEligibilityEngine`: pure, deterministic decision function
//          (`evaluateCertificateEligibility`) over those facts.
// Still absent: commands, lifecycle, generation, issue/revoke — later phases.
// =============================================================================

export * from "./certificate-eligibility-source.service";
export * from "./certificate-eligibility.engine";
