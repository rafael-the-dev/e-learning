import { getDb } from "@/server/db";
import { buildSkipTake, buildPaginationMeta } from "@/shared/lib/pagination";
import type { PaginatedResult } from "@/shared/types/common";
import type { AttendanceSession, ListAttendanceSessionsParams } from "@/modules/attendance/types";

// =============================================================================
// ATTENDANCE SESSION REPOSITORY
// =============================================================================

const sessionSelect = {
  id: true,
  organizationId: true,
  branchId: true,
  academicYearId: true,
  academicTermId: true,
  classGroupId: true,
  courseId: true,
  courseLevelId: true,
  subjectId: true,
  levelSubjectId: true,
  teacherId: true,
  classroomId: true,
  scheduleSlotId: true,
  sessionDate: true,
  startTime: true,
  endTime: true,
  durationMinutes: true,
  title: true,
  notes: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
  createdBy: true,
  classGroup: { select: { id: true, name: true } },
  subject: { select: { id: true, name: true } },
  teacher: { select: { id: true, firstName: true, lastName: true } },
  classroom: { select: { id: true, name: true } },
  academicYear: { select: { id: true, name: true } },
  academicTerm: { select: { id: true, name: true } },
  _count: { select: { records: true } },
} as const;

function mapToSession(row: any): AttendanceSession {
  return {
    id: row.id,
    organizationId: row.organizationId,
    branchId: row.branchId,
    academicYearId: row.academicYearId,
    academicTermId: row.academicTermId,
    classGroupId: row.classGroupId,
    courseId: row.courseId,
    courseLevelId: row.courseLevelId,
    subjectId: row.subjectId,
    levelSubjectId: row.levelSubjectId,
    teacherId: row.teacherId,
    classroomId: row.classroomId,
    scheduleSlotId: row.scheduleSlotId,
    sessionDate: row.sessionDate,
    startTime: row.startTime,
    endTime: row.endTime,
    durationMinutes: row.durationMinutes,
    title: row.title,
    notes: row.notes,
    status: row.status,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    deletedAt: row.deletedAt,
    createdBy: row.createdBy,
    classGroup: row.classGroup,
    subject: row.subject,
    teacher: row.teacher,
    classroom: row.classroom,
    academicYear: row.academicYear,
    academicTerm: row.academicTerm,
    _count: row._count,
  };
}

export async function findAttendanceSessionsByOrganization(
  organizationId: string,
  params: ListAttendanceSessionsParams
): Promise<PaginatedResult<AttendanceSession>> {
  const db = await getDb();
  const { skip, take } = buildSkipTake(params);

  const where: any = { organizationId, deletedAt: null };
  if (params.academicYearId) where.academicYearId = params.academicYearId;
  if (params.academicTermId) where.academicTermId = params.academicTermId;
  if (params.classGroupId) where.classGroupId = params.classGroupId;
  if (params.subjectId) where.subjectId = params.subjectId;
  if (params.teacherId) where.teacherId = params.teacherId;
  if (params.status) where.status = params.status;
  if (params.from || params.to) {
    where.sessionDate = {};
    if (params.from) where.sessionDate.gte = new Date(params.from);
    if (params.to) where.sessionDate.lte = new Date(params.to);
  }
  if (params.search) {
    where.OR = [
      { title: { contains: params.search } },
      { classGroup: { name: { contains: params.search } } },
      { subject: { name: { contains: params.search } } },
    ];
  }

  const [rows, total] = await Promise.all([
    db.attendanceSession.findMany({
      where,
      select: sessionSelect,
      skip,
      take,
      orderBy: [{ sessionDate: "desc" }, { startTime: "desc" }],
    }),
    db.attendanceSession.count({ where }),
  ]);

  return buildPaginationMeta(rows.map(mapToSession), total, params);
}

export async function findAttendanceSessionById(
  id: string,
  organizationId: string
): Promise<AttendanceSession | null> {
  const db = await getDb();
  const row = await db.attendanceSession.findFirst({
    where: { id, organizationId, deletedAt: null },
    select: sessionSelect,
  });
  return row ? mapToSession(row) : null;
}

export async function findAttendanceSessionsByClassGroup(
  classGroupId: string,
  organizationId: string,
  limit = 10
): Promise<AttendanceSession[]> {
  const db = await getDb();
  const rows = await db.attendanceSession.findMany({
    where: { classGroupId, organizationId, deletedAt: null },
    select: sessionSelect,
    orderBy: [{ sessionDate: "desc" }],
    take: limit,
  });
  return rows.map(mapToSession);
}

export async function createAttendanceSession(data: {
  organizationId: string;
  branchId?: string | null;
  academicYearId: string;
  academicTermId?: string | null;
  classGroupId: string;
  courseId: string;
  courseLevelId: string;
  subjectId: string;
  levelSubjectId: string;
  teacherId?: string | null;
  classroomId?: string | null;
  scheduleSlotId?: string | null;
  sessionDate: Date;
  startTime: string;
  endTime: string;
  durationMinutes: number;
  title?: string | null;
  notes?: string | null;
  status: string;
  createdBy?: string | null;
}): Promise<AttendanceSession> {
  const db = await getDb();
  const row = await db.attendanceSession.create({ data, select: sessionSelect });
  return mapToSession(row);
}

export async function updateAttendanceSession(
  id: string,
  organizationId: string,
  data: {
    teacherId?: string | null;
    classroomId?: string | null;
    scheduleSlotId?: string | null;
    sessionDate?: Date;
    startTime?: string;
    endTime?: string;
    durationMinutes?: number;
    title?: string | null;
    notes?: string | null;
    status?: string;
  }
): Promise<AttendanceSession> {
  const db = await getDb();
  const row = await db.attendanceSession.update({
    where: { id },
    data,
    select: sessionSelect,
  });
  return mapToSession(row);
}

export async function countSessionsByStatus(
  organizationId: string
): Promise<Record<string, number>> {
  const db = await getDb();
  const rows = await db.attendanceSession.groupBy({
    by: ["status"],
    where: { organizationId, deletedAt: null },
    _count: { _all: true },
  });
  const result: Record<string, number> = {};
  for (const r of rows) result[r.status] = r._count._all;
  return result;
}

export async function countCompletedSessionsForLevelSubject(
  classGroupId: string,
  levelSubjectId: string,
  organizationId: string
): Promise<number> {
  const db = await getDb();
  return db.attendanceSession.count({
    where: {
      classGroupId,
      levelSubjectId,
      organizationId,
      status: "COMPLETED",
      deletedAt: null,
    },
  });
}

export async function findCompletedSessionsForLevelSubject(
  classGroupId: string,
  levelSubjectId: string,
  organizationId: string
): Promise<{ id: string; durationMinutes: number }[]> {
  const db = await getDb();
  return db.attendanceSession.findMany({
    where: {
      classGroupId,
      levelSubjectId,
      organizationId,
      status: "COMPLETED",
      deletedAt: null,
    },
    select: { id: true, durationMinutes: true },
  });
}
