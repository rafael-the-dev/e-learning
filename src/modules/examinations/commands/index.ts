// =============================================================================
// EXAMINATION ENGINE — COMMANDS (Phase 4: Scheduling)
// -----------------------------------------------------------------------------
// Scheduling commands only: ExamPeriod + ExamSession lifecycle, ExamRoom
// create/update/archive, and invigilator assignment. Every command follows the
// BaseCommand pattern (validate → authorize(`exams.schedule`) → execute in ONE
// db.$transaction), decides conflicts/capacity at command time via conditional
// writes + reads (E-3a), and writes ExamEvent + audit inside the tx. No candidate
// registration, eligibility execution, attendance, results, publication, appeals,
// bulk, routes/UI, or domain-event bus — those are later phases.
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
