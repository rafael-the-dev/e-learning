import { getDb } from "@/server/db";
import type { PrismaClientOrTx } from "@/server/db";
import { BACKFILL_EXCLUDED_ENROLLMENT_STATUSES } from "@/modules/attendance/types/backfill";
import type { BackfillEnrollmentCandidate } from "@/modules/attendance/types/backfill";

// =============================================================================
// ATTENDANCE ENGINE — PHASE 2 enrollmentId BACKFILL REPOSITORY
//
// The ONLY Prisma layer for the backfill. Every query is scoped by
// organizationId. Read-only except for `updateRecordEnrollmentIdIfNull`, which
// is a guarded (WHERE enrollmentId IS NULL) conditional update so the backfill
// is idempotent and NEVER overwrites an already-resolved enrolment.
// =============================================================================

/** A null-enrollment record with the session context needed to resolve it. */
export interface NullEnrollmentRecordRow {
  id: string;
  studentId: string;
  attendanceSessionId: string;
  courseId: string;
  classGroupId: string;
  courseLevelId: string | null;
}

export async function countAttendanceRecords(
  organizationId: string,
  client?: PrismaClientOrTx
): Promise<number> {
  const db = client ?? (await getDb());
  return db.attendanceRecord.count({ where: { organizationId, deletedAt: null } });
}

export async function countRecordsWithEnrollment(
  organizationId: string,
  client?: PrismaClientOrTx
): Promise<number> {
  const db = client ?? (await getDb());
  return db.attendanceRecord.count({
    where: { organizationId, deletedAt: null, enrollmentId: { not: null } },
  });
}

export async function countRecordsNeedingBackfill(
  organizationId: string,
  client?: PrismaClientOrTx
): Promise<number> {
  const db = client ?? (await getDb());
  return db.attendanceRecord.count({
    where: { organizationId, deletedAt: null, enrollmentId: null },
  });
}

/**
 * Fetch a batch of records that still need backfill, ordered by id so an
 * id-cursor can page past ambiguous/unresolved rows (which stay NULL and would
 * otherwise loop forever under a plain `enrollmentId IS NULL` fetch).
 *
 * @param afterId exclusive cursor — pass the last id of the previous batch.
 */
export async function findNullEnrollmentRecordsBatch(
  organizationId: string,
  afterId: string | null,
  take: number,
  client?: PrismaClientOrTx
): Promise<NullEnrollmentRecordRow[]> {
  const db = client ?? (await getDb());
  const rows = await db.attendanceRecord.findMany({
    where: {
      organizationId,
      deletedAt: null,
      enrollmentId: null,
      ...(afterId ? { id: { gt: afterId } } : {}),
    },
    orderBy: { id: "asc" },
    take,
    select: {
      id: true,
      studentId: true,
      attendanceSessionId: true,
      attendanceSession: {
        select: { courseId: true, classGroupId: true, courseLevelId: true },
      },
    },
  });

  return rows.map((r) => ({
    id: r.id,
    studentId: r.studentId,
    attendanceSessionId: r.attendanceSessionId,
    courseId: r.attendanceSession.courseId,
    classGroupId: r.attendanceSession.classGroupId,
    courseLevelId: r.attendanceSession.courseLevelId ?? null,
  }));
}

/**
 * Load the candidate enrolments for a set of students in one query, scoped to
 * the org and excluding cancelled / soft-deleted enrolments. Returned grouped
 * by studentId for O(1) lookup during resolution.
 */
export async function findCandidateEnrollmentsByStudents(
  organizationId: string,
  studentIds: string[],
  client?: PrismaClientOrTx
): Promise<Map<string, BackfillEnrollmentCandidate[]>> {
  const map = new Map<string, BackfillEnrollmentCandidate[]>();
  if (studentIds.length === 0) return map;

  const db = client ?? (await getDb());
  const rows = await db.enrollment.findMany({
    where: {
      organizationId,
      deletedAt: null,
      studentId: { in: studentIds },
      status: { notIn: [...BACKFILL_EXCLUDED_ENROLLMENT_STATUSES] },
    },
    select: {
      id: true,
      studentId: true,
      courseId: true,
      classGroupId: true,
      currentLevelId: true,
      initialLevelId: true,
      status: true,
    },
  });

  for (const r of rows) {
    const list = map.get(r.studentId) ?? [];
    list.push({
      id: r.id,
      courseId: r.courseId,
      classGroupId: r.classGroupId,
      currentLevelId: r.currentLevelId,
      initialLevelId: r.initialLevelId,
      status: r.status,
    });
    map.set(r.studentId, list);
  }
  return map;
}

/**
 * Guarded conditional update: set enrollmentId ONLY when it is still NULL.
 * Returns the number of rows actually changed (0 if another process already
 * filled it — the source of idempotency + no-overwrite guarantee).
 */
export async function updateRecordEnrollmentIdIfNull(
  recordId: string,
  organizationId: string,
  enrollmentId: string,
  client?: PrismaClientOrTx
): Promise<number> {
  const db = client ?? (await getDb());
  const result = await db.attendanceRecord.updateMany({
    where: { id: recordId, organizationId, enrollmentId: null, deletedAt: null },
    data: { enrollmentId },
  });
  return result.count;
}
