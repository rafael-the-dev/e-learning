import { getDb } from "@/server/db";
import { buildSkipTake, buildPaginationMeta } from "@/shared/lib/pagination";
import type { PaginatedResult } from "@/shared/types/common";

const PT_MONTHS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ProgressKPIs {
  inProgressCount: number;
  completedCount: number;          // PASSED + COMPLETED
  failedCount: number;
  recoveryRequiredCount: number;
  blockedCount: number;            // StudentLevelProgress BLOCKED (distinct enrollments)
  eligibleCount: number;           // StudentLevelProgress ELIGIBLE_TO_PROGRESS
  subjectFailedCount: number;      // StudentSubjectProgress FAILED
  passRate: number;                // 0-100 integer
}

export interface ProgressTrendItem {
  month: string;
  // StudentCourseProgress records created in that month (new progressions)
  started: number;
  // PASSED/COMPLETED records whose completedAt falls in that month
  completed: number;
  // RECOVERY_REQUIRED records updated in that month — distinct from failed
  recovery: number;
  // FAILED records updated in that month
  failed: number;
}

export interface ProgressStatusItem {
  status: string;
  count: number;
}

export interface CourseProgressDistributionItem {
  courseId: string;
  courseName: string;
  inProgressCount: number;
}

export interface LevelBlockDistributionItem {
  courseLevelId: string;
  levelName: string;
  issueCount: number;
}

export interface CourseFilterItem {
  id: string;
  name: string;
}

export interface ProgressDashboardRow {
  id: string;
  enrollmentId: string;
  studentId: string;
  studentName: string;
  courseId: string;
  courseName: string;
  currentLevelName: string | null;
  status: string;
  finalGrade: string | null;
  earnedCredits: number;
  calculatedAt: Date | null;
  updatedAt: Date;
  isBlocked: boolean;
  isEligible: boolean;
}

export interface ListProgressParams {
  page?: number;
  pageSize?: number;
  search?: string;
  status?: string;
  courseId?: string;
  /**
   * Teacher scope. When set, rows are restricted to enrollments in class groups
   * this teacher teaches (enrollment.classGroup.teacherId). Always the
   * server-resolved teacherId — a query param can never widen it.
   */
  teacherId?: string;
}

// ─── KPIs ─────────────────────────────────────────────────────────────────────

export async function getProgressKPIs(organizationId: string): Promise<ProgressKPIs> {
  const db = await getDb();

  const [courseStatusGroups, blockedCount, eligibleCount, subjectFailedCount] = await Promise.all([
    db.studentCourseProgress.groupBy({
      by: ["status"],
      where: { organizationId },
      _count: { _all: true },
    }),
    db.studentLevelProgress.count({
      where: { organizationId, status: "BLOCKED" },
    }),
    db.studentLevelProgress.count({
      where: { organizationId, status: "ELIGIBLE_TO_PROGRESS" },
    }),
    db.studentSubjectProgress.count({
      where: { organizationId, status: "FAILED" },
    }),
  ]);

  const byStatus = Object.fromEntries(courseStatusGroups.map((g) => [g.status, g._count._all]));

  const passedCount = (byStatus["PASSED"] ?? 0) + (byStatus["COMPLETED"] ?? 0);
  const failedCount = byStatus["FAILED"] ?? 0;
  const recoveryCount = byStatus["RECOVERY_REQUIRED"] ?? 0;
  // Approval rate: (PASSED + COMPLETED) / (PASSED + COMPLETED + FAILED)
  // Excludes IN_PROGRESS, RECOVERY_REQUIRED, BLOCKED, NOT_STARTED — only final outcomes
  const denominator = passedCount + failedCount;

  return {
    inProgressCount: byStatus["IN_PROGRESS"] ?? 0,
    completedCount: passedCount,
    failedCount,
    recoveryRequiredCount: recoveryCount,
    blockedCount,
    eligibleCount,
    subjectFailedCount,
    passRate: denominator > 0 ? Math.round((passedCount / denominator) * 100) : 0,
  };
}

// ─── Trend (last 6 months) ─────────────────────────────────────────────────────
// Series 1: Iniciados     — StudentCourseProgress created in that month
// Series 2: Concluídos    — PASSED/COMPLETED by completedAt in that month
// Series 3: Em Recuperação — RECOVERY_REQUIRED by updatedAt (not mixed with FAILED)
// Series 4: Reprovados    — FAILED by updatedAt (distinct from recovery)

export async function getProgressTrend(organizationId: string): Promise<ProgressTrendItem[]> {
  const db = await getDb();

  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5);
  sixMonthsAgo.setDate(1);
  sixMonthsAgo.setHours(0, 0, 0, 0);

  const [startedRows, completedRows, recoveryRows, failedRows] = await Promise.all([
    db.studentCourseProgress.findMany({
      where: { organizationId, createdAt: { gte: sixMonthsAgo } },
      select: { createdAt: true },
    }),
    db.studentCourseProgress.findMany({
      where: {
        organizationId,
        status: { in: ["PASSED", "COMPLETED"] },
        completedAt: { gte: sixMonthsAgo, not: null },
      },
      select: { completedAt: true },
    }),
    db.studentCourseProgress.findMany({
      where: {
        organizationId,
        status: "RECOVERY_REQUIRED",
        updatedAt: { gte: sixMonthsAgo },
      },
      select: { updatedAt: true },
    }),
    db.studentCourseProgress.findMany({
      where: {
        organizationId,
        status: "FAILED",
        updatedAt: { gte: sixMonthsAgo },
      },
      select: { updatedAt: true },
    }),
  ]);

  const now = new Date();
  return Array.from({ length: 6 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
    const year = d.getFullYear();
    const month = d.getMonth();

    const inMonth = (dt: Date | null) => {
      if (!dt) return false;
      const x = new Date(dt);
      return x.getFullYear() === year && x.getMonth() === month;
    };

    return {
      month: PT_MONTHS[month],
      started: startedRows.filter((r) => inMonth(r.createdAt)).length,
      completed: completedRows.filter((r) => inMonth(r.completedAt)).length,
      recovery: recoveryRows.filter((r) => inMonth(r.updatedAt)).length,
      failed: failedRows.filter((r) => inMonth(r.updatedAt)).length,
    };
  });
}

// ─── Status distribution (for donut) ──────────────────────────────────────────

export async function getProgressStatusDistribution(
  organizationId: string
): Promise<ProgressStatusItem[]> {
  const db = await getDb();
  const groups = await db.studentCourseProgress.groupBy({
    by: ["status"],
    where: { organizationId },
    _count: { _all: true },
  });
  return groups
    .filter((g) => g._count._all > 0)
    .map((g) => ({ status: g.status, count: g._count._all }));
}

// ─── Course distribution: top courses by IN_PROGRESS student count ────────────

export async function getCourseProgressDistribution(
  organizationId: string
): Promise<CourseProgressDistributionItem[]> {
  const db = await getDb();

  const rows = await db.studentCourseProgress.groupBy({
    by: ["courseId"],
    where: { organizationId, status: "IN_PROGRESS" },
    _count: { _all: true },
  });

  if (rows.length === 0) return [];

  const courseIds = rows.map((r) => r.courseId);
  const courses = await db.course.findMany({
    where: { id: { in: courseIds } },
    select: { id: true, name: true },
  });

  const nameMap = new Map(courses.map((c) => [c.id, c.name]));

  return rows
    .map((r) => ({
      courseId: r.courseId,
      courseName: nameMap.get(r.courseId) ?? "Desconhecido",
      inProgressCount: r._count._all,
    }))
    .sort((a, b) => b.inProgressCount - a.inProgressCount)
    .slice(0, 8);
}

// ─── Level block distribution: top levels by BLOCKED + FAILED count ───────────

export async function getLevelBlockDistribution(
  organizationId: string
): Promise<LevelBlockDistributionItem[]> {
  const db = await getDb();

  const rows = await db.studentLevelProgress.groupBy({
    by: ["courseLevelId"],
    where: { organizationId, status: { in: ["BLOCKED", "FAILED"] } },
    _count: { _all: true },
  });

  if (rows.length === 0) return [];

  const levelIds = rows.map((r) => r.courseLevelId);
  const levels = await db.courseLevel.findMany({
    where: { id: { in: levelIds } },
    select: { id: true, name: true },
  });

  const nameMap = new Map(levels.map((l) => [l.id, l.name]));

  return rows
    .map((r) => ({
      courseLevelId: r.courseLevelId,
      levelName: nameMap.get(r.courseLevelId) ?? "Desconhecido",
      issueCount: r._count._all,
    }))
    .sort((a, b) => b.issueCount - a.issueCount)
    .slice(0, 8);
}

// ─── Active courses list for filter dropdown ──────────────────────────────────

export async function getActiveCoursesForFilter(organizationId: string): Promise<CourseFilterItem[]> {
  const db = await getDb();
  return db.course.findMany({
    where: { organizationId, deletedAt: null, status: "ACTIVE" },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
    take: 100,
  });
}

/** Courses present in this teacher's class groups only — scopes the filter dropdown. */
export async function getTeacherCoursesForFilter(
  organizationId: string,
  teacherId: string
): Promise<CourseFilterItem[]> {
  const db = await getDb();
  const rows = await db.studentCourseProgress.findMany({
    where: { organizationId, enrollment: { classGroup: { teacherId } } },
    select: { courseId: true },
    distinct: ["courseId"],
  });
  const courseIds = rows.map((r) => r.courseId);
  if (courseIds.length === 0) return [];
  return db.course.findMany({
    where: { id: { in: courseIds }, organizationId },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
}

// ─── Teacher-scoped KPIs ──────────────────────────────────────────────────────
// Powers the "Progresso dos Meus Alunos" workspace. Two-tier ownership:
//   • Student/course-level KPIs (in-progress, blocked, recovery) are scoped to
//     students in class groups this teacher teaches (enrollment.classGroup.teacherId).
//   • Subject-level KPIs (passed/failed/low-attendance/not-assessed) require BOTH
//     the class-group bound AND subject ownership (levelSubject.subjectId ∈ owned)
//     — "meus alunos, nas minhas disciplinas".
// FAIL-CLOSED: when the teacher has no owned subjects, every subject-level KPI is
// 0 and no StudentSubjectProgress query runs — never a class-group-wide fallback.
// teacherId + ownedSubjectIds are always server-resolved (never a client param).
// No org-wide aggregation, no finance. See docs/teacher-access-scope.md.

const LOW_ATTENDANCE_THRESHOLD = 75;
/** Safety cap on distinct-studentId KPI queries — bounded defense-in-depth. */
const SUBJECT_QUERY_LIMIT = 500;

export interface TeacherProgressKPIs {
  inProgressCount: number;        // StudentCourseProgress IN_PROGRESS (students in my class groups)
  subjectPassedCount: number;     // StudentSubjectProgress PASSED in my subjects
  subjectFailedCount: number;     // StudentSubjectProgress FAILED in my subjects
  recoveryCount: number;          // StudentCourseProgress RECOVERY_REQUIRED (course-level)
  blockedCount: number;           // StudentLevelProgress BLOCKED (students in my class groups)
  lowAttendanceCount: number;     // distinct students with attendance < 75% in my subjects
  noAssessmentCount: number;      // distinct students not yet assessed in my subjects
  interventionCount: number;      // distinct at-risk students (blocked / failed-subject / low attendance)
}

/**
 * Subject-ownership scope for StudentSubjectProgress queries — "meus alunos, nas
 * minhas disciplinas": requires BOTH the class-group bound
 * (`enrollment.classGroup.teacherId = me`) AND subject ownership
 * (`levelSubject.subjectId ∈ ownedSubjectIds`). Returns `null` (fail-closed) when
 * the teacher has no owned subjects — callers then report 0 and run no query.
 */
function subjectProgressScope(
  organizationId: string,
  teacherId: string,
  ownedSubjectIds: string[]
): Record<string, unknown> | null {
  if (ownedSubjectIds.length === 0) return null;
  return {
    organizationId,
    enrollment: { classGroup: { teacherId } },
    levelSubject: { subjectId: { in: ownedSubjectIds } },
  };
}

export async function getTeacherProgressKPIs(
  organizationId: string,
  teacherId: string,
  ownedSubjectIds: string[]
): Promise<TeacherProgressKPIs> {
  const db = await getDb();

  // Student/course-level signals → scoped to students in my class groups.
  const inGroups = { enrollment: { classGroup: { teacherId } } };
  // Subject-level signals → my class group AND my subject. null = fail closed.
  const subjectScope = subjectProgressScope(organizationId, teacherId, ownedSubjectIds);

  // Student/course-level KPIs always run (they don't depend on subject ownership).
  const [courseStatusGroups, blocked] = await Promise.all([
    db.studentCourseProgress.groupBy({
      by: ["status"],
      where: { organizationId, ...inGroups },
      _count: { _all: true },
    }),
    db.studentLevelProgress.findMany({
      where: { organizationId, status: "BLOCKED", ...inGroups },
      select: { studentId: true },
      distinct: ["studentId"],
      take: SUBJECT_QUERY_LIMIT,
    }),
  ]);

  // Subject-level KPIs only run when subject ownership is proven; else 0.
  let bySubject: Record<string, number> = {};
  let failedSubjectStudents: { studentId: string }[] = [];
  let lowAttendanceStudents: { studentId: string }[] = [];
  let notAssessedStudents: { studentId: string }[] = [];

  if (subjectScope) {
    [bySubject, failedSubjectStudents, lowAttendanceStudents, notAssessedStudents] = await Promise.all([
      db.studentSubjectProgress
        .groupBy({ by: ["status"], where: subjectScope, _count: { _all: true } })
        .then((groups) => Object.fromEntries(groups.map((g) => [g.status, g._count._all]))),
      db.studentSubjectProgress.findMany({
        where: { ...subjectScope, status: "FAILED" },
        select: { studentId: true },
        distinct: ["studentId"],
        take: SUBJECT_QUERY_LIMIT,
      }),
      db.studentSubjectProgress.findMany({
        where: { ...subjectScope, attendancePercentage: { not: null, lt: LOW_ATTENDANCE_THRESHOLD } },
        select: { studentId: true },
        distinct: ["studentId"],
        take: SUBJECT_QUERY_LIMIT,
      }),
      db.studentSubjectProgress.findMany({
        where: { ...subjectScope, status: "NOT_STARTED" },
        select: { studentId: true },
        distinct: ["studentId"],
        take: SUBJECT_QUERY_LIMIT,
      }),
    ]);
  }

  const byCourse = Object.fromEntries(courseStatusGroups.map((g) => [g.status, g._count._all]));

  // "Elegíveis para Intervenção" — distinct students flagged by any at-risk signal.
  const interventionStudents = new Set<string>([
    ...blocked.map((r) => r.studentId),
    ...failedSubjectStudents.map((r) => r.studentId),
    ...lowAttendanceStudents.map((r) => r.studentId),
  ]);

  return {
    inProgressCount: byCourse["IN_PROGRESS"] ?? 0,
    subjectPassedCount: bySubject["PASSED"] ?? 0,
    subjectFailedCount: bySubject["FAILED"] ?? 0,
    recoveryCount: byCourse["RECOVERY_REQUIRED"] ?? 0,
    blockedCount: blocked.length,
    lowAttendanceCount: lowAttendanceStudents.length,
    noAssessmentCount: notAssessedStudents.length,
    interventionCount: interventionStudents.size,
  };
}

// ─── Paginated dashboard rows — N+1 free ─────────────────────────────────────

export async function listProgressForDashboard(
  organizationId: string,
  params: ListProgressParams
): Promise<PaginatedResult<ProgressDashboardRow>> {
  const db = await getDb();
  const page = params.page ?? 1;
  const pageSize = params.pageSize ?? 20;
  const { skip, take } = buildSkipTake({ page, pageSize });

  let studentIdFilter: string[] | undefined;
  if (params.search?.trim()) {
    const matches = await db.student.findMany({
      where: {
        organizationId,
        deletedAt: null,
        OR: [
          { firstName: { contains: params.search.trim() } },
          { lastName: { contains: params.search.trim() } },
        ],
      },
      select: { id: true },
    });
    studentIdFilter = matches.map((s) => s.id);
    if (studentIdFilter.length === 0) {
      return {
        data: [],
        total: 0,
        page,
        pageSize,
        totalPages: 0,
        hasNextPage: false,
        hasPreviousPage: false,
      };
    }
  }

  const where = {
    organizationId,
    ...(params.status && { status: params.status }),
    ...(params.courseId && { courseId: params.courseId }),
    ...(studentIdFilter && { studentId: { in: studentIdFilter } }),
    ...(params.teacherId && { enrollment: { classGroup: { teacherId: params.teacherId } } }),
  };

  const [total, rows] = await Promise.all([
    db.studentCourseProgress.count({ where }),
    db.studentCourseProgress.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      skip,
      take,
    }),
  ]);

  if (rows.length === 0) {
    return buildPaginationMeta([], total, { page, pageSize });
  }

  const studentIds = [...new Set(rows.map((r) => r.studentId))];
  const courseIds = [...new Set(rows.map((r) => r.courseId))];
  const enrollmentIds = rows.map((r) => r.enrollmentId);

  const [students, courses, enrollments, levelFlags] = await Promise.all([
    db.student.findMany({
      where: { id: { in: studentIds }, organizationId, deletedAt: null },
      select: { id: true, firstName: true, lastName: true },
    }),
    db.course.findMany({
      where: { id: { in: courseIds } },
      select: { id: true, name: true },
    }),
    db.enrollment.findMany({
      where: { id: { in: enrollmentIds } },
      select: {
        id: true,
        currentLevel: { select: { name: true } },
      },
    }),
    db.studentLevelProgress.findMany({
      where: {
        enrollmentId: { in: enrollmentIds },
        status: { in: ["BLOCKED", "ELIGIBLE_TO_PROGRESS"] },
      },
      select: { enrollmentId: true, status: true },
    }),
  ]);

  const studentMap = new Map(students.map((s) => [s.id, `${s.firstName} ${s.lastName}`]));
  const courseMap = new Map(courses.map((c) => [c.id, c.name]));
  const enrollmentMap = new Map(
    enrollments.map((e) => [e.id, e.currentLevel?.name ?? null])
  );
  const blockedSet = new Set(
    levelFlags.filter((f) => f.status === "BLOCKED").map((f) => f.enrollmentId)
  );
  const eligibleSet = new Set(
    levelFlags.filter((f) => f.status === "ELIGIBLE_TO_PROGRESS").map((f) => f.enrollmentId)
  );

  return buildPaginationMeta(
    rows.map((r) => ({
      id: r.id,
      enrollmentId: r.enrollmentId,
      studentId: r.studentId,
      studentName: studentMap.get(r.studentId) ?? "—",
      courseId: r.courseId,
      courseName: courseMap.get(r.courseId) ?? "—",
      currentLevelName: enrollmentMap.get(r.enrollmentId) ?? null,
      status: r.status,
      finalGrade: r.finalGrade ? r.finalGrade.toString() : null,
      earnedCredits: r.earnedCredits ?? 0,
      calculatedAt: r.calculatedAt,
      updatedAt: r.updatedAt,
      isBlocked: blockedSet.has(r.enrollmentId),
      isEligible: eligibleSet.has(r.enrollmentId),
    })),
    total,
    { page, pageSize }
  );
}
