import { getDb } from "@/server/db";
import type { AttendanceRecord } from "@/modules/attendance/types";

// =============================================================================
// ATTENDANCE RECORD REPOSITORY
// =============================================================================

const recordSelect = {
  id: true,
  organizationId: true,
  attendanceSessionId: true,
  studentId: true,
  enrollmentId: true,
  status: true,
  checkInAt: true,
  checkOutAt: true,
  minutesAttended: true,
  lateMinutes: true,
  markedByUserId: true,
  markedAt: true,
  notes: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
  student: { select: { id: true, firstName: true, lastName: true, code: true } },
  attendanceSession: { select: { id: true, sessionDate: true, durationMinutes: true } },
} as const;

function mapToRecord(row: any): AttendanceRecord {
  return {
    id: row.id,
    organizationId: row.organizationId,
    attendanceSessionId: row.attendanceSessionId,
    studentId: row.studentId,
    enrollmentId: row.enrollmentId,
    status: row.status,
    checkInAt: row.checkInAt,
    checkOutAt: row.checkOutAt,
    minutesAttended: row.minutesAttended,
    lateMinutes: row.lateMinutes,
    markedByUserId: row.markedByUserId,
    markedAt: row.markedAt,
    notes: row.notes,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    deletedAt: row.deletedAt,
    student: row.student,
    attendanceSession: row.attendanceSession,
  };
}

export async function findRecordsBySession(
  attendanceSessionId: string,
  organizationId: string
): Promise<AttendanceRecord[]> {
  const db = await getDb();
  const rows = await db.attendanceRecord.findMany({
    where: { attendanceSessionId, organizationId, deletedAt: null },
    select: recordSelect,
    orderBy: [{ student: { firstName: "asc" } }],
  });
  return rows.map(mapToRecord);
}

export async function findRecordById(
  id: string,
  organizationId: string
): Promise<AttendanceRecord | null> {
  const db = await getDb();
  const row = await db.attendanceRecord.findFirst({
    where: { id, organizationId, deletedAt: null },
    select: recordSelect,
  });
  return row ? mapToRecord(row) : null;
}

export async function findRecordBySessionAndStudent(
  attendanceSessionId: string,
  studentId: string,
  organizationId: string
): Promise<AttendanceRecord | null> {
  const db = await getDb();
  const row = await db.attendanceRecord.findFirst({
    where: { attendanceSessionId, studentId, organizationId, deletedAt: null },
    select: recordSelect,
  });
  return row ? mapToRecord(row) : null;
}

export async function findRecordsByStudentAndSessions(
  studentId: string,
  sessionIds: string[],
  organizationId: string
): Promise<AttendanceRecord[]> {
  const db = await getDb();
  const rows = await db.attendanceRecord.findMany({
    where: {
      studentId,
      attendanceSessionId: { in: sessionIds },
      organizationId,
      deletedAt: null,
    },
    select: recordSelect,
  });
  return rows.map(mapToRecord);
}

export async function upsertAttendanceRecord(data: {
  organizationId: string;
  attendanceSessionId: string;
  studentId: string;
  enrollmentId?: string | null;
  status: string;
  lateMinutes?: number | null;
  minutesAttended: number;
  markedByUserId?: string | null;
  markedAt?: Date;
  notes?: string | null;
}): Promise<AttendanceRecord> {
  const db = await getDb();
  const existing = await db.attendanceRecord.findFirst({
    where: {
      attendanceSessionId: data.attendanceSessionId,
      studentId: data.studentId,
    },
  });

  let row: any;
  if (existing) {
    row = await db.attendanceRecord.update({
      where: { id: existing.id },
      data: {
        status: data.status,
        lateMinutes: data.lateMinutes ?? null,
        minutesAttended: data.minutesAttended,
        markedByUserId: data.markedByUserId ?? null,
        markedAt: data.markedAt ?? new Date(),
        notes: data.notes ?? null,
        deletedAt: null,
      },
      select: recordSelect,
    });
  } else {
    row = await db.attendanceRecord.create({
      data: {
        organizationId: data.organizationId,
        attendanceSessionId: data.attendanceSessionId,
        studentId: data.studentId,
        enrollmentId: data.enrollmentId ?? null,
        status: data.status,
        lateMinutes: data.lateMinutes ?? null,
        minutesAttended: data.minutesAttended,
        markedByUserId: data.markedByUserId ?? null,
        markedAt: data.markedAt ?? new Date(),
        notes: data.notes ?? null,
      },
      select: recordSelect,
    });
  }
  return mapToRecord(row);
}

export async function updateAttendanceRecord(
  id: string,
  organizationId: string,
  data: {
    status?: string;
    lateMinutes?: number | null;
    minutesAttended?: number;
    notes?: string | null;
    markedByUserId?: string | null;
    markedAt?: Date;
  }
): Promise<AttendanceRecord> {
  const db = await getDb();
  const row = await db.attendanceRecord.update({
    where: { id },
    data,
    select: recordSelect,
  });
  return mapToRecord(row);
}

export async function countSessionRecordsByStatus(
  attendanceSessionId: string,
  organizationId: string
): Promise<Record<string, number>> {
  const db = await getDb();
  const rows = await db.attendanceRecord.groupBy({
    by: ["status"],
    where: { attendanceSessionId, organizationId, deletedAt: null },
    _count: { _all: true },
  });
  const result: Record<string, number> = {};
  for (const r of rows) result[r.status] = r._count._all;
  return result;
}

export async function findStudentRecordsForLevelSubject(
  studentId: string,
  sessionIds: string[],
  organizationId: string
): Promise<{ status: string; minutesAttended: number; lateMinutes: number | null }[]> {
  if (sessionIds.length === 0) return [];
  const db = await getDb();
  return db.attendanceRecord.findMany({
    where: {
      studentId,
      attendanceSessionId: { in: sessionIds },
      organizationId,
      deletedAt: null,
    },
    select: { status: true, minutesAttended: true, lateMinutes: true },
  });
}
