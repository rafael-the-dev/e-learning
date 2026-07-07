// =============================================================================
// CERTIFICATE ENGINE — TRANSCRIPT SOURCE DTOs (Phase 2, Part A)
// -----------------------------------------------------------------------------
// The stable READ contract the Certificate Engine consumes in place of the
// Transcript Engine's persistence model (ADR-002). These DTOs are produced by
// `CertificateTranscriptSourceRepository` — the ONLY component allowed to touch
// transcript tables — and are the ONLY transcript-derived shapes the rest of the
// engine ever sees.
//
// They carry copied snapshot facts VERBATIM. No academic value is recalculated,
// derived, or reformatted; the repository only translates the transcript's
// internal storage layout into these fields. If the Transcript Engine's schema
// changes, only the repository that fills these DTOs changes — every consumer of
// this contract stays untouched (Anti-Corruption Layer).
// =============================================================================

/** One frozen level row copied from an issued transcript version. */
export interface TranscriptSourceLevelDto {
  /** Opaque join key = the transcript level row id; parents `subjects[]`. */
  transcriptLevelId: string;
  courseLevelId: string | null;
  levelName: string;
  levelCode: string | null;
  levelOrder: number;
  finalGrade: number | null;
  status: string;
  completedAt: Date | null;
  startedAt: Date | null;
  earnedCredits: number | null;
  workloadHours: number | null;
}

/** One frozen subject row copied from an issued transcript version. */
export interface TranscriptSourceSubjectDto {
  /** Opaque join key = the transcript subject row id; parents `assessments[]`. */
  transcriptSubjectId: string;
  /** Parent level join key (matches a `TranscriptSourceLevelDto.transcriptLevelId`). */
  transcriptLevelId: string;
  levelSubjectId: string | null;
  subjectId: string | null;
  subjectName: string;
  subjectCode: string | null;
  subjectOrder: number;
  finalGrade: number | null;
  status: string;
  minimumPassingGrade: number | null;
  attendancePercentage: number | null;
  minimumAttendancePercentage: number | null;
  completedAt: Date | null;
  credits: number | null;
  workloadHours: number | null;
  isRequired: boolean;
  recoveryStatus: string | null;
}

/** One frozen assessment row copied from an issued transcript version. */
export interface TranscriptSourceAssessmentDto {
  /** Parent subject join key (matches a `TranscriptSourceSubjectDto.transcriptSubjectId`). */
  transcriptSubjectId: string;
  studentAssessmentResultId: string | null;
  assessmentComponentId: string | null;
  assessmentEventId: string | null;
  title: string | null;
  componentName: string;
  componentType: string | null;
  sourceType: string;
  grade: number;
  maxGrade: number;
  normalizedGrade: number;
  status: string;
  gradedAt: Date | null;
  isRecovery: boolean;
  recoveryAttemptNumber: number | null;
}

/** One frozen attendance summary row copied from an issued transcript version.
 *  Subject-grain rows carry a `transcriptSubjectId`; version/period-grain rows
 *  have it `null`. */
export interface TranscriptSourceAttendanceDto {
  transcriptSubjectId: string | null;
  levelSubjectId: string | null;
  academicYearId: string | null;
  academicTermId: string | null;
  attendancePercentage: number | null;
  totalSessions: number;
  totalPresentMinutes: number;
  totalScheduledMinutes: number;
  status: string;
  policyId: string | null;
  policyName: string | null;
  minimumAttendancePercentage: number | null;
  calculatedAt: Date | null;
}

/** Complete, immutable read of an ISSUED transcript version, shaped for the
 *  Certificate Engine. All snapshot facts are copied verbatim from the transcript
 *  version; the engine reads only this DTO, never the transcript tables. */
export interface TranscriptCertificateSourceDto {
  /** The pinned transcript version id (the certificate stores this as a pointer). */
  transcriptVersionId: string;
  /** Copied from the parent transcript root (nullable at source until issue). */
  transcriptNumber: string | null;
  /** Copied version content checksum (staleness/tamper anchor; nullable at source). */
  transcriptChecksum: string | null;
  /** The version's own lifecycle status (always `ISSUED` for this read). */
  transcriptStatus: string;
  /** Copied from the parent transcript root. */
  transcriptType: string;
  /** The version's issue timestamp / actor. */
  issuedAt: Date | null;
  issuedBy: string | null;
  /** Frozen student identity, parsed verbatim from the version's stored JSON. */
  studentSnapshot: Record<string, unknown>;
  /** Frozen course identity, parsed verbatim; null when the version has no course. */
  courseSnapshot: Record<string, unknown> | null;
  /** Frozen course-progress outcome (status/finalGrade/completedAt), copied
   *  verbatim; null when the version has no course. Surfaced as a distinct field
   *  even though the transcript persists it nested under its course snapshot. */
  courseProgressSnapshot: Record<string, unknown> | null;
  /** Deterministically ordered flat child collections (see repository §11). */
  levels: TranscriptSourceLevelDto[];
  subjects: TranscriptSourceSubjectDto[];
  assessments: TranscriptSourceAssessmentDto[];
  attendance: TranscriptSourceAttendanceDto[];
}

/** Lightweight metadata about a transcript version — no snapshot children. Used
 *  by callers that only need to identify/route a version, not read its content. */
export interface TranscriptVersionSummaryDto {
  transcriptVersionId: string;
  transcriptNumber: string | null;
  checksum: string | null;
  status: string;
  issuedAt: Date | null;
  studentId: string;
  courseId: string | null;
}
