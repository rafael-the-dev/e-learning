// =============================================================================
// ACADEMIC TRANSCRIPT ENGINE — REPOSITORY BARREL (Phase 2)
//
// The ONLY Prisma layer for the Transcript Engine. Every export is org-scoped
// and free of business logic (no issue/supersede/revoke orchestration, no
// snapshot building, no checksum, no events, no audit, no academic
// calculations). The snapshot repository is append-only at this surface
// (create + read; no update/delete). Source repository is read-only.
// =============================================================================

export * from "./academic-transcript.repository";
export * from "./academic-transcript-version.repository";
export * from "./academic-transcript-snapshot.repository";
export * from "./academic-transcript-event.repository";
export * from "./academic-transcript-export.repository";
export * from "./academic-transcript-request.repository";
export * from "./academic-transcript-source.repository";
