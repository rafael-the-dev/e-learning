// =============================================================================
// CERTIFICATE ENGINE — SERVICES (Phase 3A)
// -----------------------------------------------------------------------------
// Phase 3A ships ONLY the eligibility read-aggregation façade
// (`CertificateEligibilitySource`). No eligibility engine, no commands, no
// lifecycle — those arrive in later phases.
// =============================================================================

export * from "./certificate-eligibility-source.service";
