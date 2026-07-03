import { getDb } from "@/server/db";
import type { PrismaClientOrTx } from "@/server/db";
import type {
  AttendanceCalcRecordInput,
  StudentSubjectAttendanceSummary,
} from "@/modules/attendance/types";

// =============================================================================
// STUDENT SUBJECT ATTENDANCE SUMMARY REPOSITORY — Attendance Engine Phase 3
//
// The only Prisma layer for the persisted summary read-model. Every query is
// org-scoped. `upsertSummary` is the single write path (called ONLY by the
// summary service — the single-writer rule).
// =============================================================================

interface SummaryRow {
  id: string;
  organizationId: string;
  enrollmentId: string;
  studentId: string;
  levelSubjectId: string;
  attendancePolicyId: string | null;
  totalSessions: number;
  totalScheduledMinutes: number;
  totalPresentMinutes: number;
  totalAbsentMinutes: number;
  totalLateMinutes: number;
  totalExcusedMinutes: number;
  attendancePercentage: unknown; // Prisma Decimal | null
  status: string;
  calculatedAt: Date | null;
}

function toSummary(row: SummaryRow): StudentSubjectAttendanceSummary {
  return {
    id: row.id,
    organizationId: row.organizationId,
    enrollmentId: row.enrollmentId,
    studentId: row.studentId,
    levelSubjectId: row.levelSubjectId,
    attendancePolicyId: row.attendancePolicyId ?? null,
    totalSessions: row.totalSessions,
    totalScheduledMinutes: row.totalScheduledMinutes,
    totalPresentMinutes: row.totalPresentMinutes,
    totalAbsentMinutes: row.totalAbsentMinutes,
    totalLateMinutes: row.totalLateMinutes,
    totalExcusedMinutes: row.totalExcusedMinutes,
    attendancePercentage:
      row.attendancePercentage != null ? Number(row.attendancePercentage) : null,
    status: row.status,
    calculatedAt: row.calculatedAt ?? null,
  };
}

const summarySelect = {
  id: true,
  organizationId: true,
  enrollmentId: true,
  studentId: true,
  levelSubjectId: true,
  attendancePolicyId: true,
  totalSessions: true,
  totalScheduledMinutes: true,
  totalPresentMinutes: true,
  totalAbsentMinutes: true,
  totalLateMinutes: true,
  totalExcusedMinutes: true,
  attendancePercentage: true,
  status: true,
  calculatedAt: true,
} as const;

// ─── Inputs for the calculation ───────────────────────────────────────────────

/** Enrolment context needed to scope the summary + find its sessions. */
export async function findEnrollmentContext(
  enrollmentId: string,
  organizationId: string,
  client?: PrismaClientOrTx
): Promise<{ id: string; studentId: string; classGroupId: string | null } | null> {
  const db = client ?? (await getDb());
  const row = await db.enrollment.findFirst({
    where: { id: enrollmentId, organizationId, deletedAt: null },
    select: { id: true, studentId: true, classGroupId: true },
  });
  return row ?? null;
}

/** The student's marks for the given (COMPLETED) sessions, joined to whether each
 *  carries an approved justification. Attributed by enrollmentId — records with a
 *  NULL enrollmentId are naturally excluded (safe per Phase 2). */
export async function findCalcRecordsForEnrollment(
  enrollmentId: string,
  sessionIds: string[],
  organizationId: string,
  client?: PrismaClientOrTx
): Promise<AttendanceCalcRecordInput[]> {
  if (sessionIds.length === 0) return [];
  const db = client ?? (await getDb());
  const rows = await db.attendanceRecord.findMany({
    where: {
      enrollmentId,
      attendanceSessionId: { in: sessionIds },
      organizationId,
      deletedAt: null,
    },
    select: {
      status: true,
      minutesAttended: true,
      lateMinutes: true,
      attendanceSessionId: true,
      justifications: {
        where: { status: "APPROVED", deletedAt: null },
        select: { id: true },
        take: 1,
      },
    },
  });
  return rows.map((r) => ({
    attendanceSessionId: r.attendanceSessionId,
    status: r.status,
    minutesAttended: r.minutesAttended,
    lateMinutes: r.lateMinutes,
    hasApprovedJustification: r.justifications.length > 0,
  }));
}

/** Distinct (enrollmentId, studentId) pairs marked in a session — the fan-out set
 *  for a session-level recalculation. NULL-enrollment records are excluded. */
export async function findEnrollmentsMarkedInSession(
  attendanceSessionId: string,
  organizationId: string,
  client?: PrismaClientOrTx
): Promise<{ enrollmentId: string; studentId: string }[]> {
  const db = client ?? (await getDb());
  const rows = await db.attendanceRecord.findMany({
    where: { attendanceSessionId, organizationId, deletedAt: null, enrollmentId: { not: null } },
    select: { enrollmentId: true, studentId: true },
    distinct: ["enrollmentId"],
  });
  return rows
    .filter((r): r is { enrollmentId: string; studentId: string } => r.enrollmentId != null)
    .map((r) => ({ enrollmentId: r.enrollmentId, studentId: r.studentId }));
}

/**
 * Distinct (enrollmentId, levelSubjectId) pairs that have at least one attendance
 * record — the recompute set for a batch recalculation. Scoped by org and the
 * optional class-group / level-subject / enrollment filters. NULL-enrollment
 * records are excluded (safe per Phase 2).
 */
export async function findDistinctSummaryTargets(
  organizationId: string,
  filters: { classGroupId?: string; levelSubjectId?: string; enrollmentId?: string; academicYearId?: string } = {},
  client?: PrismaClientOrTx
): Promise<{ enrollmentId: string; levelSubjectId: string }[]> {
  const db = client ?? (await getDb());
  const rows = await db.attendanceRecord.findMany({
    where: {
      organizationId,
      deletedAt: null,
      enrollmentId: filters.enrollmentId ?? { not: null },
      attendanceSession: {
        deletedAt: null,
        ...(filters.classGroupId ? { classGroupId: filters.classGroupId } : {}),
        ...(filters.levelSubjectId ? { levelSubjectId: filters.levelSubjectId } : {}),
        ...(filters.academicYearId ? { academicYearId: filters.academicYearId } : {}),
      },
    },
    select: { enrollmentId: true, attendanceSession: { select: { levelSubjectId: true } } },
  });

  const seen = new Set<string>();
  const targets: { enrollmentId: string; levelSubjectId: string }[] = [];
  for (const r of rows) {
    if (r.enrollmentId == null) continue;
    const key = `${r.enrollmentId}|${r.attendanceSession.levelSubjectId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    targets.push({ enrollmentId: r.enrollmentId, levelSubjectId: r.attendanceSession.levelSubjectId });
  }
  return targets;
}

// ─── Single write path (single-writer rule) ──────────────────────────────────

export interface UpsertSummaryData {
  organizationId: string;
  enrollmentId: string;
  studentId: string;
  levelSubjectId: string;
  attendancePolicyId: string | null;
  totalSessions: number;
  totalScheduledMinutes: number;
  totalPresentMinutes: number;
  totalAbsentMinutes: number;
  totalLateMinutes: number;
  totalExcusedMinutes: number;
  attendancePercentage: number | null;
  status: string;
  calculatedAt: Date;
}

export async function findSummaryByEnrollmentAndSubject(
  enrollmentId: string,
  levelSubjectId: string,
  organizationId: string,
  client?: PrismaClientOrTx
): Promise<StudentSubjectAttendanceSummary | null> {
  const db = client ?? (await getDb());
  const row = await db.studentSubjectAttendanceSummary.findFirst({
    where: { enrollmentId, levelSubjectId, organizationId },
    select: summarySelect,
  });
  return row ? toSummary(row) : null;
}

export async function upsertSummary(
  data: UpsertSummaryData,
  client?: PrismaClientOrTx
): Promise<StudentSubjectAttendanceSummary> {
  const db = client ?? (await getDb());
  const writable = {
    studentId: data.studentId,
    attendancePolicyId: data.attendancePolicyId,
    totalSessions: data.totalSessions,
    totalScheduledMinutes: data.totalScheduledMinutes,
    totalPresentMinutes: data.totalPresentMinutes,
    totalAbsentMinutes: data.totalAbsentMinutes,
    totalLateMinutes: data.totalLateMinutes,
    totalExcusedMinutes: data.totalExcusedMinutes,
    attendancePercentage: data.attendancePercentage,
    status: data.status,
    calculatedAt: data.calculatedAt,
  };
  const row = await db.studentSubjectAttendanceSummary.upsert({
    where: { enrollmentId_levelSubjectId: { enrollmentId: data.enrollmentId, levelSubjectId: data.levelSubjectId } },
    create: {
      organizationId: data.organizationId,
      enrollmentId: data.enrollmentId,
      levelSubjectId: data.levelSubjectId,
      ...writable,
    },
    update: writable,
    select: summarySelect,
  });
  return toSummary(row);
}

// ─── Read-only reporting queries (Phase 3 §9) ─────────────────────────────────

export async function findSubjectAttendanceSummaryByEnrollment(
  enrollmentId: string,
  organizationId: string,
  client?: PrismaClientOrTx
): Promise<StudentSubjectAttendanceSummary[]> {
  const db = client ?? (await getDb());
  const rows = await db.studentSubjectAttendanceSummary.findMany({
    where: { enrollmentId, organizationId },
    select: summarySelect,
    orderBy: { levelSubjectId: "asc" },
  });
  return rows.map(toSummary);
}

export async function findSubjectAttendanceSummariesByStudent(
  studentId: string,
  organizationId: string,
  client?: PrismaClientOrTx
): Promise<StudentSubjectAttendanceSummary[]> {
  const db = client ?? (await getDb());
  const rows = await db.studentSubjectAttendanceSummary.findMany({
    where: { studentId, organizationId },
    select: summarySelect,
    orderBy: [{ enrollmentId: "asc" }, { levelSubjectId: "asc" }],
  });
  return rows.map(toSummary);
}

export async function findSubjectAttendanceSummariesByClassGroup(
  classGroupId: string,
  organizationId: string,
  client?: PrismaClientOrTx
): Promise<StudentSubjectAttendanceSummary[]> {
  const db = client ?? (await getDb());
  const rows = await db.studentSubjectAttendanceSummary.findMany({
    where: { organizationId, enrollment: { classGroupId } },
    select: summarySelect,
    orderBy: [{ studentId: "asc" }, { levelSubjectId: "asc" }],
  });
  return rows.map(toSummary);
}

export async function findStudentsBelowRequiredAttendance(
  organizationId: string,
  filters: { classGroupId?: string; levelSubjectId?: string } = {},
  client?: PrismaClientOrTx
): Promise<StudentSubjectAttendanceSummary[]> {
  const db = client ?? (await getDb());
  const rows = await db.studentSubjectAttendanceSummary.findMany({
    where: {
      organizationId,
      status: "BELOW_REQUIRED",
      ...(filters.levelSubjectId ? { levelSubjectId: filters.levelSubjectId } : {}),
      ...(filters.classGroupId ? { enrollment: { classGroupId: filters.classGroupId } } : {}),
    },
    select: summarySelect,
    orderBy: [{ attendancePercentage: "asc" }],
  });
  return rows.map(toSummary);
}
