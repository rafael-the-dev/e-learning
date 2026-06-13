import { getDb } from "@/server/db";

const PT_MONTHS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ClassGroupKPIs {
  totalGroups: number;
  activeCount: number;
  formingCount: number;
  completedCount: number;
  // Total enrollments: all non-cancelled enrollments linked to non-archived class groups
  totalEnrollments: number;
  // Weighted occupancy: totalEnrolled / totalCapacity across ACTIVE groups
  occupancyRate: number;
  // ACTIVE groups with occupancy < 50%
  lowOccupancyCount: number;
  // Groups (ACTIVE/FORMING) with at least one operational issue (no teacher, no schedule, no classroom)
  pendingOperationalIssues: number;
}

export interface ClassGroupTrend {
  month: string;
  count: number;
}

export interface ClassGroupStatusItem {
  status: string;
  count: number;
}

export interface OccupancyAnalysisItem {
  id: string;
  name: string;
  enrolled: number;
  capacity: number;
  occupancyRate: number;
}

export interface TeacherDistributionItem {
  teacherName: string;
  groupCount: number;
}

export interface OperationalIssues {
  noTeacherCount: number;
  noScheduleCount: number;
  noClassroomCount: number;
  noTeacherGroups: Array<{ id: string; name: string }>;
  noScheduleGroups: Array<{ id: string; name: string }>;
  noClassroomGroups: Array<{ id: string; name: string }>;
}

// ─── KPIs ─────────────────────────────────────────────────────────────────────

export async function getClassGroupKPIs(organizationId: string): Promise<ClassGroupKPIs> {
  const db = await getDb();

  const [statusGroups, activeGroups, totalEnrollments, operationalGroups] = await Promise.all([
    db.classGroup.groupBy({
      by: ["status"],
      where: { organizationId, deletedAt: null },
      _count: { _all: true },
    }),
    db.classGroup.findMany({
      where: { organizationId, deletedAt: null, status: "ACTIVE" },
      select: { currentCount: true, capacity: true },
    }),
    // Total enrollments: all non-cancelled enrollments linked to non-archived class groups
    db.enrollment.count({
      where: {
        classGroupId: { not: null },
        classGroup: {
          organizationId,
          deletedAt: null,
          status: { notIn: ["ARCHIVED", "CANCELLED"] },
        },
        status: { notIn: ["CANCELLED"] },
      },
    }),
    db.classGroup.findMany({
      where: { organizationId, deletedAt: null, status: { in: ["ACTIVE", "FORMING"] } },
      select: {
        id: true,
        teacherId: true,
        _count: { select: { classGroupSchedules: true, classroomBookings: true } },
      },
    }),
  ]);

  const byStatus = Object.fromEntries(statusGroups.map((g) => [g.status, g._count._all]));
  const totalGroups = Object.values(byStatus).reduce((a, b) => a + b, 0);

  // Weighted occupancy: totalEnrolled / totalCapacity (not avg of individual rates)
  const totalEnrolled = activeGroups.reduce((sum, g) => sum + g.currentCount, 0);
  const totalCapacity = activeGroups.reduce((sum, g) => sum + g.capacity, 0);
  const occupancyRate = totalCapacity > 0 ? Math.round((totalEnrolled / totalCapacity) * 100) : 0;
  const lowOccupancyCount = activeGroups.filter(
    (g) => g.capacity > 0 && g.currentCount / g.capacity < 0.5
  ).length;

  const issueIds = new Set<string>();
  for (const g of operationalGroups) {
    if (!g.teacherId) issueIds.add(g.id);
    if (g._count.classGroupSchedules === 0) issueIds.add(g.id);
    if (g._count.classroomBookings === 0) issueIds.add(g.id);
  }

  return {
    totalGroups,
    activeCount: byStatus["ACTIVE"] ?? 0,
    formingCount: byStatus["FORMING"] ?? 0,
    completedCount: byStatus["COMPLETED"] ?? 0,
    totalEnrollments,
    occupancyRate,
    lowOccupancyCount,
    pendingOperationalIssues: issueIds.size,
  };
}

// ─── Growth trend (last 6 months) ────────────────────────────────────────────

export async function getClassGroupTrend(organizationId: string): Promise<ClassGroupTrend[]> {
  const db = await getDb();

  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5);
  sixMonthsAgo.setDate(1);
  sixMonthsAgo.setHours(0, 0, 0, 0);

  const rows = await db.classGroup.findMany({
    where: { organizationId, deletedAt: null, createdAt: { gte: sixMonthsAgo } },
    select: { createdAt: true },
  });

  const now = new Date();
  const months: ClassGroupTrend[] = [];

  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const year = d.getFullYear();
    const month = d.getMonth();

    const count = rows.filter((r) => {
      const dt = new Date(r.createdAt);
      return dt.getFullYear() === year && dt.getMonth() === month;
    }).length;

    months.push({ month: PT_MONTHS[month], count });
  }

  return months;
}

// ─── Status distribution (for donut) ─────────────────────────────────────────

export async function getClassGroupStatusDistribution(
  organizationId: string
): Promise<ClassGroupStatusItem[]> {
  const db = await getDb();

  const groups = await db.classGroup.groupBy({
    by: ["status"],
    where: { organizationId, deletedAt: null },
    _count: { _all: true },
  });

  return groups
    .filter((g) => g._count._all > 0)
    .map((g) => ({ status: g.status, count: g._count._all }));
}

// ─── Occupancy analysis (for Ocupação tab) ───────────────────────────────────

export async function getOccupancyAnalysis(organizationId: string): Promise<OccupancyAnalysisItem[]> {
  const db = await getDb();

  const groups = await db.classGroup.findMany({
    where: { organizationId, deletedAt: null, status: "ACTIVE" },
    select: { id: true, name: true, currentCount: true, capacity: true },
    orderBy: { name: "asc" },
    take: 10,
  });

  return groups
    .map((g) => ({
      id: g.id,
      name: g.name,
      enrolled: g.currentCount,
      capacity: g.capacity,
      occupancyRate: g.capacity > 0 ? Math.round((g.currentCount / g.capacity) * 100) : 0,
    }))
    .sort((a, b) => b.occupancyRate - a.occupancyRate);
}

// ─── Teacher distribution (for Professores tab) ───────────────────────────────

export async function getTeacherDistribution(
  organizationId: string
): Promise<TeacherDistributionItem[]> {
  const db = await getDb();

  const groups = await db.classGroup.findMany({
    where: {
      organizationId,
      deletedAt: null,
      status: { in: ["FORMING", "ACTIVE"] },
      teacherId: { not: null },
    },
    select: {
      teacher: { select: { firstName: true, lastName: true } },
    },
  });

  const map = new Map<string, number>();
  for (const g of groups) {
    if (!g.teacher) continue;
    const name = `${g.teacher.firstName} ${g.teacher.lastName}`;
    map.set(name, (map.get(name) ?? 0) + 1);
  }

  return Array.from(map.entries())
    .map(([teacherName, groupCount]) => ({ teacherName, groupCount }))
    .sort((a, b) => b.groupCount - a.groupCount)
    .slice(0, 8);
}

// ─── Operational issues (for Operacional tab) ─────────────────────────────────

export async function getOperationalIssues(organizationId: string): Promise<OperationalIssues> {
  const db = await getDb();

  const groups = await db.classGroup.findMany({
    where: { organizationId, deletedAt: null, status: { in: ["ACTIVE", "FORMING"] } },
    select: {
      id: true,
      name: true,
      teacherId: true,
      _count: { select: { classGroupSchedules: true, classroomBookings: true } },
    },
    orderBy: { name: "asc" },
  });

  const noTeacherGroups = groups
    .filter((g) => !g.teacherId)
    .map((g) => ({ id: g.id, name: g.name }));

  const noScheduleGroups = groups
    .filter((g) => g._count.classGroupSchedules === 0)
    .map((g) => ({ id: g.id, name: g.name }));

  const noClassroomGroups = groups
    .filter((g) => g._count.classroomBookings === 0)
    .map((g) => ({ id: g.id, name: g.name }));

  return {
    noTeacherCount: noTeacherGroups.length,
    noScheduleCount: noScheduleGroups.length,
    noClassroomCount: noClassroomGroups.length,
    noTeacherGroups,
    noScheduleGroups,
    noClassroomGroups,
  };
}
