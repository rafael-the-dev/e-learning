import { getDb } from "@/server/db";

// =============================================================================
// STUDENT PORTAL REPOSITORY
// Every query is scoped to organizationId AND to the current student — either
// directly by studentId, or by classGroupId restricted to the IDs of the
// student's own active enrollments (resolved server-side, never from client
// input). Defense-in-depth: callers must never be trusted to pre-filter.
// =============================================================================

// Caps so a single panel can never trigger an unbounded scan. A student's own
// data is small, but we still bound every read.
const ATTENDANCE_STATS_LIMIT = 1000;

export interface UpcomingClassRow {
  id: string;
  sessionDate: Date;
  startTime: string;
  endTime: string;
  status: string;
  subjectName: string;
  teacherName: string | null;
  classroomName: string | null;
}

/**
 * Concrete scheduled sessions for the student's own class groups within a date
 * window. `classGroupIds` MUST come from the student's active enrollments.
 */
export async function findStudentUpcomingClasses(
  organizationId: string,
  classGroupIds: string[],
  from: Date,
  to: Date,
  limit: number
): Promise<UpcomingClassRow[]> {
  if (classGroupIds.length === 0) return [];
  const db = await getDb();
  const rows = await db.attendanceSession.findMany({
    where: {
      organizationId,
      classGroupId: { in: classGroupIds },
      deletedAt: null,
      sessionDate: { gte: from, lte: to },
      status: { notIn: ["CANCELLED", "ARCHIVED"] },
    },
    select: {
      id: true,
      sessionDate: true,
      startTime: true,
      endTime: true,
      status: true,
      subject: { select: { name: true } },
      teacher: { select: { firstName: true, lastName: true } },
      classroom: { select: { name: true } },
    },
    orderBy: [{ sessionDate: "asc" }, { startTime: "asc" }],
    take: limit,
  });
  return rows.map((r) => ({
    id: r.id,
    sessionDate: r.sessionDate,
    startTime: r.startTime,
    endTime: r.endTime,
    status: r.status,
    subjectName: r.subject.name,
    teacherName: r.teacher ? `${r.teacher.firstName} ${r.teacher.lastName}` : null,
    classroomName: r.classroom?.name ?? null,
  }));
}

export interface AssessmentRawRow {
  assessmentId: string;
  title: string;
  subjectId: string;
  assessmentDate: Date;
  status: string;
  maxScore: number;
  isPublished: boolean;
  score: number | null;
}

/**
 * Assessments belonging to the student's own class groups. The student's own
 * result is included so a score can be shown, but ONLY when the assessment's
 * publication is PUBLISHED (enforced by the caller via `isPublished`). DRAFT,
 * CANCELLED and ARCHIVED assessments are never returned.
 */
export async function findStudentAssessments(
  organizationId: string,
  classGroupIds: string[],
  studentId: string,
  limit: number
): Promise<AssessmentRawRow[]> {
  if (classGroupIds.length === 0) return [];
  const db = await getDb();
  const rows = await db.assessment.findMany({
    where: {
      organizationId,
      classGroupId: { in: classGroupIds },
      deletedAt: null,
      status: { in: ["SCHEDULED", "OPEN", "GRADED"] },
    },
    select: {
      id: true,
      title: true,
      subjectId: true,
      assessmentDate: true,
      status: true,
      maxScore: true,
      publication: { select: { publicationStatus: true } },
      results: {
        where: { studentId, deletedAt: null },
        select: { score: true },
        take: 1,
      },
    },
    orderBy: { assessmentDate: "desc" },
    take: limit,
  });
  return rows.map((r) => {
    const isPublished = r.publication?.publicationStatus === "PUBLISHED";
    const rawScore = r.results[0]?.score;
    return {
      assessmentId: r.id,
      title: r.title,
      subjectId: r.subjectId,
      assessmentDate: r.assessmentDate,
      status: r.status,
      maxScore: Number(r.maxScore),
      isPublished,
      // Never leak a score for an unpublished assessment.
      score: isPublished && rawScore != null ? Number(rawScore) : null,
    };
  });
}

export interface PublishedGradeRawRow {
  id: string;
  subjectId: string;
  assessmentTitle: string;
  score: number;
  maxScore: number;
  status: string;
  publishedAt: Date | null;
}

/**
 * The student's PUBLISHED assessment results only. Filtered at the query level
 * to assessments whose publication is PUBLISHED — draft/unpublished results are
 * never returned, so an unpublished grade can never leak to the student.
 */
export async function findStudentPublishedGrades(
  organizationId: string,
  studentId: string,
  limit: number
): Promise<PublishedGradeRawRow[]> {
  const db = await getDb();
  const rows = await db.assessmentResult.findMany({
    where: {
      organizationId,
      studentId,
      deletedAt: null,
      assessment: { publication: { publicationStatus: "PUBLISHED" } },
    },
    select: {
      id: true,
      score: true,
      status: true,
      assessment: {
        select: {
          title: true,
          subjectId: true,
          maxScore: true,
          publication: { select: { publishedAt: true } },
        },
      },
    },
    take: limit,
  });
  return rows
    .map((r) => ({
      id: r.id,
      subjectId: r.assessment.subjectId,
      assessmentTitle: r.assessment.title,
      score: r.score != null ? Number(r.score) : 0,
      maxScore: Number(r.assessment.maxScore),
      status: r.status,
      publishedAt: r.assessment.publication?.publishedAt ?? null,
    }))
    .sort((a, b) => (b.publishedAt?.getTime() ?? 0) - (a.publishedAt?.getTime() ?? 0));
}

export interface AttendanceStatRow {
  status: string;
  sessionDate: Date;
  /** True when this record carries an APPROVED justification. Since Fix H2 the
   *  approval workflow no longer rewrites the record to EXCUSED, so "justified"
   *  is derived from the justification relation, not the raw status. */
  hasApprovedJustification: boolean;
}

/**
 * Raw attendance records for the student, newest first, capped. Used to compute
 * KPIs and the monthly trend in the service layer.
 */
export async function findStudentAttendanceForStats(
  organizationId: string,
  studentId: string
): Promise<AttendanceStatRow[]> {
  const db = await getDb();
  const rows = await db.attendanceRecord.findMany({
    where: { organizationId, studentId, deletedAt: null },
    select: {
      status: true,
      attendanceSession: { select: { sessionDate: true } },
      justifications: {
        where: { status: "APPROVED", deletedAt: null },
        select: { id: true },
        take: 1,
      },
    },
    orderBy: { attendanceSession: { sessionDate: "desc" } },
    take: ATTENDANCE_STATS_LIMIT,
  });
  return rows.map((r) => ({
    status: r.status,
    sessionDate: r.attendanceSession.sessionDate,
    hasApprovedJustification: r.justifications.length > 0,
  }));
}

/** Re-asserts organizationId even though subjectIds come from already-scoped queries. */
export async function findSubjectNamesByIds(
  organizationId: string,
  subjectIds: string[]
): Promise<Map<string, string>> {
  if (subjectIds.length === 0) return new Map();
  const db = await getDb();
  const rows = await db.subject.findMany({
    where: { organizationId, id: { in: subjectIds } },
    select: { id: true, name: true },
  });
  return new Map(rows.map((r) => [r.id, r.name]));
}
