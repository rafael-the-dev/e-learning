import { getDb } from "@/server/db";
import type { PrismaClientOrTx } from "@/server/db";
import type { StudentPeriodAttendanceSummary } from "@/modules/attendance/types";

// =============================================================================
// STUDENT PERIOD ATTENDANCE SUMMARY REPOSITORY — Attendance Engine Phase 4
//
// The only Prisma layer for the period reporting read-model. Every query is
// org-scoped. Because uniqueness of (enrollmentId, academicYearId,
// academicTermId) is enforced by TWO filtered indexes (nullable term — SQL
// Server), there is NO Prisma compound @@unique, so the write path is a manual
// findFirst → update/create (NOT db.upsert). `upsertPeriodSummary` is the single
// write path (service-only).
// =============================================================================

interface PeriodRow {
  id: string;
  organizationId: string;
  academicYearId: string;
  academicTermId: string | null;
  enrollmentId: string;
  studentId: string;
  courseId: string;
  courseLevelId: string | null;
  classGroupId: string | null;
  totalSessions: number;
  presentCount: number;
  absentCount: number;
  lateCount: number;
  excusedCount: number;
  remoteCount: number;
  totalScheduledMinutes: number;
  totalPresentMinutes: number;
  attendancePercentage: unknown; // Prisma Decimal | null
  status: string;
  calculatedAt: Date | null;
}

const periodSelect = {
  id: true,
  organizationId: true,
  academicYearId: true,
  academicTermId: true,
  enrollmentId: true,
  studentId: true,
  courseId: true,
  courseLevelId: true,
  classGroupId: true,
  totalSessions: true,
  presentCount: true,
  absentCount: true,
  lateCount: true,
  excusedCount: true,
  remoteCount: true,
  totalScheduledMinutes: true,
  totalPresentMinutes: true,
  attendancePercentage: true,
  status: true,
  calculatedAt: true,
} as const;

function toPeriod(row: PeriodRow): StudentPeriodAttendanceSummary {
  return {
    id: row.id,
    organizationId: row.organizationId,
    academicYearId: row.academicYearId,
    academicTermId: row.academicTermId ?? null,
    enrollmentId: row.enrollmentId,
    studentId: row.studentId,
    courseId: row.courseId,
    courseLevelId: row.courseLevelId ?? null,
    classGroupId: row.classGroupId ?? null,
    totalSessions: row.totalSessions,
    presentCount: row.presentCount,
    absentCount: row.absentCount,
    lateCount: row.lateCount,
    excusedCount: row.excusedCount,
    remoteCount: row.remoteCount,
    totalScheduledMinutes: row.totalScheduledMinutes,
    totalPresentMinutes: row.totalPresentMinutes,
    attendancePercentage: row.attendancePercentage != null ? Number(row.attendancePercentage) : null,
    status: row.status,
    calculatedAt: row.calculatedAt ?? null,
  };
}

// ─── Calculation inputs ───────────────────────────────────────────────────────

export async function findEnrollmentContextForPeriod(
  enrollmentId: string,
  organizationId: string,
  client?: PrismaClientOrTx
): Promise<
  | {
      id: string;
      studentId: string;
      courseId: string;
      courseLevelId: string | null;
      classGroupId: string | null;
    }
  | null
> {
  const db = client ?? (await getDb());
  const row = await db.enrollment.findFirst({
    where: { id: enrollmentId, organizationId, deletedAt: null },
    select: { id: true, studentId: true, courseId: true, courseLevelId: true, classGroupId: true },
  });
  return row ?? null;
}

/** A record's raw calc data, joined to its session's levelSubject + duration.
 *  Policy/threshold are resolved by the service (per levelSubject). */
export interface PeriodCalcRecordRaw {
  levelSubjectId: string;
  durationMinutes: number;
  status: string;
  minutesAttended: number;
  lateMinutes: number | null;
  hasApprovedJustification: boolean;
}

/**
 * Load the enrolment's records for COMPLETED sessions in a period. When
 * `academicTermId` is provided → only that term's sessions; when null → the whole
 * academic year (all terms). Attributed by enrollmentId (NULL-enrollment records
 * are excluded, safe per Phase 2).
 */
export async function findPeriodCalcRecords(
  enrollmentId: string,
  academicYearId: string,
  academicTermId: string | null,
  organizationId: string,
  client?: PrismaClientOrTx
): Promise<PeriodCalcRecordRaw[]> {
  const db = client ?? (await getDb());
  const rows = await db.attendanceRecord.findMany({
    where: {
      enrollmentId,
      organizationId,
      deletedAt: null,
      attendanceSession: {
        status: "COMPLETED",
        deletedAt: null,
        academicYearId,
        // term-scoped summary → match the term; year-scoped (null) → all terms
        ...(academicTermId ? { academicTermId } : {}),
      },
    },
    select: {
      status: true,
      minutesAttended: true,
      lateMinutes: true,
      attendanceSession: { select: { levelSubjectId: true, durationMinutes: true } },
      justifications: {
        where: { status: "APPROVED", deletedAt: null },
        select: { id: true },
        take: 1,
      },
    },
  });
  return rows.map((r) => ({
    levelSubjectId: r.attendanceSession.levelSubjectId,
    durationMinutes: r.attendanceSession.durationMinutes,
    status: r.status,
    minutesAttended: r.minutesAttended,
    lateMinutes: r.lateMinutes,
    hasApprovedJustification: r.justifications.length > 0,
  }));
}

/** LevelSubject policy + threshold for a set of subjects (org-scoped). */
export async function findLevelSubjectsForPeriod(
  levelSubjectIds: string[],
  organizationId: string,
  client?: PrismaClientOrTx
): Promise<Map<string, { attendancePolicyId: string | null; minimumAttendancePercentage: number | null }>> {
  const map = new Map<string, { attendancePolicyId: string | null; minimumAttendancePercentage: number | null }>();
  const unique = [...new Set(levelSubjectIds)];
  if (unique.length === 0) return map;
  const db = client ?? (await getDb());
  const rows = await db.levelSubject.findMany({
    where: { id: { in: unique }, organizationId },
    select: { id: true, attendancePolicyId: true, minimumAttendancePercentage: true },
  });
  for (const r of rows) {
    map.set(r.id, {
      attendancePolicyId: r.attendancePolicyId ?? null,
      minimumAttendancePercentage:
        r.minimumAttendancePercentage != null ? Number(r.minimumAttendancePercentage) : null,
    });
  }
  return map;
}

/** Distinct enrolments with attendance records in a period scope — the batch
 *  recompute set. */
export async function findDistinctPeriodEnrollments(
  organizationId: string,
  filters: { academicYearId: string; academicTermId?: string; classGroupId?: string; courseId?: string },
  client?: PrismaClientOrTx
): Promise<string[]> {
  const db = client ?? (await getDb());
  const rows = await db.attendanceRecord.findMany({
    where: {
      organizationId,
      deletedAt: null,
      enrollmentId: { not: null },
      attendanceSession: {
        deletedAt: null,
        academicYearId: filters.academicYearId,
        ...(filters.academicTermId ? { academicTermId: filters.academicTermId } : {}),
        ...(filters.classGroupId ? { classGroupId: filters.classGroupId } : {}),
        ...(filters.courseId ? { courseId: filters.courseId } : {}),
      },
    },
    select: { enrollmentId: true },
    distinct: ["enrollmentId"],
  });
  return rows.map((r) => r.enrollmentId).filter((id): id is string => id != null);
}

// ─── Single write path (manual upsert for the nullable-term filtered indexes) ──

export interface UpsertPeriodSummaryData {
  organizationId: string;
  academicYearId: string;
  academicTermId: string | null;
  enrollmentId: string;
  studentId: string;
  courseId: string;
  courseLevelId: string | null;
  classGroupId: string | null;
  totalSessions: number;
  presentCount: number;
  absentCount: number;
  lateCount: number;
  excusedCount: number;
  remoteCount: number;
  totalScheduledMinutes: number;
  totalPresentMinutes: number;
  attendancePercentage: number | null;
  status: string;
  calculatedAt: Date;
}

export async function findPeriodSummary(
  enrollmentId: string,
  academicYearId: string,
  academicTermId: string | null,
  organizationId: string,
  client?: PrismaClientOrTx
): Promise<StudentPeriodAttendanceSummary | null> {
  const db = client ?? (await getDb());
  const row = await db.studentPeriodAttendanceSummary.findFirst({
    // academicTermId: null → Prisma emits IS NULL, matching the year-level row.
    where: { enrollmentId, academicYearId, academicTermId, organizationId },
    select: periodSelect,
  });
  return row ? toPeriod(row) : null;
}

/**
 * Manual upsert keyed by (enrollmentId, academicYearId, academicTermId). There is
 * no Prisma compound unique (nullable term → filtered indexes), so we findFirst
 * then update/create. The filtered unique indexes still guard against races at
 * the DB level.
 */
export async function upsertPeriodSummary(
  data: UpsertPeriodSummaryData,
  client?: PrismaClientOrTx
): Promise<StudentPeriodAttendanceSummary> {
  const db = client ?? (await getDb());
  const writable = {
    studentId: data.studentId,
    courseId: data.courseId,
    courseLevelId: data.courseLevelId,
    classGroupId: data.classGroupId,
    totalSessions: data.totalSessions,
    presentCount: data.presentCount,
    absentCount: data.absentCount,
    lateCount: data.lateCount,
    excusedCount: data.excusedCount,
    remoteCount: data.remoteCount,
    totalScheduledMinutes: data.totalScheduledMinutes,
    totalPresentMinutes: data.totalPresentMinutes,
    attendancePercentage: data.attendancePercentage,
    status: data.status,
    calculatedAt: data.calculatedAt,
  };

  const existing = await db.studentPeriodAttendanceSummary.findFirst({
    where: {
      enrollmentId: data.enrollmentId,
      academicYearId: data.academicYearId,
      academicTermId: data.academicTermId,
      organizationId: data.organizationId,
    },
    select: { id: true },
  });

  const row = existing
    ? await db.studentPeriodAttendanceSummary.update({
        where: { id: existing.id },
        data: writable,
        select: periodSelect,
      })
    : await db.studentPeriodAttendanceSummary.create({
        data: {
          organizationId: data.organizationId,
          academicYearId: data.academicYearId,
          academicTermId: data.academicTermId,
          enrollmentId: data.enrollmentId,
          ...writable,
        },
        select: periodSelect,
      });
  return toPeriod(row);
}

// ─── Read-only reporting queries (Phase 4 §10) ────────────────────────────────

export async function findPeriodAttendanceSummaryByEnrollment(
  enrollmentId: string,
  organizationId: string,
  client?: PrismaClientOrTx
): Promise<StudentPeriodAttendanceSummary[]> {
  const db = client ?? (await getDb());
  const rows = await db.studentPeriodAttendanceSummary.findMany({
    where: { enrollmentId, organizationId },
    select: periodSelect,
    orderBy: [{ academicYearId: "asc" }, { academicTermId: "asc" }],
  });
  return rows.map(toPeriod);
}

export async function findPeriodAttendanceSummariesByStudent(
  studentId: string,
  organizationId: string,
  client?: PrismaClientOrTx
): Promise<StudentPeriodAttendanceSummary[]> {
  const db = client ?? (await getDb());
  const rows = await db.studentPeriodAttendanceSummary.findMany({
    where: { studentId, organizationId },
    select: periodSelect,
    orderBy: [{ academicYearId: "asc" }, { academicTermId: "asc" }],
  });
  return rows.map(toPeriod);
}

export async function findPeriodAttendanceSummariesByClassGroup(
  classGroupId: string,
  organizationId: string,
  filters: { academicYearId?: string; academicTermId?: string | null } = {},
  client?: PrismaClientOrTx
): Promise<StudentPeriodAttendanceSummary[]> {
  const db = client ?? (await getDb());
  const rows = await db.studentPeriodAttendanceSummary.findMany({
    where: {
      classGroupId,
      organizationId,
      ...(filters.academicYearId ? { academicYearId: filters.academicYearId } : {}),
      ...(filters.academicTermId !== undefined ? { academicTermId: filters.academicTermId } : {}),
    },
    select: periodSelect,
    orderBy: [{ studentId: "asc" }],
  });
  return rows.map(toPeriod);
}

export async function findPeriodAttendanceSummariesByCourse(
  courseId: string,
  organizationId: string,
  filters: { academicYearId?: string; academicTermId?: string | null } = {},
  client?: PrismaClientOrTx
): Promise<StudentPeriodAttendanceSummary[]> {
  const db = client ?? (await getDb());
  const rows = await db.studentPeriodAttendanceSummary.findMany({
    where: {
      courseId,
      organizationId,
      ...(filters.academicYearId ? { academicYearId: filters.academicYearId } : {}),
      ...(filters.academicTermId !== undefined ? { academicTermId: filters.academicTermId } : {}),
    },
    select: periodSelect,
    orderBy: [{ studentId: "asc" }],
  });
  return rows.map(toPeriod);
}

export async function findStudentsBelowRequiredPeriodAttendance(
  organizationId: string,
  filters: { academicYearId?: string; academicTermId?: string | null; classGroupId?: string; courseId?: string } = {},
  client?: PrismaClientOrTx
): Promise<StudentPeriodAttendanceSummary[]> {
  const db = client ?? (await getDb());
  const rows = await db.studentPeriodAttendanceSummary.findMany({
    where: {
      organizationId,
      status: "BELOW_REQUIRED",
      ...(filters.academicYearId ? { academicYearId: filters.academicYearId } : {}),
      ...(filters.academicTermId !== undefined ? { academicTermId: filters.academicTermId } : {}),
      ...(filters.classGroupId ? { classGroupId: filters.classGroupId } : {}),
      ...(filters.courseId ? { courseId: filters.courseId } : {}),
    },
    select: periodSelect,
    orderBy: [{ attendancePercentage: "asc" }],
  });
  return rows.map(toPeriod);
}

/** All period rows for an academic year (optionally a term) — the raw input the
 *  overview DTO aggregates. Pass `academicTermId: null` for the year rollup rows,
 *  a term id for that term, or omit to get every row in the year. */
export async function findPeriodSummariesForOverview(
  organizationId: string,
  academicYearId: string,
  academicTermId: string | null | undefined,
  client?: PrismaClientOrTx
): Promise<StudentPeriodAttendanceSummary[]> {
  const db = client ?? (await getDb());
  const rows = await db.studentPeriodAttendanceSummary.findMany({
    where: {
      organizationId,
      academicYearId,
      ...(academicTermId !== undefined ? { academicTermId } : {}),
    },
    select: periodSelect,
  });
  return rows.map(toPeriod);
}
