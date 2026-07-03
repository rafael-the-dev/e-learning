import { getDb } from "@/server/db";
import type { PrismaClientOrTx } from "@/server/db";
import { resolveEnrollmentForRecord } from "@/modules/attendance/services/attendance-enrollment-backfill.resolver";
import {
  countAttendanceRecords,
  countRecordsNeedingBackfill,
  countRecordsWithEnrollment,
  findCandidateEnrollmentsByStudents,
  findNullEnrollmentRecordsBatch,
  updateRecordEnrollmentIdIfNull,
} from "@/modules/attendance/repositories/attendance-enrollment-backfill.repository";
import type {
  AttendanceEnrollmentBackfillReport,
  BackfillRunResult,
  BackfillSampleRow,
  BackfillScanOptions,
} from "@/modules/attendance/types/backfill";

// =============================================================================
// ATTENDANCE ENGINE — PHASE 2 BACKFILL SCAN + REPORT (single implementation)
//
// `scanAttendanceEnrollmentBackfill` is the one place that walks every nullable
// AttendanceRecord, resolves it with the pure resolver, and (optionally) applies
// the guarded update. Both the read-only report (Step 3) and the mutating
// command (Step 2) delegate here so their counts can never diverge.
//
// Behaviour-neutral: it only ever fills AttendanceRecord.enrollmentId. It does
// NOT write StudentSubjectProgress.attendancePercentage, touch summaries, or
// activate INCOMPLETE.
// =============================================================================

const DEFAULT_BATCH_SIZE = 500;
const DEFAULT_SAMPLE_SIZE = 20;

/**
 * Walk all nullable-enrollment records for one organization and resolve each.
 * When `apply` is true, resolved rows are promoted via a guarded update.
 *
 * Idempotent + safe to re-run: the guarded update only writes rows that are
 * still NULL, and the id-cursor advances past ambiguous/unresolved rows so the
 * loop always terminates.
 */
export async function scanAttendanceEnrollmentBackfill(
  organizationId: string,
  options: BackfillScanOptions = {},
  client?: PrismaClientOrTx
): Promise<BackfillRunResult> {
  const db = client ?? (await getDb());
  const batchSize = Math.max(1, options.batchSize ?? DEFAULT_BATCH_SIZE);
  const sampleSize = Math.max(0, options.sampleSize ?? DEFAULT_SAMPLE_SIZE);
  const apply = options.apply ?? false;

  const [totalAttendanceRecords, filledEnrollmentRecords, nullableEnrollmentRecords] =
    await Promise.all([
      countAttendanceRecords(organizationId, db),
      countRecordsWithEnrollment(organizationId, db),
      countRecordsNeedingBackfill(organizationId, db),
    ]);

  let scannedRecords = 0;
  let resolvableRecords = 0;
  let updatedRecords = 0;
  let ambiguousRecords = 0;
  let unresolvedRecords = 0;
  const sampleAmbiguousRows: BackfillSampleRow[] = [];
  const sampleUnresolvedRows: BackfillSampleRow[] = [];

  let afterId: string | null = null;
  // Hard stop: never loop more times than there are records to page through.
  for (;;) {
    const batch = await findNullEnrollmentRecordsBatch(organizationId, afterId, batchSize, db);
    if (batch.length === 0) break;
    afterId = batch[batch.length - 1].id;

    // One query per batch loads every candidate enrolment for the batch's students.
    const studentIds = [...new Set(batch.map((r) => r.studentId))];
    const candidatesByStudent = await findCandidateEnrollmentsByStudents(
      organizationId,
      studentIds,
      db
    );

    for (const row of batch) {
      scannedRecords++;
      const candidates = candidatesByStudent.get(row.studentId) ?? [];
      const resolution = resolveEnrollmentForRecord(
        { courseId: row.courseId, classGroupId: row.classGroupId, courseLevelId: row.courseLevelId },
        candidates
      );

      if (resolution.outcome === "resolved") {
        resolvableRecords++;
        if (apply) {
          updatedRecords += await updateRecordEnrollmentIdIfNull(
            row.id,
            organizationId,
            resolution.enrollmentId!,
            db
          );
        }
      } else if (resolution.outcome === "ambiguous") {
        ambiguousRecords++;
        if (sampleAmbiguousRows.length < sampleSize) {
          sampleAmbiguousRows.push(toSampleRow(row, resolution.reason, resolution.candidateIds));
        }
      } else {
        unresolvedRecords++;
        if (sampleUnresolvedRows.length < sampleSize) {
          sampleUnresolvedRows.push(toSampleRow(row, resolution.reason));
        }
      }
    }

    if (batch.length < batchSize) break;
  }

  return {
    organizationId,
    totalAttendanceRecords,
    filledEnrollmentRecords,
    nullableEnrollmentRecords,
    resolvableRecords,
    ambiguousRecords,
    unresolvedRecords,
    sampleAmbiguousRows,
    sampleUnresolvedRows,
    dryRun: !apply,
    scannedRecords,
    updatedRecords,
  };
}

/**
 * Step 3 — read-only data-quality report. Operators run this BEFORE enforcing
 * NOT NULL: the constraint migration is only safe once
 * `nullableEnrollmentRecords === 0` (equivalently ambiguous + unresolved === 0
 * after a successful apply).
 */
export async function getAttendanceEnrollmentBackfillReport(
  organizationId: string,
  options: Pick<BackfillScanOptions, "batchSize" | "sampleSize"> = {},
  client?: PrismaClientOrTx
): Promise<AttendanceEnrollmentBackfillReport> {
  const result = await scanAttendanceEnrollmentBackfill(
    organizationId,
    { ...options, apply: false },
    client
  );
  const {
    // strip the run-only fields for a clean report shape
    dryRun: _dryRun,
    scannedRecords: _scanned,
    updatedRecords: _updated,
    ...report
  } = result;
  void _dryRun;
  void _scanned;
  void _updated;
  return report;
}

function toSampleRow(
  row: { id: string; studentId: string; attendanceSessionId: string; courseId: string; classGroupId: string; courseLevelId: string | null },
  reason: string,
  candidateIds?: string[]
): BackfillSampleRow {
  return {
    recordId: row.id,
    studentId: row.studentId,
    attendanceSessionId: row.attendanceSessionId,
    courseId: row.courseId,
    classGroupId: row.classGroupId,
    courseLevelId: row.courseLevelId,
    reason,
    ...(candidateIds ? { candidateIds } : {}),
  };
}
