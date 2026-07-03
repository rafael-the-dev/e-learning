// =============================================================================
// ATTENDANCE ENGINE — PHASE 2 (enrollmentId backfill) TYPES
//
// Behaviour-neutral. These types describe the resolution of a legacy
// AttendanceRecord.enrollmentId (nullable in Phase 1) to the Enrollment it
// belongs to, so the column can later be promoted to NOT NULL (Phase 2b) and
// the per-enrolment summary engine (Phase 4) can rely on it.
//
// Nothing here writes StudentSubjectProgress.attendancePercentage, activates
// INCOMPLETE, or changes attendance calculation. See docs/attendance-engine.md.
// =============================================================================

/** Enrolment statuses that are NEVER a valid backfill target. */
export const BACKFILL_EXCLUDED_ENROLLMENT_STATUSES = ["CANCELLED"] as const;

export type BackfillResolutionOutcome = "resolved" | "ambiguous" | "unresolved";

/** The session context that anchors a record to a course/class/level. */
export interface BackfillSessionContext {
  courseId: string;
  classGroupId: string;
  /** AttendanceSession.courseLevelId — non-null in the live schema, but modelled
   *  as nullable so the resolver degrades safely on malformed legacy rows. */
  courseLevelId: string | null;
}

/** A candidate enrolment for a given student (already org-scoped + non-cancelled). */
export interface BackfillEnrollmentCandidate {
  id: string;
  courseId: string;
  classGroupId: string | null;
  currentLevelId: string | null;
  initialLevelId: string | null;
  status: string;
}

/** The deterministic outcome of resolving one record. */
export interface BackfillResolution {
  outcome: BackfillResolutionOutcome;
  /** Set only when outcome === "resolved". */
  enrollmentId?: string;
  /** Which priority rule matched (1 = classGroup, 2 = currentLevel, 3 = initialLevel). */
  tier?: 1 | 2 | 3;
  /** The competing enrolment ids when outcome === "ambiguous". */
  candidateIds?: string[];
  /** Human-readable explanation (PT-PT), surfaced to operators. */
  reason: string;
}

/** A sample row for operator inspection before enforcing NOT NULL. */
export interface BackfillSampleRow {
  recordId: string;
  studentId: string;
  attendanceSessionId: string;
  courseId: string;
  classGroupId: string;
  courseLevelId: string | null;
  reason: string;
  candidateIds?: string[];
}

/**
 * The Step 3 data-quality report. Read-only; produced before an operator
 * enforces NOT NULL. `resolvableRecords + ambiguousRecords + unresolvedRecords`
 * always equals `nullableEnrollmentRecords`.
 */
export interface AttendanceEnrollmentBackfillReport {
  organizationId: string;
  totalAttendanceRecords: number;
  /** Records that already carry a non-null enrollmentId (never touched). */
  filledEnrollmentRecords: number;
  /** Records needing backfill (enrollmentId IS NULL). */
  nullableEnrollmentRecords: number;
  /** Of the nullable records, how many resolve to exactly one enrolment. */
  resolvableRecords: number;
  /** Multiple candidate enrolments — skipped, never guessed. */
  ambiguousRecords: number;
  /** No candidate enrolment — skipped. */
  unresolvedRecords: number;
  sampleAmbiguousRows: BackfillSampleRow[];
  sampleUnresolvedRows: BackfillSampleRow[];
}

/**
 * The result of an actual (or dry) backfill run. Extends the report with the
 * run-only counters. In dryRun mode `updatedRecords` is always 0.
 */
export interface BackfillRunResult extends AttendanceEnrollmentBackfillReport {
  dryRun: boolean;
  /** How many nullable records were scanned. */
  scannedRecords: number;
  /** How many rows were actually promoted (0 in dryRun; ≤ resolvableRecords). */
  updatedRecords: number;
}

export interface BackfillScanOptions {
  /** Rows fetched (and, when applying, updated) per batch. Default 500. */
  batchSize?: number;
  /** Max sample rows kept per bucket (ambiguous/unresolved). Default 20. */
  sampleSize?: number;
  /** When true, guarded-update resolved rows; when false, report only. */
  apply?: boolean;
}
