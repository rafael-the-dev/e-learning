// =============================================================================
// ACADEMIC TRANSCRIPT ENGINE — CONSTANTS (const objects, no native enums)
// -----------------------------------------------------------------------------
// Domain vocabularies as `const` objects + derived string-literal types, per the
// project convention (SQL Server has no native enums). Values are the canonical
// domain strings that travel in payloads/DB columns and must never be translated.
// =============================================================================

/** Official transcript types (persisted snapshot versions). Mirrors the
 *  `transcriptType` discriminator documented on `AcademicTranscript`. */
export const TranscriptType = {
  COURSE_TRANSCRIPT: "COURSE_TRANSCRIPT",
  FULL_ACADEMIC_HISTORY: "FULL_ACADEMIC_HISTORY",
  LEVEL_TRANSCRIPT: "LEVEL_TRANSCRIPT",
  TERM_REPORT: "TERM_REPORT",
  SUBJECT_REPORT: "SUBJECT_REPORT",
  CERTIFICATE_SUPPORT: "CERTIFICATE_SUPPORT",
} as const;
export type TranscriptType = (typeof TranscriptType)[keyof typeof TranscriptType];

/** Snapshot detail level — controls whether component-level assessment rows are
 *  included. Not a separate model, just an input flag (§12 of the design). */
export const TranscriptDetailLevel = {
  SUMMARY: "SUMMARY",
  DETAILED: "DETAILED",
} as const;
export type TranscriptDetailLevel =
  (typeof TranscriptDetailLevel)[keyof typeof TranscriptDetailLevel];

/** The only `StudentAssessmentResult.status` value eligible for a snapshot.
 *  Filtering (not recalculating) by this is required for DETAILED transcripts. */
export const ASSESSMENT_RESULT_STATUS_GRADED = "GRADED";

/** `StudentAssessmentResult.sourceType` value that marks a recovery result. */
export const ASSESSMENT_SOURCE_TYPE_RECOVERY = "RECOVERY";

/** Bumped when the builder's payload SHAPE changes in a way that would alter
 *  the canonical content (and therefore the checksum) for identical source
 *  data. Kept OUT of the checksummed content (it lives in payload metadata). */
export const SNAPSHOT_BUILDER_VERSION = "1.0.0";
