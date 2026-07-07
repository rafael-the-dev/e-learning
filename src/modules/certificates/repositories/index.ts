// =============================================================================
// CERTIFICATE ENGINE — REPOSITORIES (Phase 2)
// -----------------------------------------------------------------------------
// Part A — Transcript source adapter (Anti-Corruption Layer): the ONLY component
//          allowed to read Transcript tables.
// Part B — Certificate-model repositories: tenant-safe, persistence-only access
//          for the seven Certificate Engine models. No eligibility, commands,
//          services, lifecycle rules, events, audit, checksum, numbering, PDF,
//          public verification, or Transcript reads.
// =============================================================================

export * from "./certificate-transcript-source.repository";
export * from "./certificate-policy.repository";
export * from "./certificate-template.repository";
export * from "./certificate.repository";
export * from "./certificate-event.repository";
export * from "./certificate-export.repository";
export * from "./certificate-verification.repository";
export * from "./certificate-request.repository";
