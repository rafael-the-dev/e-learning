import { getDb } from "@/server/db";
import { findCoursesByOrganization } from "@/modules/courses/repositories/course.repository";
import type { PaginatedResult } from "@/shared/types/common";
import type { ListCoursesParams } from "@/modules/courses/repositories/course.repository";

const PT_MONTHS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CourseKPIs {
  totalCourses: number;
  activeCount: number;
  draftCount: number;
  // ACTIVE courses with 0 CourseLevel records
  noLevelsCount: number;
  // ACTIVE courses where no level has any active LevelSubject
  // Uses course.levelSubjects relation filtered by status = ACTIVE (relation confirmed in schema)
  noSubjectsCount: number;
  // ACTIVE courses with 0 classGroups where status = ACTIVE
  noClassGroupCount: number;
  // Total ACTIVE Enrollment records linked to ACTIVE courses
  activeEnrollmentsCount: number;
  // Fully operational: ACTIVE + has levels with active subjects + has active class groups
  operationalCount: number;
  // For action bar: ACTIVE courses with ≥1 ACTIVE class group but 0 ACTIVE enrollments
  noEnrollmentsCount: number;
  // For action bar: DRAFT courses created more than 30 days ago
  staleDraftCount: number;
}

export interface CourseTrendItem {
  month: string;
  // Courses created in that calendar month
  registered: number;
  // ACTIVE enrollments created in that calendar month
  activeEnrollments: number;
  // ACTIVE class groups created in that calendar month
  activeClassGroups: number;
}

export interface CourseStatusItem {
  status: string;
  count: number;
}

export interface CategoryDistributionItem {
  categoryId: string;
  categoryName: string;
  courseCount: number;
}

export interface LevelDistributionItem {
  courseName: string;
  levelCount: number;
}

export interface EnrollmentDistributionItem {
  courseName: string;
  enrollmentCount: number;
}

export interface CourseDashboardRow {
  id: string;
  name: string;
  code: string | null;
  categoryName: string | null;
  status: string;
  levelCount: number;
  // Count of active LevelSubjects (via course.levelSubjects filtered by status = ACTIVE)
  subjectCount: number;
  activeClassGroupCount: number;
  // Count of ACTIVE Enrollment records for this course
  activeEnrollmentCount: number;
  price: string | null;
  totalHours: number | null;
  createdAt: Date;
}

// ─── KPIs ─────────────────────────────────────────────────────────────────────

export async function getCourseKPIs(organizationId: string): Promise<CourseKPIs> {
  const db = await getDb();
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const [
    statusGroups,
    noLevels,
    noSubjects,
    noClassGroup,
    activeEnrollments,
    operational,
    noEnrollments,
    staleDraft,
  ] = await Promise.all([
    db.course.groupBy({
      by: ["status"],
      where: { organizationId, deletedAt: null },
      _count: { _all: true },
    }),
    // ACTIVE courses with 0 levels
    db.course.count({
      where: {
        organizationId,
        deletedAt: null,
        status: "ACTIVE",
        levels: { none: {} },
      },
    }),
    // ACTIVE courses where no levelSubject is ACTIVE
    // course.levelSubjects is a confirmed direct relation in schema
    db.course.count({
      where: {
        organizationId,
        deletedAt: null,
        status: "ACTIVE",
        levelSubjects: { none: { status: "ACTIVE", deletedAt: null } },
      },
    }),
    // ACTIVE courses with 0 strictly ACTIVE class groups
    db.course.count({
      where: {
        organizationId,
        deletedAt: null,
        status: "ACTIVE",
        classGroups: { none: { status: "ACTIVE", deletedAt: null } },
      },
    }),
    // Total ACTIVE enrollment records linked to ACTIVE courses
    db.enrollment.count({
      where: {
        organizationId,
        deletedAt: null,
        status: "ACTIVE",
        course: { status: "ACTIVE", deletedAt: null },
      },
    }),
    // Operational = ACTIVE + has levels with active subjects + has active class groups
    db.course.count({
      where: {
        organizationId,
        deletedAt: null,
        status: "ACTIVE",
        levelSubjects: { some: { status: "ACTIVE", deletedAt: null } },
        classGroups: { some: { status: "ACTIVE", deletedAt: null } },
      },
    }),
    // ACTIVE courses running (has class groups) but nobody enrolled
    db.course.count({
      where: {
        organizationId,
        deletedAt: null,
        status: "ACTIVE",
        classGroups: { some: { status: "ACTIVE", deletedAt: null } },
        enrollments: { none: { status: "ACTIVE", deletedAt: null } },
      },
    }),
    // DRAFT courses created more than 30 days ago
    db.course.count({
      where: {
        organizationId,
        deletedAt: null,
        status: "DRAFT",
        createdAt: { lt: thirtyDaysAgo },
      },
    }),
  ]);

  const byStatus = Object.fromEntries(statusGroups.map((g) => [g.status, g._count._all]));

  return {
    totalCourses: Object.values(byStatus).reduce((a, b) => a + b, 0),
    activeCount: byStatus["ACTIVE"] ?? 0,
    draftCount: byStatus["DRAFT"] ?? 0,
    noLevelsCount: noLevels,
    noSubjectsCount: noSubjects,
    noClassGroupCount: noClassGroup,
    activeEnrollmentsCount: activeEnrollments,
    operationalCount: operational,
    noEnrollmentsCount: noEnrollments,
    staleDraftCount: staleDraft,
  };
}

// ─── Multi-series trend (last 6 months) ───────────────────────────────────────
// All series use actual creation dates — no approximations:
// Series 1: Registered  — courses created in that calendar month
// Series 2: Active Enrollments — ACTIVE enrollments created in that month
// Series 3: Active Class Groups — ACTIVE class groups created in that month

export async function getCourseTrend(organizationId: string): Promise<CourseTrendItem[]> {
  const db = await getDb();

  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5);
  sixMonthsAgo.setDate(1);
  sixMonthsAgo.setHours(0, 0, 0, 0);

  const [registeredRows, enrollmentRows, classGroupRows] = await Promise.all([
    db.course.findMany({
      where: { organizationId, deletedAt: null, createdAt: { gte: sixMonthsAgo } },
      select: { createdAt: true },
    }),
    // ACTIVE enrollments created in the period (current status = ACTIVE)
    db.enrollment.findMany({
      where: {
        organizationId,
        deletedAt: null,
        status: "ACTIVE",
        createdAt: { gte: sixMonthsAgo },
      },
      select: { createdAt: true },
    }),
    // ACTIVE class groups created in the period (current status = ACTIVE)
    db.classGroup.findMany({
      where: {
        organizationId,
        deletedAt: null,
        status: "ACTIVE",
        createdAt: { gte: sixMonthsAgo },
      },
      select: { createdAt: true },
    }),
  ]);

  const now = new Date();
  return Array.from({ length: 6 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
    const year = d.getFullYear();
    const month = d.getMonth();

    const inMonth = (dt: Date) => {
      const x = new Date(dt);
      return x.getFullYear() === year && x.getMonth() === month;
    };

    return {
      month: PT_MONTHS[month],
      registered: registeredRows.filter((r) => inMonth(r.createdAt)).length,
      activeEnrollments: enrollmentRows.filter((r) => inMonth(r.createdAt)).length,
      activeClassGroups: classGroupRows.filter((r) => inMonth(r.createdAt)).length,
    };
  });
}

// ─── Status distribution (for donut) ──────────────────────────────────────────

export async function getCourseStatusDistribution(
  organizationId: string
): Promise<CourseStatusItem[]> {
  const db = await getDb();
  const groups = await db.course.groupBy({
    by: ["status"],
    where: { organizationId, deletedAt: null },
    _count: { _all: true },
  });
  return groups
    .filter((g) => g._count._all > 0)
    .map((g) => ({ status: g.status, count: g._count._all }));
}

// ─── Category distribution: active courses per category ─────────────────────

export async function getCategoryDistribution(
  organizationId: string
): Promise<CategoryDistributionItem[]> {
  const db = await getDb();

  const rows = await db.course.groupBy({
    by: ["categoryId"],
    where: {
      organizationId,
      deletedAt: null,
      status: "ACTIVE",
      categoryId: { not: null },
    },
    _count: { _all: true },
  });

  if (rows.length === 0) return [];

  const categoryIds = rows.map((r) => r.categoryId!);
  const categories = await db.courseCategory.findMany({
    where: { id: { in: categoryIds } },
    select: { id: true, name: true },
  });

  const nameMap = new Map(categories.map((c) => [c.id, c.name]));

  return rows
    .map((r) => ({
      categoryId: r.categoryId!,
      categoryName: nameMap.get(r.categoryId!) ?? "Sem Categoria",
      courseCount: r._count._all,
    }))
    .sort((a, b) => b.courseCount - a.courseCount)
    .slice(0, 8);
}

// ─── Level distribution: top courses by level count ──────────────────────────

export async function getLevelDistribution(
  organizationId: string
): Promise<LevelDistributionItem[]> {
  const db = await getDb();

  const activeCourseIds = (
    await db.course.findMany({
      where: { organizationId, deletedAt: null, status: "ACTIVE" },
      select: { id: true },
    })
  ).map((c) => c.id);

  if (activeCourseIds.length === 0) return [];

  const rows = await db.courseLevel.groupBy({
    by: ["courseId"],
    where: { courseId: { in: activeCourseIds } },
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
      courseName: nameMap.get(r.courseId) ?? "Desconhecido",
      levelCount: r._count._all,
    }))
    .sort((a, b) => b.levelCount - a.levelCount)
    .slice(0, 8);
}

// ─── Enrollment distribution: top courses by active enrollment count ──────────

export async function getEnrollmentDistribution(
  organizationId: string
): Promise<EnrollmentDistributionItem[]> {
  const db = await getDb();

  const rows = await db.enrollment.groupBy({
    by: ["courseId"],
    where: {
      organizationId,
      deletedAt: null,
      status: "ACTIVE",
      course: { status: "ACTIVE", deletedAt: null },
    },
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
      courseName: nameMap.get(r.courseId) ?? "Desconhecido",
      enrollmentCount: r._count._all,
    }))
    .sort((a, b) => b.enrollmentCount - a.enrollmentCount)
    .slice(0, 8);
}

// ─── Paginated dashboard rows (enriched with counts) ─────────────────────────
// N+1 free: 4 parallel groupBy queries then Map-based join

export async function listCoursesForDashboard(
  organizationId: string,
  params: ListCoursesParams
): Promise<PaginatedResult<CourseDashboardRow>> {
  const result = await findCoursesByOrganization(organizationId, params);

  if (result.data.length === 0) {
    return {
      data: [],
      total: result.total,
      page: result.page,
      pageSize: result.pageSize,
      totalPages: result.totalPages,
      hasNextPage: result.hasNextPage,
      hasPreviousPage: result.hasPreviousPage,
    };
  }

  const db = await getDb();
  const ids = result.data.map((c) => c.id);

  const [levelCountsRaw, subjectCountsRaw, classGroupCountsRaw, enrollmentCountsRaw] =
    await Promise.all([
      db.courseLevel.groupBy({
        by: ["courseId"],
        where: { courseId: { in: ids } },
        _count: { _all: true },
      }),
      // Active LevelSubjects via course.levelSubjects (direct FK courseId on LevelSubject confirmed)
      db.levelSubject.groupBy({
        by: ["courseId"],
        where: { courseId: { in: ids }, status: "ACTIVE", deletedAt: null },
        _count: { _all: true },
      }),
      db.classGroup.groupBy({
        by: ["courseId"],
        where: { courseId: { in: ids }, status: "ACTIVE", deletedAt: null },
        _count: { _all: true },
      }),
      db.enrollment.groupBy({
        by: ["courseId"],
        where: { courseId: { in: ids }, status: "ACTIVE", deletedAt: null },
        _count: { _all: true },
      }),
    ]);

  const levelMap = new Map(levelCountsRaw.map((r) => [r.courseId, r._count._all]));
  const subjectMap = new Map(subjectCountsRaw.map((r) => [r.courseId, r._count._all]));
  const classGroupMap = new Map(classGroupCountsRaw.map((r) => [r.courseId!, r._count._all]));
  const enrollmentMap = new Map(enrollmentCountsRaw.map((r) => [r.courseId, r._count._all]));

  return {
    data: result.data.map((c) => ({
      id: c.id,
      name: c.name,
      code: c.code,
      categoryName: c.categoryName,
      status: c.status,
      levelCount: levelMap.get(c.id) ?? 0,
      subjectCount: subjectMap.get(c.id) ?? 0,
      activeClassGroupCount: classGroupMap.get(c.id) ?? 0,
      activeEnrollmentCount: enrollmentMap.get(c.id) ?? 0,
      price: c.price,
      totalHours: c.totalHours,
      createdAt: c.createdAt,
    })),
    total: result.total,
    page: result.page,
    pageSize: result.pageSize,
    totalPages: result.totalPages,
    hasNextPage: result.hasNextPage,
    hasPreviousPage: result.hasPreviousPage,
  };
}
