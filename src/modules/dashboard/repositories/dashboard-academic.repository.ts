import { Prisma } from "@prisma/client";
import { getDb } from "@/server/db";

// =============================================================================
// DASHBOARD ACADEMIC REPOSITORY
// All queries are org-scoped. Attendance figures are read from
// StudentSubjectProgress.attendancePercentage — the same precomputed column
// the Students module already uses for its own risk counts
// (countStudentsWithLowAttendance in student.repository.ts) — rather than
// re-deriving percentages from AttendanceRecord/AttendanceSession here.
// =============================================================================

// A class group counts as "low attendance" when its average student-subject
// attendance falls below this absolute threshold. Mirrors the 75% default
// already used by the Students module's per-student low-attendance count.
const LOW_ATTENDANCE_THRESHOLD = 75;
const WATCHLIST_ROW_LIMIT = 10;

export interface AcademicRiskCounts {
  blockedStudents: number;
  recoveryRequired: number;
  studentsAtRisk: number;
  eligibleNoAction: number;
  overdueAssessments: number;
  studentsLowAttendance: number;
  classGroupsLowAttendance: number;
}

export async function getAcademicRiskCounts(organizationId: string): Promise<AcademicRiskCounts> {
  const db = await getDb();
  const now = new Date();

  const [
    blockedStudents,
    levelRecovery,
    courseRecovery,
    eligibleNoAction,
    overdueAssessments,
    studentsLowAttendance,
    classGroupRows,
  ] = await Promise.all([
    db.studentLevelProgress.findMany({
      where: { organizationId, status: "BLOCKED" },
      select: { studentId: true },
      distinct: ["studentId"],
    }),
    db.studentLevelProgress.findMany({
      where: { organizationId, status: "RECOVERY_REQUIRED" },
      select: { studentId: true },
      distinct: ["studentId"],
    }),
    db.studentCourseProgress.findMany({
      where: { organizationId, status: "RECOVERY_REQUIRED" },
      select: { studentId: true },
      distinct: ["studentId"],
    }),
    db.studentLevelProgress.count({
      where: {
        organizationId,
        status: "ELIGIBLE_TO_PROGRESS",
        enrollment: { levelProgressionRequests: { none: {} } },
      },
    }),
    db.assessment.count({
      where: { organizationId, deletedAt: null, status: "OPEN", assessmentDate: { lt: now } },
    }),
    db.studentSubjectProgress.findMany({
      where: { organizationId, attendancePercentage: { lt: LOW_ATTENDANCE_THRESHOLD, not: null } },
      select: { studentId: true },
      distinct: ["studentId"],
    }),
    db.$queryRaw<Array<{ classGroupId: string }>>(Prisma.sql`
      SELECT cg.id AS classGroupId
      FROM student_subject_progress ssp
      JOIN enrollments e ON e.id = ssp.enrollmentId
      JOIN class_groups cg ON cg.id = e.classGroupId
      WHERE ssp.organizationId = ${organizationId}
        AND ssp.attendancePercentage IS NOT NULL
        AND cg.deletedAt IS NULL
      GROUP BY cg.id
      HAVING AVG(CAST(ssp.attendancePercentage AS FLOAT)) < ${LOW_ATTENDANCE_THRESHOLD}
    `),
  ]);

  const recoverySet = new Set([
    ...levelRecovery.map((r) => r.studentId),
    ...courseRecovery.map((r) => r.studentId),
  ]);
  const atRiskSet = new Set([...blockedStudents.map((r) => r.studentId), ...recoverySet]);

  return {
    blockedStudents: blockedStudents.length,
    recoveryRequired: recoverySet.size,
    studentsAtRisk: atRiskSet.size,
    eligibleNoAction,
    overdueAssessments,
    studentsLowAttendance: studentsLowAttendance.length,
    classGroupsLowAttendance: classGroupRows.length,
  };
}

// =============================================================================
// QUICK STATS SOURCE DATA
// =============================================================================

export async function getOrgAverageAttendance(organizationId: string): Promise<number> {
  const db = await getDb();
  const [row] = await db.$queryRaw<Array<{ avgPct: number | null }>>(Prisma.sql`
    SELECT AVG(CAST(attendancePercentage AS FLOAT)) AS avgPct
    FROM student_subject_progress
    WHERE organizationId = ${organizationId} AND attendancePercentage IS NOT NULL
  `);
  return row?.avgPct ?? 0;
}

export async function getApprovalRate(organizationId: string): Promise<number> {
  const db = await getDb();
  const groups = await db.studentSubjectProgress.groupBy({
    by: ["status"],
    where: { organizationId, status: { in: ["PASSED", "FAILED"] } },
    _count: { _all: true },
  });
  const passed = groups.find((g) => g.status === "PASSED")?._count._all ?? 0;
  const failed = groups.find((g) => g.status === "FAILED")?._count._all ?? 0;
  const total = passed + failed;
  return total > 0 ? (passed / total) * 100 : 0;
}

// =============================================================================
// ACADEMIC WATCHLIST ROWS
// =============================================================================

export interface AcademicWatchlistRow {
  severity: "CRITICAL" | "HIGH" | "MEDIUM";
  studentId: string;
  studentName: string;
  courseName: string | null;
  issue: string;
}

export async function findBlockedStudents(organizationId: string): Promise<AcademicWatchlistRow[]> {
  const db = await getDb();
  const rows = await db.studentLevelProgress.findMany({
    where: { organizationId, status: "BLOCKED" },
    select: {
      studentId: true,
      progressReason: true,
      student: { select: { firstName: true, lastName: true } },
      courseLevel: { select: { name: true, course: { select: { name: true } } } },
    },
    orderBy: { calculatedAt: "desc" },
    take: WATCHLIST_ROW_LIMIT,
  });

  return rows.map((r) => ({
    severity: "CRITICAL",
    studentId: r.studentId,
    studentName: `${r.student.firstName} ${r.student.lastName}`,
    courseName: r.courseLevel.course.name,
    issue: r.progressReason ? `Bloqueado — ${r.progressReason}` : `Bloqueado em ${r.courseLevel.name}`,
  }));
}

export async function findRecoveryRequiredStudents(organizationId: string): Promise<AcademicWatchlistRow[]> {
  const db = await getDb();
  const rows = await db.studentCourseProgress.findMany({
    where: { organizationId, status: "RECOVERY_REQUIRED" },
    select: {
      studentId: true,
      student: { select: { firstName: true, lastName: true } },
      course: { select: { name: true } },
    },
    orderBy: { calculatedAt: "desc" },
    take: WATCHLIST_ROW_LIMIT,
  });

  return rows.map((r) => ({
    severity: "HIGH",
    studentId: r.studentId,
    studentName: `${r.student.firstName} ${r.student.lastName}`,
    courseName: r.course.name,
    issue: "Recuperação pendente",
  }));
}

export async function findStudentsWithLowAttendance(organizationId: string): Promise<AcademicWatchlistRow[]> {
  const db = await getDb();
  const rows = await db.studentSubjectProgress.findMany({
    where: { organizationId, attendancePercentage: { lt: LOW_ATTENDANCE_THRESHOLD, not: null } },
    select: {
      studentId: true,
      attendancePercentage: true,
      student: { select: { firstName: true, lastName: true } },
      enrollment: { select: { course: { select: { name: true } } } },
    },
    orderBy: { attendancePercentage: "asc" },
    take: WATCHLIST_ROW_LIMIT * 2,
  });

  const seen = new Set<string>();
  const result: AcademicWatchlistRow[] = [];
  for (const r of rows) {
    if (seen.has(r.studentId)) continue;
    seen.add(r.studentId);
    result.push({
      severity: "HIGH",
      studentId: r.studentId,
      studentName: `${r.student.firstName} ${r.student.lastName}`,
      courseName: r.enrollment.course.name,
      issue: `Presença em ${Number(r.attendancePercentage).toFixed(0)}% — abaixo do mínimo`,
    });
    if (result.length >= WATCHLIST_ROW_LIMIT) break;
  }
  return result;
}

export async function findEligibleNoActionStudents(organizationId: string): Promise<AcademicWatchlistRow[]> {
  const db = await getDb();
  const rows = await db.studentLevelProgress.findMany({
    where: {
      organizationId,
      status: "ELIGIBLE_TO_PROGRESS",
      enrollment: { levelProgressionRequests: { none: {} } },
    },
    select: {
      studentId: true,
      student: { select: { firstName: true, lastName: true } },
      courseLevel: { select: { name: true, course: { select: { name: true } } } },
    },
    orderBy: { calculatedAt: "desc" },
    take: WATCHLIST_ROW_LIMIT,
  });

  return rows.map((r) => ({
    severity: "MEDIUM",
    studentId: r.studentId,
    studentName: `${r.student.firstName} ${r.student.lastName}`,
    courseName: r.courseLevel.course.name,
    issue: `Elegível para progredir para ${r.courseLevel.name} — sem ação`,
  }));
}
