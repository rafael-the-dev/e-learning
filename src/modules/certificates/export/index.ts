// =============================================================================
// CERTIFICATE ENGINE — EXPORT ADAPTERS (Phase 8)
// -----------------------------------------------------------------------------
// The two swappable adapters the Export Engine composes: the PDF renderer (bytes
// only, no business rule, no repository) and the artifact storage (persists bytes,
// hashes them, returns a URL). Both sit OUTSIDE `services/` on purpose — the
// service-layer architecture guards forbid storage/PDF dependencies in a service,
// and these are infrastructure adapters, not domain services. The command depends
// on the interfaces in `../types/export`, so either can be replaced wholesale.
// =============================================================================

export * from "./certificate-pdf-renderer";
export * from "./certificate-export-storage";
