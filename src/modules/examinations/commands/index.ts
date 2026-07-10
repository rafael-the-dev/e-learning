// =============================================================================
// EXAMINATION ENGINE — COMMANDS (v1.0: Phases 4–11B + 13)
// -----------------------------------------------------------------------------
// All command surfaces: scheduling (period/session/room/invigilator), candidate
// registration + status, attendance, result entry, review/approval, publication +
// retraction, appeals + revisions, Grade/Progression integration + reconciliation,
// exam→grade-component binding, and the bulk runners. Every command follows the
// BaseCommand pattern (validate → authorize → execute in ONE db.$transaction) and
// writes ExamEvent + audit inside the tx. No routes/UI and no domain-event bus /
// Outbox (Phase 12 / Phase 14 — deferred beyond v1.0).
// =============================================================================

export * from "./scheduling-shared";
export * from "./exam-period.commands";
export * from "./exam-room.commands";
export * from "./exam-session.commands";
export * from "./assign-exam-invigilator.command";
// Phase 5 — candidate registration (register / override / withdraw / disqualify).
export * from "./registration-shared";
export * from "./candidate-registration.commands";
export * from "./candidate-status.commands";
// Phase 6 — exam attendance (mark / correct / bulk mark). SEPARATE from class
// attendance: records only; no results / grades / pass-fail / candidate mutation.
export * from "./attendance.commands";
// Phase 7 — exam result entry (create / update-draft / submit + bulk). Records
// official exam facts up to DRAFT/SUBMITTED ONLY: no final grade / pass-fail /
// progression / transcript / certificate / review / approval / publication / appeal.
export * from "./result-entry-shared";
export * from "./result-entry.commands";
// Phase 8 — exam result review / approval (review / approve / return-for-correction
// + bulk review / approve). Advances SUBMITTED → REVIEWED → APPROVED under a strict
// marker ≠ reviewer ≠ approver control; no publication / grade / progression /
// transcript / certificate / appeal / revision.
export * from "./result-review-shared";
export * from "./result-review.commands";
// Phase 9 — exam result publication (publish / retract). Session-level visibility
// boundary: APPROVED → PUBLISHED results + session COMPLETED→RESULTS_RECORDED→PUBLISHED
// + ExamPublication in one tx; retraction is a pre-integration escape hatch. No grade
// / progression / transcript / certificate / appeal / revision.
export * from "./publication-shared";
export * from "./publication.commands";
// Phase 10 — appeals & result revisions (create / review / approve / reject /
// withdraw). Post-publication recourse via append-only ExamResultRevision (single
// CURRENT); the official result is ExamResult + currentRevision. No grade /
// progression / transcript / certificate / (re)publication; revision creation is
// INTERNAL to approve.
export * from "./appeals-shared";
export * from "./appeals.commands";
// Phase 11 — Grade / Progression integration (integrate / reconcile / session batch).
// Anti-corruption boundary: pushes an official PUBLISHED result into the Grade &
// Progression engines via INJECTED PORTS (Examination never writes their tables);
// idempotency / staleness via the append-only ExamEvent metadata ledger. No Transcript
// / Certificate write, no final-grade / pass-fail logic, no domain-event bus.
export * from "./integration-shared";
export * from "./integration.commands";
// Phase 11B — canonical exam→grade-component binding (ADR-014). Bind / archive the
// explicit mapping an ExamSession's results integrate into (one active per session,
// compatibility-validated, no heuristic, blocked once the session's results were
// consumed). Records an event-only transition; NEVER writes a grade itself.
export * from "./binding.commands";
