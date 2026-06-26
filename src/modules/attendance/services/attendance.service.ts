import { getDb } from "@/server/db";
import {
  findAttendanceSessionsByOrganization,
  countSessionsByStatus,
  findAttendanceSessionsByClassGroup,
} from "@/modules/attendance/repositories/attendance-session.repository";
import {
  countSessionRecordsByStatus,
} from "@/modules/attendance/repositories/attendance-record.repository";
import {
  countJustificationsByStatus,
} from "@/modules/attendance/repositories/attendance-justification.repository";
import type { AttendanceSession, ListAttendanceSessionsParams } from "@/modules/attendance/types";
import type { PaginatedResult } from "@/shared/types/common";

// =============================================================================
// ATTENDANCE SERVICE — read-only queries and summaries
// =============================================================================

export async function getAttendanceSessionsByOrganization(
  organizationId: string,
  params: ListAttendanceSessionsParams
): Promise<PaginatedResult<AttendanceSession>> {
  return findAttendanceSessionsByOrganization(organizationId, params);
}

export async function getAttendanceSessionStats(
  organizationId: string
): Promise<Record<string, number>> {
  return countSessionsByStatus(organizationId);
}

export async function getSessionRecordsSummary(
  sessionId: string,
  organizationId: string
): Promise<Record<string, number>> {
  return countSessionRecordsByStatus(sessionId, organizationId);
}

export async function getJustificationStats(
  organizationId: string
): Promise<Record<string, number>> {
  return countJustificationsByStatus(organizationId);
}

export async function getRecentSessionsForClassGroup(
  classGroupId: string,
  organizationId: string,
  limit = 5
): Promise<AttendanceSession[]> {
  return findAttendanceSessionsByClassGroup(classGroupId, organizationId, limit);
}

// Load students from ACTIVE enrollments for a class group + academic context
export async function getEnrolledStudentsForSession(
  classGroupId: string,
  academicYearId: string,
  academicTermId: string | null | undefined,
  organizationId: string
): Promise<
  {
    studentId: string;
    enrollmentId: string;
    firstName: string;
    lastName: string;
    code: string | null;
  }[]
> {
  const db = await getDb();
  const where: any = {
    classGroupId,
    academicYearId,
    organizationId,
    status: "ACTIVE",
    deletedAt: null,
  };
  if (academicTermId) where.academicTermId = academicTermId;

  const enrollments = await db.enrollment.findMany({
    where,
    select: {
      id: true,
      studentId: true,
      student: { select: { id: true, firstName: true, lastName: true, code: true } },
    },
    orderBy: [{ student: { firstName: "asc" } }],
  });

  return enrollments.map((e) => ({
    studentId: e.studentId,
    enrollmentId: e.id,
    firstName: e.student.firstName,
    lastName: e.student.lastName,
    code: e.student.code,
  }));
}

// Options used by create-session form
export async function getSessionFormOptions(
  organizationId: string,
  // Teacher-scoped: restrict the class-group dropdown to the teacher's own groups
  // (resolved server-side). Undefined → org-wide (admins/secretaries).
  classGroupTeacherId?: string
) {
  const db = await getDb();
  const [academicYears, classGroups, teachers, classrooms] = await Promise.all([
    db.academicYear.findMany({
      where: { organizationId, deletedAt: null, status: { not: "ARCHIVED" } },
      select: { id: true, name: true, status: true },
      orderBy: { startDate: "desc" },
    }),
    db.classGroup.findMany({
      where: {
        organizationId,
        deletedAt: null,
        status: { in: ["FORMING", "ACTIVE"] },
        ...(classGroupTeacherId !== undefined && { teacherId: classGroupTeacherId }),
      },
      select: {
        id: true,
        name: true,
        courseId: true,
        courseLevelId: true,
        academicYearId: true,
        academicTermId: true,
        course: { select: { id: true, name: true } },
        courseLevel: { select: { id: true, name: true } },
      },
      orderBy: { name: "asc" },
    }),
    db.teacher.findMany({
      // Teacher-scoped: only the teacher themselves (assigned-teacher field is
      // locked to self). Org-wide for admins/secretaries.
      where: {
        organizationId,
        deletedAt: null,
        status: "ACTIVE",
        ...(classGroupTeacherId !== undefined && { id: classGroupTeacherId }),
      },
      select: { id: true, firstName: true, lastName: true },
      orderBy: [{ firstName: "asc" }],
    }),
    db.classroom.findMany({
      where: { organizationId, deletedAt: null, status: "AVAILABLE" },
      select: { id: true, name: true, code: true },
      orderBy: { name: "asc" },
    }),
  ]);
  return { academicYears, classGroups, teachers, classrooms };
}

export async function getLevelSubjectsForCourseLevel(
  courseLevelId: string,
  organizationId: string
) {
  const db = await getDb();
  const rows = await db.levelSubject.findMany({
    where: { courseLevelId, organizationId, status: "ACTIVE", deletedAt: null },
    select: {
      id: true,
      subjectId: true,
      minimumAttendancePercentage: true,
      subject: { select: { id: true, name: true } },
    },
    orderBy: { order: "asc" },
  });
  return rows.map((r) => ({
    ...r,
    minimumAttendancePercentage: r.minimumAttendancePercentage
      ? Number(r.minimumAttendancePercentage)
      : null,
  }));
}
