import { getDb } from "@/server/db";
import { buildSkipTake, buildPaginationMeta } from "@/shared/lib/pagination";
import type { PaginatedResult, PaginationParams } from "@/shared/types/common";
import type { AttendanceRecordRow } from "@/modules/students/student-360/types";

// =============================================================================
// STUDENT 360 REPOSITORY
// All queries are scoped to organizationId + studentId. Never query cross-tenant.
// Academic progression (level/course progress) is owned by the prerequisites module
// and read from there (M1) — this repository does not query those tables.
// =============================================================================

export async function findAttendanceRecordsByStudent(
  studentId: string,
  organizationId: string,
  params: PaginationParams
): Promise<PaginatedResult<AttendanceRecordRow>> {
  const db = await getDb();
  const { skip, take } = buildSkipTake(params);

  const where = { studentId, organizationId, deletedAt: null };

  const [rows, total] = await Promise.all([
    db.attendanceRecord.findMany({
      where,
      select: {
        id: true,
        status: true,
        notes: true,
        attendanceSession: {
          select: {
            sessionDate: true,
            subject: { select: { name: true } },
            classGroup: { select: { name: true } },
            teacher: { select: { firstName: true, lastName: true } },
          },
        },
      },
      skip,
      take,
      orderBy: { attendanceSession: { sessionDate: "desc" } },
    }),
    db.attendanceRecord.count({ where }),
  ]);

  const mapped: AttendanceRecordRow[] = rows.map((r) => ({
    id: r.id,
    sessionDate: r.attendanceSession.sessionDate,
    subjectName: r.attendanceSession.subject.name,
    classGroupName: r.attendanceSession.classGroup.name,
    status: r.status,
    teacherName: r.attendanceSession.teacher
      ? `${r.attendanceSession.teacher.firstName} ${r.attendanceSession.teacher.lastName}`
      : null,
    notes: r.notes,
  }));

  return buildPaginationMeta(mapped, total, params);
}

export async function findLastActivityAt(
  studentId: string,
  organizationId: string
): Promise<Date | null> {
  const db = await getDb();
  const row = await db.studentTimelineEvent.findFirst({
    where: { studentId, organizationId, deletedAt: null },
    select: { occurredAt: true },
    orderBy: { occurredAt: "desc" },
  });
  return row?.occurredAt ?? null;
}
