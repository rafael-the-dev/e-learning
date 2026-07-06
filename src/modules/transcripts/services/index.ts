// =============================================================================
// ACADEMIC TRANSCRIPT ENGINE — SERVICES BARREL (Phase 3)
//
// Pure, read-only, in-memory building blocks for the Snapshot Builder. No writes,
// no events, no audit, no number allocation, no status transitions. Consumed by
// the future GenerateTranscriptSnapshotCommand (Phase 4).
// =============================================================================

export * from "./transcript-snapshot-builder.service";
export * from "./transcript-canonical-payload.service";
