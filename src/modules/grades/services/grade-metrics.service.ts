import { getDb } from "@/server/db";
import type { PaginatedResult } from "@/shared/types/common";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface GradeKPIs {
  totalResults: number;
  gradedCount: number;
  draftCount: number;
  submittedCount: number;
  avgNormalizedGrade: number | null;
  approvalRate: number;
  passedSubjectCount: number;
  failedSubjectCount: number;
  inProgressSubjectCount: number;
}

export interface MonthlyGradeTrend {
  month: string;
  avgGrade: number;
  count: number;
}

export interface GradeStatusItem {
  status: string;
  count: number;
}

export interface CoursePerformance {
  courseName: string;
  avgGrade: number;
  count: number;
}

export interface RiskSubject {
  subjectName: string;
  failureCount: number;
  totalCount: number;
  failureRate: number;
}

export interface GradeRow {
  id: string;
  grade: number;
  maxGrade: number;
  normalizedGrade: number;
  status: string;
  gradedAt: Date | null;
  student: { firstName: string | null; lastName: string | null; code: string | null };
  subject: { name: string };
  assessmentComponent: { name: string; componentType: string };
  enrollment: { enrollmentNumber: string | null };
}

// ─── KPIs ─────────────────────────────────────────────────────────────────────

export async function getGradeKPIs(organizationId: string): Promise<GradeKPIs> {
  const db = await getDb();

  const [statusGroups, gradeAvg, subjectStatusGroups] = await Promise.all([
    db.studentAssessmentResult.groupBy({
      by: ["status"],
      where: { organizationId },
      _count: { _all: true },
    }),
    db.studentAssessmentResult.aggregate({
      where: { organizationId, status: "GRADED" },
      _avg: { normalizedGrade: true },
    }),
    db.studentSubjectProgress.groupBy({
      by: ["status"],
      where: { organizationId },
      _count: { _all: true },
    }),
  ]);

  const byStatus = Object.fromEntries(statusGroups.map((g) => [g.status, g._count._all]));
  const bySubject = Object.fromEntries(subjectStatusGroups.map((g) => [g.status, g._count._all]));

  const passedSubjectCount = bySubject["PASSED"] ?? 0;
  const failedSubjectCount = bySubject["FAILED"] ?? 0;
  const inProgressSubjectCount = bySubject["IN_PROGRESS"] ?? 0;
  const totalSubjects = Object.values(bySubject).reduce((a, b) => a + b, 0);

  return {
    totalResults: Object.values(byStatus).reduce((a, b) => a + b, 0),
    gradedCount: byStatus["GRADED"] ?? 0,
    draftCount: byStatus["DRAFT"] ?? 0,
    submittedCount: byStatus["SUBMITTED"] ?? 0,
    avgNormalizedGrade: gradeAvg._avg.normalizedGrade != null ? Math.round(Number(gradeAvg._avg.normalizedGrade) * 10) / 10 : null,
    approvalRate: totalSubjects > 0 ? Math.round((passedSubjectCount / totalSubjects) * 100) : 0,
    passedSubjectCount,
    failedSubjectCount,
    inProgressSubjectCount,
  };
}

// ─── Academic trend (last 6 months) ──────────────────────────────────────────

const PT_MONTHS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

export async function getAcademicTrend(organizationId: string): Promise<MonthlyGradeTrend[]> {
  const db = await getDb();

  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5);
  sixMonthsAgo.setDate(1);
  sixMonthsAgo.setHours(0, 0, 0, 0);

  const rows = await db.studentAssessmentResult.findMany({
    where: { organizationId, status: "GRADED", gradedAt: { gte: sixMonthsAgo } },
    select: { normalizedGrade: true, gradedAt: true },
  });

  const now = new Date();
  const months: MonthlyGradeTrend[] = [];

  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const year = d.getFullYear();
    const month = d.getMonth();

    const bucket = rows.filter((r) => {
      if (!r.gradedAt) return false;
      const dt = new Date(r.gradedAt);
      return dt.getFullYear() === year && dt.getMonth() === month;
    });

    const sum = bucket.reduce((acc, r) => acc + Number(r.normalizedGrade), 0);
    months.push({
      month: PT_MONTHS[month],
      avgGrade: bucket.length > 0 ? Math.round((sum / bucket.length) * 10) / 10 : 0,
      count: bucket.length,
    });
  }

  return months;
}

// ─── Status distribution ──────────────────────────────────────────────────────

export async function getGradeStatusDistribution(organizationId: string): Promise<GradeStatusItem[]> {
  const db = await getDb();

  const groups = await db.studentSubjectProgress.groupBy({
    by: ["status"],
    where: { organizationId },
    _count: { _all: true },
  });

  return groups
    .filter((g) => g._count._all > 0)
    .map((g) => ({ status: g.status, count: g._count._all }));
}

// ─── Course performance ───────────────────────────────────────────────────────

export async function getCoursePerformance(organizationId: string): Promise<CoursePerformance[]> {
  const db = await getDb();

  const progress = await db.studentSubjectProgress.findMany({
    where: { organizationId, status: { in: ["PASSED", "FAILED"] }, finalGrade: { not: null } },
    select: {
      finalGrade: true,
      enrollment: {
        select: {
          courseLevel: {
            select: { course: { select: { name: true } } },
          },
        },
      },
    },
    take: 5000,
  });

  const map = new Map<string, { sum: number; count: number }>();
  for (const p of progress) {
    const name = p.enrollment?.courseLevel?.course?.name ?? "Sem Curso";
    const cur = map.get(name) ?? { sum: 0, count: 0 };
    cur.sum += Number(p.finalGrade);
    cur.count += 1;
    map.set(name, cur);
  }

  return Array.from(map.entries())
    .map(([courseName, { sum, count }]) => ({
      courseName,
      avgGrade: count > 0 ? Math.round((sum / count) * 10) / 10 : 0,
      count,
    }))
    .sort((a, b) => b.avgGrade - a.avgGrade)
    .slice(0, 8);
}

// ─── Top risk subjects ────────────────────────────────────────────────────────

export async function getTopRiskSubjects(organizationId: string): Promise<RiskSubject[]> {
  const db = await getDb();

  const progress = await db.studentSubjectProgress.findMany({
    where: { organizationId, status: { in: ["PASSED", "FAILED"] } },
    select: {
      status: true,
      levelSubject: {
        select: { subject: { select: { name: true } } },
      },
    },
    take: 10000,
  });

  const map = new Map<string, { failed: number; total: number }>();
  for (const p of progress) {
    const name = p.levelSubject?.subject?.name ?? "Sem Disciplina";
    const cur = map.get(name) ?? { failed: 0, total: 0 };
    cur.total += 1;
    if (p.status === "FAILED") cur.failed += 1;
    map.set(name, cur);
  }

  return Array.from(map.entries())
    .map(([subjectName, { failed, total }]) => ({
      subjectName,
      failureCount: failed,
      totalCount: total,
      failureRate: total > 0 ? Math.round((failed / total) * 100) : 0,
    }))
    .filter((s) => s.failureCount > 0)
    .sort((a, b) => b.failureRate - a.failureRate)
    .slice(0, 8);
}

// ─── Teacher-scoped KPIs ──────────────────────────────────────────────────────
// Powers the "Minhas Notas" workspace. Two-tier ownership: grade results are
// scoped by SUBJECT ownership (authored event OR my-subject-in-my-class-group;
// see teacherGradeScopeAnd), and the "Alunos em Risco" KPI counts MY students
// (class group I teach) failing one of MY subjects. teacherId + ownedSubjectIds
// are always server-resolved (never a client param). Fail-closed when the
// teacher has no subject signal. No org-wide aggregation, no finance, no other
// teachers' data. See docs/teacher-access-scope.md.

/** Safety cap on distinct-studentId KPI queries — bounded defense-in-depth. */
const SUBJECT_QUERY_LIMIT = 500;

export interface TeacherGradeKPIs {
  /** DRAFT + SUBMITTED results awaiting grading. */
  toGradeCount: number;
  /** GRADED results. */
  gradedCount: number;
  /** Average normalized grade across this teacher's GRADED results, or null. */
  avgNormalizedGrade: number | null;
  /**
   * Distinct students with a FAILED progress in one of the teacher's subjects.
   *
   * @deprecated F-M8: LEGACY risk computation (flat FAILED-subject count), NOT the canonical
   * StudentRiskProjection. It was never wired to the projection or the coverage gate, so it is
   * intentionally left as-is by F-M8 (which only removed the hybrid fallbacks). Follow-up: move
   * the teacher grades KPI to a teacher-scoped projection read (academic dimension, bounded to
   * the teacher's students) so it matches Student 360 — see docs/student-360-backlog.md (F-M8
   * follow-ups). Do NOT add new consumers of this field.
   */
  atRiskStudentCount: number;
}

export async function getTeacherGradeKPIs(
  organizationId: string,
  teacherId: string,
  ownedSubjectIds: string[]
): Promise<TeacherGradeKPIs> {
  const db = await getDb();

  // Same subject-ownership predicate as the list — never just classGroup.
  const resultScope = { organizationId, AND: teacherGradeScopeAnd(teacherId, ownedSubjectIds) };

  // "Alunos em Risco" = MY students (class group I teach) failing one of MY
  // subjects — both bounds required. Fail closed: no owned subjects → 0.
  const atRiskScope =
    ownedSubjectIds.length > 0
      ? {
          organizationId,
          status: "FAILED",
          enrollment: { classGroup: { teacherId } },
          levelSubject: { subjectId: { in: ownedSubjectIds } },
        }
      : null;

  const [statusGroups, gradeAvg, atRiskStudents] = await Promise.all([
    db.studentAssessmentResult.groupBy({
      by: ["status"],
      where: { ...resultScope, status: { not: "CANCELLED" } },
      _count: { _all: true },
    }),
    db.studentAssessmentResult.aggregate({
      where: { ...resultScope, status: "GRADED" },
      _avg: { normalizedGrade: true },
    }),
    atRiskScope
      ? db.studentSubjectProgress.findMany({
          where: atRiskScope,
          select: { studentId: true },
          distinct: ["studentId"],
          take: SUBJECT_QUERY_LIMIT,
        })
      : Promise.resolve([]),
  ]);

  const byStatus = Object.fromEntries(statusGroups.map((g) => [g.status, g._count._all]));

  return {
    toGradeCount: (byStatus["DRAFT"] ?? 0) + (byStatus["SUBMITTED"] ?? 0),
    gradedCount: byStatus["GRADED"] ?? 0,
    avgNormalizedGrade:
      gradeAvg._avg.normalizedGrade != null
        ? Math.round(Number(gradeAvg._avg.normalizedGrade) * 10) / 10
        : null,
    atRiskStudentCount: atRiskStudents.length,
  };
}

// ─── Paginated grade results (for table) ─────────────────────────────────────

/**
 * Builds the teacher subject-ownership AND-clause for grade-result queries.
 * A teacher owns a result when EITHER:
 *   • (A) they authored the assessment event — `assessmentEvent.teacherId = me`
 *         (visible even in another teacher's class group), OR
 *   • (B) it is for one of their own subjects in a class group they teach —
 *         `enrollment.classGroup.teacherId = me` AND `subjectId ∈ ownedSubjectIds`.
 *
 * Branch B stops a homeroom teacher from seeing a co-teacher's subject grades in
 * a shared class group, AND keeps a teacher from counting their subject in an
 * unrelated class group (the class-group bound is required, not optional).
 *
 * FAIL-CLOSED: when `ownedSubjectIds` is empty (no subject-ownership signal at
 * all) branch B is disabled entirely — only authored events (A) are visible.
 * There is NO fallback to bare class-group access, because without a subject
 * signal the system cannot prove academic ownership. See docs/teacher-access-scope.md.
 *
 * `teacherId` is always the server-resolved value, so a query param ANDed on top
 * can only narrow, never widen.
 */
function teacherGradeScopeAnd(
  teacherId: string,
  ownedSubjectIds: string[]
): Record<string, unknown>[] {
  const eventBranch = { assessmentEvent: { teacherId } };

  if (ownedSubjectIds.length === 0) {
    // Fail closed — authored events only, never bare class-group access.
    return [{ OR: [eventBranch] }];
  }

  // Branch B: my class group AND my subject (both required).
  const classGroupAndSubject = {
    enrollment: { classGroup: { teacherId } },
    subjectId: { in: ownedSubjectIds },
  };
  return [{ OR: [eventBranch, classGroupAndSubject] }];
}

interface ListGradeResultsParams {
  page: number;
  pageSize: number;
  subjectId?: string;
  classGroupId?: string;
  status?: string;
  search?: string;
  /**
   * Teacher scope — ALWAYS the server-resolved teacherId (from currentUser.id),
   * never a client value. Applies the subject-ownership predicate (see
   * teacherGradeScopeAnd). Query-param filters below are ANDed on top, so they
   * can only narrow, never widen.
   */
  teacherId?: string;
  /** Subjects the teacher owns — from getTeacherOwnedSubjectIds. */
  ownedSubjectIds?: string[];
}

export async function listGradeResults(
  organizationId: string,
  params: ListGradeResultsParams
): Promise<PaginatedResult<GradeRow>> {
  const db = await getDb();

  const where: Record<string, unknown> = {
    organizationId,
    status: { not: "CANCELLED" },
  };

  if (params.subjectId) where.subjectId = params.subjectId;
  if (params.status) where.status = params.status;
  if (params.classGroupId) where.enrollment = { classGroupId: params.classGroupId };
  if (params.teacherId) where.AND = teacherGradeScopeAnd(params.teacherId, params.ownedSubjectIds ?? []);

  if (params.search) {
    where.student = {
      OR: [
        { firstName: { contains: params.search } },
        { lastName: { contains: params.search } },
        { code: { contains: params.search } },
      ],
    };
  }

  const skip = (params.page - 1) * params.pageSize;

  const [rows, total] = await Promise.all([
    db.studentAssessmentResult.findMany({
      where,
      skip,
      take: params.pageSize,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        grade: true,
        maxGrade: true,
        normalizedGrade: true,
        status: true,
        gradedAt: true,
        student: { select: { firstName: true, lastName: true, code: true } },
        subject: { select: { name: true } },
        assessmentComponent: { select: { name: true, componentType: true } },
        enrollment: { select: { enrollmentNumber: true } },
      },
    }),
    db.studentAssessmentResult.count({ where }),
  ]);

  const totalPages = Math.ceil(total / params.pageSize);

  return {
    data: rows.map((r): GradeRow => ({
      id: r.id,
      grade: Number(r.grade),
      maxGrade: Number(r.maxGrade),
      normalizedGrade: Number(r.normalizedGrade),
      status: r.status,
      gradedAt: r.gradedAt,
      student: {
        firstName: r.student.firstName ?? null,
        lastName: r.student.lastName ?? null,
        code: r.student.code,
      },
      subject: { name: r.subject.name },
      assessmentComponent: {
        name: r.assessmentComponent.name,
        componentType: r.assessmentComponent.componentType,
      },
      enrollment: { enrollmentNumber: r.enrollment.enrollmentNumber },
    })),
    total,
    page: params.page,
    pageSize: params.pageSize,
    totalPages,
    hasNextPage: params.page < totalPages,
    hasPreviousPage: params.page > 1,
  };
}
