import { getDb } from "@/server/db";
import type {
  CourseRevenueFilters,
  CourseRevenueKPIs,
  CourseRevenueRow,
  CourseRevenueMonthlyPoint,
  CourseRevenueReport,
} from "../types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Dec = { toNumber(): number };
function n(v: Dec | number | null | undefined): number {
  if (v == null) return 0;
  return typeof v === "object" ? v.toNumber() : v;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildInvoiceWhere(filters: CourseRevenueFilters): any {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = {
    organizationId: filters.organizationId,
    status: { notIn: ["CANCELLED"] },
    deletedAt: null,
  };
  if (filters.branchId) where.branchId = filters.branchId;
  if (filters.dateFrom || filters.dateTo) {
    where.issueDate = {};
    if (filters.dateFrom) where.issueDate.gte = new Date(filters.dateFrom);
    if (filters.dateTo) where.issueDate.lte = new Date(filters.dateTo);
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const enrollmentFilter: any = {};
  if (filters.courseId) enrollmentFilter.courseId = filters.courseId;
  if (filters.academicYearId) enrollmentFilter.academicYearId = filters.academicYearId;
  if (filters.academicTermId) enrollmentFilter.academicTermId = filters.academicTermId;
  if (Object.keys(enrollmentFilter).length > 0) where.enrollment = enrollmentFilter;
  return where;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildEnrollmentWhere(filters: CourseRevenueFilters): any {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = {
    organizationId: filters.organizationId,
    status: { notIn: ["CANCELLED"] },
  };
  if (filters.branchId) where.branchId = filters.branchId;
  if (filters.courseId) where.courseId = filters.courseId;
  if (filters.academicYearId) where.academicYearId = filters.academicYearId;
  if (filters.academicTermId) where.academicTermId = filters.academicTermId;
  return where;
}

export async function getCourseRevenueReport(
  filters: CourseRevenueFilters
): Promise<CourseRevenueReport> {
  const db = await getDb();
  const today = new Date();
  const invoiceWhere = buildInvoiceWhere(filters);

  const [
    courses,
    invoiceGroups,
    overdueGroups,
    enrollmentCounts,
    monthlyInvoices,
    unassignedAgg,
    unassignedOverdueAgg,
  ] = await Promise.all([
    db.course.findMany({
      where: { organizationId: filters.organizationId, deletedAt: null },
      select: { id: true, name: true },
    }),
    db.invoice.groupBy({
      by: ["enrollmentId"],
      where: { ...invoiceWhere, enrollmentId: { not: null } },
      _sum: { totalAmount: true, paidAmount: true, balanceAmount: true },
      _count: { id: true },
    }),
    db.invoice.groupBy({
      by: ["enrollmentId"],
      where: {
        ...invoiceWhere,
        enrollmentId: { not: null },
        status: { in: ["OVERDUE", "PARTIALLY_PAID"] },
        dueDate: { lt: today },
      },
      _sum: { balanceAmount: true },
    }),
    db.enrollment.groupBy({
      by: ["courseId"],
      where: buildEnrollmentWhere(filters),
      _count: { id: true },
    }),
    db.invoice.findMany({
      where: { ...invoiceWhere, enrollmentId: { not: null } },
      select: { enrollmentId: true, totalAmount: true, issueDate: true },
      orderBy: { issueDate: "asc" },
    }),
    db.invoice.aggregate({
      where: { ...invoiceWhere, enrollmentId: null },
      _sum: { totalAmount: true, paidAmount: true, balanceAmount: true },
      _count: { id: true },
    }),
    db.invoice.aggregate({
      where: {
        ...invoiceWhere,
        enrollmentId: null,
        status: { in: ["OVERDUE", "PARTIALLY_PAID"] },
        dueDate: { lt: today },
      },
      _sum: { balanceAmount: true },
    }),
  ]);

  // Load enrollment → courseId mapping for the enrollmentIds we need
  const enrollmentIds = [...new Set(invoiceGroups.map((g) => g.enrollmentId!))];
  const enrollmentCourseMap = new Map<string, string>();
  if (enrollmentIds.length > 0) {
    const enrollments = await db.enrollment.findMany({
      where: { id: { in: enrollmentIds } },
      select: { id: true, courseId: true },
    });
    for (const e of enrollments) enrollmentCourseMap.set(e.id, e.courseId);
  }

  const courseNameMap = new Map(courses.map((c) => [c.id, c.name]));
  const enrollCountByCourse = new Map(enrollmentCounts.map((e) => [e.courseId, e._count.id]));
  const overdueByEnrollment = new Map(
    overdueGroups.map((g) => [g.enrollmentId!, n(g._sum.balanceAmount as Dec)])
  );

  // Accumulate sums per courseId
  type CourseSums = { invoiced: number; paid: number; balance: number; overdue: number; invoiceCount: number };
  const courseSums = new Map<string, CourseSums>();
  for (const g of invoiceGroups) {
    const courseId = enrollmentCourseMap.get(g.enrollmentId!);
    if (!courseId) continue;
    const cur = courseSums.get(courseId) ?? { invoiced: 0, paid: 0, balance: 0, overdue: 0, invoiceCount: 0 };
    cur.invoiced += n(g._sum.totalAmount as Dec);
    cur.paid += n(g._sum.paidAmount as Dec);
    cur.balance += n(g._sum.balanceAmount as Dec);
    cur.overdue += overdueByEnrollment.get(g.enrollmentId!) ?? 0;
    cur.invoiceCount += g._count.id;
    courseSums.set(courseId, cur);
  }

  const rows: CourseRevenueRow[] = [];
  for (const [courseId, sums] of courseSums) {
    rows.push({
      courseId,
      courseName: courseNameMap.get(courseId) ?? courseId,
      activeEnrollments: enrollCountByCourse.get(courseId) ?? 0,
      totalInvoiced: sums.invoiced,
      totalCollected: sums.paid,
      outstandingBalance: sums.balance,
      overdueBalance: sums.overdue,
      collectionRate: sums.invoiced > 0 ? (sums.paid / sums.invoiced) * 100 : 0,
      averageInvoiceValue: sums.invoiceCount > 0 ? sums.invoiced / sums.invoiceCount : 0,
    });
  }

  // Unassigned invoices
  const unassignedInvoiced = n(unassignedAgg._sum.totalAmount as Dec);
  if (unassignedInvoiced > 0) {
    const unassignedPaid = n(unassignedAgg._sum.paidAmount as Dec);
    const unassignedBalance = n(unassignedAgg._sum.balanceAmount as Dec);
    const unassignedOverdue = n(unassignedOverdueAgg._sum.balanceAmount as Dec);
    const uCount = unassignedAgg._count.id;
    rows.push({
      courseId: null,
      courseName: "Sem Curso",
      activeEnrollments: 0,
      totalInvoiced: unassignedInvoiced,
      totalCollected: unassignedPaid,
      outstandingBalance: unassignedBalance,
      overdueBalance: unassignedOverdue,
      collectionRate: unassignedInvoiced > 0 ? (unassignedPaid / unassignedInvoiced) * 100 : 0,
      averageInvoiceValue: uCount > 0 ? unassignedInvoiced / uCount : 0,
    });
  }

  rows.sort((a, b) => b.totalCollected - a.totalCollected);

  const totalInvoiced = rows.reduce((s, r) => s + r.totalInvoiced, 0);
  const totalCollected = rows.reduce((s, r) => s + r.totalCollected, 0);
  const outstandingBalance = rows.reduce((s, r) => s + r.outstandingBalance, 0);
  const averageCollectionRate = totalInvoiced > 0 ? (totalCollected / totalInvoiced) * 100 : 0;
  const worstDebtCourse = rows.reduce<CourseRevenueRow | null>(
    (worst, r) => (r.outstandingBalance > (worst?.outstandingBalance ?? -1) ? r : worst),
    null
  );

  const kpis: CourseRevenueKPIs = {
    totalInvoiced,
    totalCollected,
    outstandingBalance,
    averageCollectionRate,
    topRevenueCourseName: rows[0]?.courseName ?? null,
    worstDebtCourseName: worstDebtCourse?.courseName ?? null,
  };

  // Monthly trend — top 5 courses by collected
  const top5Ids = new Set(rows.slice(0, 5).map((r) => r.courseId));
  const monthCourseMap = new Map<string, Map<string | null, number>>();
  for (const inv of monthlyInvoices) {
    const courseId = enrollmentCourseMap.get(inv.enrollmentId!) ?? null;
    if (courseId && !top5Ids.has(courseId)) continue;
    const monthKey = `${inv.issueDate.getFullYear()}-${String(inv.issueDate.getMonth() + 1).padStart(2, "0")}`;
    if (!monthCourseMap.has(monthKey)) monthCourseMap.set(monthKey, new Map());
    const mc = monthCourseMap.get(monthKey)!;
    mc.set(courseId, (mc.get(courseId) ?? 0) + n(inv.totalAmount as Dec));
  }

  const monthlyTrend: CourseRevenueMonthlyPoint[] = [];
  for (const [month, mc] of Array.from(monthCourseMap.entries()).sort(([a], [b]) => a.localeCompare(b))) {
    for (const [courseId, invoiced] of mc.entries()) {
      const row = rows.find((r) => r.courseId === courseId);
      if (row && invoiced > 0) {
        monthlyTrend.push({ month, courseId, courseName: row.courseName, invoiced });
      }
    }
  }

  return { kpis, rows, monthlyTrend };
}
