import { getDb } from "@/server/db";
import { findManyByOrganization } from "@/modules/teachers/repositories/teacher.repository";
import type { PaginatedResult } from "@/shared/types/common";
import type { ListTeachersParams } from "@/modules/teachers/repositories/teacher.repository";

const PT_MONTHS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TeacherKPIs {
  totalTeachers: number;
  activeCount: number;
  suspendedCount: number;
  // ACTIVE teachers with 0 teacherSubject records — cannot be assigned to any course
  noSubjectsCount: number;
  // ACTIVE teachers with 0 classGroups where status = ACTIVE (strictly)
  noClassGroupCount: number;
  // ACTIVE teachers with ≥1 OPEN assessment whose assessmentDate is in the past
  overdueAssessmentsCount: number;
  // ACTIVE teachers with ≥1 OPEN assessment containing PENDING or SUBMITTED results
  pendingGradingCount: number;
  // total ACTIVE class groups / ACTIVE teachers who have ≥1 ACTIVE class group
  avgWorkload: number;
}

export interface TeacherTrendItem {
  month: string;
  // Teachers created in that calendar month
  registered: number;
  // Currently ACTIVE teachers who were created on or before that month's end (approximation)
  active: number;
  // Distinct currently-active teachers who have ≥1 ACTIVE class group created by that month's end
  withActiveGroups: number;
}

export interface TeacherStatusItem {
  status: string;
  count: number;
}

export interface SubjectDistributionItem {
  subjectId: string;
  subjectName: string;
  teacherCount: number;
}

export interface WorkloadItem {
  teacherName: string;
  classGroupCount: number;
}

export interface BranchDistributionItem {
  branchName: string;
  teacherCount: number;
}

export interface TeacherDashboardRow {
  id: string;
  fullName: string;
  specialization: string | null;
  branchName: string | null;
  status: string;
  subjectCount: number;
  // classGroups where status = ACTIVE only
  activeClassGroupCount: number;
  openAssessmentCount: number;
  // OPEN assessments whose assessmentDate has passed
  overdueAssessmentCount: number;
  // OPEN assessments that have at least 1 PENDING/SUBMITTED result
  pendingGradingAssessmentCount: number;
  createdAt: Date;
}

// ─── KPIs ─────────────────────────────────────────────────────────────────────

export async function getTeacherKPIs(organizationId: string): Promise<TeacherKPIs> {
  const db = await getDb();
  const now = new Date();

  const [
    statusGroups,
    noSubjects,
    noClassGroup,
    overdueAssessments,
    pendingGrading,
    teachersWithGroups,
    totalActiveGroups,
  ] = await Promise.all([
    db.teacher.groupBy({
      by: ["status"],
      where: { organizationId, deletedAt: null },
      _count: { _all: true },
    }),
    // ACTIVE teachers with no subject assignments (operationally blocked)
    db.teacher.count({
      where: {
        organizationId,
        deletedAt: null,
        status: "ACTIVE",
        teacherSubjects: { none: {} },
      },
    }),
    // ACTIVE teachers with 0 classGroups in strictly ACTIVE status
    db.teacher.count({
      where: {
        organizationId,
        deletedAt: null,
        status: "ACTIVE",
        classGroups: { none: { status: "ACTIVE", deletedAt: null } },
      },
    }),
    // ACTIVE teachers with ≥1 OPEN assessment past its assessmentDate
    db.teacher.count({
      where: {
        organizationId,
        deletedAt: null,
        status: "ACTIVE",
        assessments: {
          some: { status: "OPEN", assessmentDate: { lt: now }, deletedAt: null },
        },
      },
    }),
    // ACTIVE teachers with ≥1 OPEN assessment containing ungraded results
    db.teacher.count({
      where: {
        organizationId,
        deletedAt: null,
        status: "ACTIVE",
        assessments: {
          some: {
            status: "OPEN",
            deletedAt: null,
            results: { some: { status: { in: ["PENDING", "SUBMITTED"] }, deletedAt: null } },
          },
        },
      },
    }),
    // ACTIVE teachers who have ≥1 ACTIVE class group (denominator for avgWorkload)
    db.teacher.count({
      where: {
        organizationId,
        deletedAt: null,
        status: "ACTIVE",
        classGroups: { some: { status: "ACTIVE", deletedAt: null } },
      },
    }),
    // Total ACTIVE class groups assigned to ACTIVE teachers (numerator for avgWorkload)
    db.classGroup.count({
      where: {
        organizationId,
        deletedAt: null,
        status: "ACTIVE",
        teacherId: { not: null },
        teacher: { status: "ACTIVE", deletedAt: null },
      },
    }),
  ]);

  const byStatus = Object.fromEntries(statusGroups.map((g) => [g.status, g._count._all]));

  return {
    totalTeachers: Object.values(byStatus).reduce((a, b) => a + b, 0),
    activeCount: byStatus["ACTIVE"] ?? 0,
    suspendedCount: byStatus["SUSPENDED"] ?? 0,
    noSubjectsCount: noSubjects,
    noClassGroupCount: noClassGroup,
    overdueAssessmentsCount: overdueAssessments,
    pendingGradingCount: pendingGrading,
    avgWorkload:
      teachersWithGroups > 0
        ? Math.round((totalActiveGroups / teachersWithGroups) * 10) / 10
        : 0,
  };
}

// ─── Multi-series trend (last 6 months) ──────────────────────────────────────
// Series 1: Registered — teachers created in that month
// Series 2: Active — currently ACTIVE teachers created up to that month's end (approximation)
// Series 3: With Active Groups — distinct ACTIVE teachers with ≥1 ACTIVE class group
//           created by that month's end (approximation)

export async function getTeacherTrend(organizationId: string): Promise<TeacherTrendItem[]> {
  const db = await getDb();

  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5);
  sixMonthsAgo.setDate(1);
  sixMonthsAgo.setHours(0, 0, 0, 0);

  const [registeredRows, activeRows, activeGroupRows] = await Promise.all([
    // Teachers created in the last 6 months (for "registered" series)
    db.teacher.findMany({
      where: { organizationId, deletedAt: null, createdAt: { gte: sixMonthsAgo } },
      select: { createdAt: true },
    }),
    // All currently ACTIVE teachers (for cumulative "active" approximation per month)
    db.teacher.findMany({
      where: { organizationId, deletedAt: null, status: "ACTIVE" },
      select: { createdAt: true },
    }),
    // ACTIVE class groups with teacherId (for "with active groups" series)
    db.classGroup.findMany({
      where: {
        organizationId,
        deletedAt: null,
        status: "ACTIVE",
        teacherId: { not: null },
      },
      select: { teacherId: true, createdAt: true },
    }),
  ]);

  // For each teacher, record the earliest ACTIVE class group creation date
  const teacherFirstGroupDate = new Map<string, Date>();
  for (const row of activeGroupRows) {
    const existing = teacherFirstGroupDate.get(row.teacherId!);
    const d = new Date(row.createdAt);
    if (!existing || d < existing) {
      teacherFirstGroupDate.set(row.teacherId!, d);
    }
  }
  const firstGroupDates = Array.from(teacherFirstGroupDate.values());

  const now = new Date();
  return Array.from({ length: 6 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
    const year = d.getFullYear();
    const month = d.getMonth();
    const endOfMonth = new Date(year, month + 1, 0, 23, 59, 59, 999);

    const inMonth = (dt: Date) => {
      const x = new Date(dt);
      return x.getFullYear() === year && x.getMonth() === month;
    };
    const byEndOfMonth = (dt: Date) => new Date(dt) <= endOfMonth;

    return {
      month: PT_MONTHS[month],
      registered: registeredRows.filter((r) => inMonth(r.createdAt)).length,
      active: activeRows.filter((r) => byEndOfMonth(r.createdAt)).length,
      withActiveGroups: firstGroupDates.filter(byEndOfMonth).length,
    };
  });
}

// ─── Status distribution (for donut) ─────────────────────────────────────────

export async function getTeacherStatusDistribution(
  organizationId: string
): Promise<TeacherStatusItem[]> {
  const db = await getDb();
  const groups = await db.teacher.groupBy({
    by: ["status"],
    where: { organizationId, deletedAt: null },
    _count: { _all: true },
  });
  return groups
    .filter((g) => g._count._all > 0)
    .map((g) => ({ status: g.status, count: g._count._all }));
}

// ─── Subject distribution: top subjects by assigned teacher count ─────────────

export async function getSubjectDistribution(
  organizationId: string
): Promise<SubjectDistributionItem[]> {
  const db = await getDb();

  const rows = await db.teacherSubject.groupBy({
    by: ["subjectId"],
    where: { teacher: { organizationId, deletedAt: null, status: "ACTIVE" } },
    _count: { _all: true },
  });

  if (rows.length === 0) return [];

  const subjectIds = rows.map((r) => r.subjectId);
  const subjects = await db.subject.findMany({
    where: { id: { in: subjectIds } },
    select: { id: true, name: true },
  });

  const nameMap = new Map(subjects.map((s) => [s.id, s.name]));

  return rows
    .map((r) => ({
      subjectId: r.subjectId,
      subjectName: nameMap.get(r.subjectId) ?? "Desconhecida",
      teacherCount: r._count._all,
    }))
    .sort((a, b) => b.teacherCount - a.teacherCount)
    .slice(0, 8);
}

// ─── Workload: top teachers by ACTIVE class group count ──────────────────────

export async function getWorkloadDistribution(
  organizationId: string
): Promise<WorkloadItem[]> {
  const db = await getDb();

  const groups = await db.classGroup.groupBy({
    by: ["teacherId"],
    where: {
      organizationId,
      deletedAt: null,
      status: "ACTIVE",
      teacherId: { not: null },
    },
    _count: { _all: true },
  });

  if (groups.length === 0) return [];

  const teacherIds = groups.map((g) => g.teacherId!);
  const teachers = await db.teacher.findMany({
    where: { id: { in: teacherIds }, deletedAt: null },
    select: { id: true, firstName: true, lastName: true },
  });

  const nameMap = new Map(teachers.map((t) => [t.id, `${t.firstName} ${t.lastName}`]));

  return groups
    .map((g) => ({
      teacherName: nameMap.get(g.teacherId!) ?? "Desconhecido",
      classGroupCount: g._count._all,
    }))
    .sort((a, b) => b.classGroupCount - a.classGroupCount)
    .slice(0, 8);
}

// ─── Branch distribution ──────────────────────────────────────────────────────

export async function getBranchDistribution(
  organizationId: string
): Promise<BranchDistributionItem[]> {
  const db = await getDb();

  const [withBranch, noBranchCount] = await Promise.all([
    db.teacher.groupBy({
      by: ["branchId"],
      where: {
        organizationId,
        deletedAt: null,
        status: "ACTIVE",
        branchId: { not: null },
      },
      _count: { _all: true },
    }),
    db.teacher.count({
      where: { organizationId, deletedAt: null, status: "ACTIVE", branchId: null },
    }),
  ]);

  if (withBranch.length === 0 && noBranchCount === 0) return [];

  const branchIds = withBranch.map((r) => r.branchId!);
  const branches = await db.branch.findMany({
    where: { id: { in: branchIds } },
    select: { id: true, name: true },
  });

  const nameMap = new Map(branches.map((b) => [b.id, b.name]));

  const result: BranchDistributionItem[] = withBranch
    .map((r) => ({
      branchName: nameMap.get(r.branchId!) ?? "Desconhecida",
      teacherCount: r._count._all,
    }))
    .sort((a, b) => b.teacherCount - a.teacherCount);

  if (noBranchCount > 0) {
    result.push({ branchName: "Sem Filial", teacherCount: noBranchCount });
  }

  return result;
}

// ─── Paginated dashboard rows (enriched with counts) ─────────────────────────

export async function listTeachersForDashboard(
  organizationId: string,
  params: ListTeachersParams
): Promise<PaginatedResult<TeacherDashboardRow>> {
  const result = await findManyByOrganization(organizationId, params);

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
  const ids = result.data.map((t) => t.id);
  const now = new Date();

  const [subjectCountsRaw, classGroupCountsRaw, assessmentCountsRaw, overdueCountsRaw, pendingGradingRaw] =
    await Promise.all([
      db.teacherSubject.groupBy({
        by: ["teacherId"],
        where: { teacherId: { in: ids } },
        _count: { _all: true },
      }),
      db.classGroup.groupBy({
        by: ["teacherId"],
        where: {
          teacherId: { in: ids },
          status: "ACTIVE",
          deletedAt: null,
        },
        _count: { _all: true },
      }),
      db.assessment.groupBy({
        by: ["teacherId"],
        where: { teacherId: { in: ids }, status: "OPEN", deletedAt: null },
        _count: { _all: true },
      }),
      // OPEN assessments past their assessmentDate
      db.assessment.groupBy({
        by: ["teacherId"],
        where: {
          teacherId: { in: ids },
          status: "OPEN",
          assessmentDate: { lt: now },
          deletedAt: null,
        },
        _count: { _all: true },
      }),
      // OPEN assessments with at least 1 ungraded result
      db.assessment.groupBy({
        by: ["teacherId"],
        where: {
          teacherId: { in: ids },
          status: "OPEN",
          deletedAt: null,
          results: { some: { status: { in: ["PENDING", "SUBMITTED"] }, deletedAt: null } },
        },
        _count: { _all: true },
      }),
    ]);

  const subjectMap = new Map(subjectCountsRaw.map((r) => [r.teacherId, r._count._all]));
  const classGroupMap = new Map(classGroupCountsRaw.map((r) => [r.teacherId!, r._count._all]));
  const assessmentMap = new Map(assessmentCountsRaw.map((r) => [r.teacherId!, r._count._all]));
  const overdueMap = new Map(overdueCountsRaw.map((r) => [r.teacherId!, r._count._all]));
  const pendingGradingMap = new Map(pendingGradingRaw.map((r) => [r.teacherId!, r._count._all]));

  return {
    data: result.data.map((t) => ({
      id: t.id,
      fullName: t.fullName,
      specialization: t.specialization,
      branchName: t.branch?.name ?? null,
      status: t.status,
      subjectCount: subjectMap.get(t.id) ?? 0,
      activeClassGroupCount: classGroupMap.get(t.id) ?? 0,
      openAssessmentCount: assessmentMap.get(t.id) ?? 0,
      overdueAssessmentCount: overdueMap.get(t.id) ?? 0,
      pendingGradingAssessmentCount: pendingGradingMap.get(t.id) ?? 0,
      createdAt: t.createdAt,
    })),
    total: result.total,
    page: result.page,
    pageSize: result.pageSize,
    totalPages: result.totalPages,
    hasNextPage: result.hasNextPage,
    hasPreviousPage: result.hasPreviousPage,
  };
}
