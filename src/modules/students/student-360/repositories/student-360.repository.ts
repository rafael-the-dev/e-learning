import { getDb } from "@/server/db";
import { buildSkipTake, buildPaginationMeta } from "@/shared/lib/pagination";
import type { PaginatedResult, PaginationParams } from "@/shared/types/common";
import type { AttendanceRecordRow } from "@/modules/students/student-360/types";
import type { StudentLevelProgress, StudentCourseProgress } from "@/modules/prerequisites/types";

// =============================================================================
// STUDENT 360 REPOSITORY
// All queries are scoped to organizationId + studentId. Never query cross-tenant.
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

export async function findLevelProgressByStudent(
  studentId: string,
  organizationId: string
): Promise<StudentLevelProgress[]> {
  const db = await getDb();
  const rows = await db.studentLevelProgress.findMany({
    where: { studentId, organizationId },
    include: { courseLevel: { select: { name: true, order: true } } },
    orderBy: { courseLevel: { order: "asc" } },
  });
  return rows.map((row) => ({
    id: row.id,
    organizationId: row.organizationId,
    enrollmentId: row.enrollmentId,
    studentId: row.studentId,
    courseId: row.courseId,
    courseLevelId: row.courseLevelId,
    finalGrade: row.finalGrade != null ? Number(row.finalGrade) : null,
    earnedCredits: row.earnedCredits,
    status: row.status,
    progressReason: row.progressReason,
    completedAt: row.completedAt,
    calculatedAt: row.calculatedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    courseLevelName: row.courseLevel?.name ?? null,
    courseLevelOrder: row.courseLevel?.order ?? null,
  }));
}

export async function findCourseProgressByStudent(
  studentId: string,
  organizationId: string
): Promise<StudentCourseProgress[]> {
  const db = await getDb();
  const rows = await db.studentCourseProgress.findMany({
    where: { studentId, organizationId },
    include: { course: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
  });
  return rows.map((row) => ({
    id: row.id,
    organizationId: row.organizationId,
    enrollmentId: row.enrollmentId,
    studentId: row.studentId,
    courseId: row.courseId,
    finalGrade: row.finalGrade != null ? Number(row.finalGrade) : null,
    earnedCredits: row.earnedCredits,
    status: row.status,
    progressReason: row.progressReason,
    completedAt: row.completedAt,
    calculatedAt: row.calculatedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    courseName: row.course?.name ?? null,
  }));
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
