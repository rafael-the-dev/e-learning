import { getDb } from "@/server/db";
import { buildSkipTake, buildPaginationMeta } from "@/shared/lib/pagination";
import type { PaginatedResult, PaginationParams } from "@/shared/types/common";
import type {
  Enrollment,
  EnrollmentStatusHistory,
  EnrollmentWatchlistItem,
  EnrollmentMonthlyTrend,
  EnrollmentCourseDistribution,
  EnrollmentBranchDistribution,
} from "@/modules/enrollments/types";

// =============================================================================
// ENROLLMENT REPOSITORY
// All queries are scoped to organizationId. Never query cross-tenant.
// =============================================================================

export interface ListEnrollmentsParams extends PaginationParams {
  search?: string;
  status?: string;
  courseId?: string;
  branchId?: string;
  classGroupId?: string;
  academicYearId?: string;
  academicTermId?: string;
  financialStatus?: string;
}

const enrollmentSelect = {
  id: true,
  organizationId: true,
  branchId: true,
  studentId: true,
  courseId: true,
  courseLevelId: true,
  classGroupId: true,
  academicYearId: true,
  academicTermId: true,
  enrollmentNumber: true,
  enrollmentDate: true,
  startDate: true,
  expectedEndDate: true,
  status: true,
  notes: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
  createdBy: true,
  updatedBy: true,
  student: { select: { id: true, firstName: true, lastName: true, code: true } },
  course: { select: { id: true, name: true } },
  courseLevel: { select: { id: true, name: true } },
  classGroup: { select: { id: true, name: true } },
  branch: { select: { id: true, name: true } },
  academicYear: { select: { id: true, name: true } },
  academicTerm: { select: { id: true, name: true } },
  invoices: { select: { status: true } },
} as const;

function computeFinancialStatus(invoices: Array<{ status: string }>): string {
  if (invoices.length === 0) return "NO_INVOICE";
  if (invoices.some((i) => i.status === "OVERDUE")) return "OVERDUE";
  if (invoices.some((i) => i.status === "PARTIALLY_PAID")) return "PARTIALLY_PAID";
  if (invoices.some((i) => i.status === "PENDING")) return "PENDING";
  const nonCancelled = invoices.filter((i) => i.status !== "CANCELLED");
  if (nonCancelled.length > 0 && nonCancelled.every((i) => i.status === "PAID")) return "PAID";
  return "PENDING";
}

function mapToEnrollment(row: {
  id: string;
  organizationId: string;
  branchId: string | null;
  studentId: string;
  courseId: string;
  courseLevelId: string | null;
  classGroupId: string | null;
  academicYearId: string;
  academicTermId: string | null;
  enrollmentNumber: string | null;
  enrollmentDate: Date;
  startDate: Date | null;
  expectedEndDate: Date | null;
  status: string;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
  createdBy: string | null;
  updatedBy: string | null;
  student: { id: string; firstName: string; lastName: string; code: string | null };
  course: { id: string; name: string };
  courseLevel: { id: string; name: string } | null;
  classGroup: { id: string; name: string } | null;
  branch: { id: string; name: string } | null;
  academicYear: { id: string; name: string };
  academicTerm: { id: string; name: string } | null;
  invoices: Array<{ status: string }>;
}): Enrollment {
  return {
    id: row.id,
    organizationId: row.organizationId,
    branchId: row.branchId,
    studentId: row.studentId,
    courseId: row.courseId,
    courseLevelId: row.courseLevelId,
    classGroupId: row.classGroupId,
    academicYearId: row.academicYearId,
    academicTermId: row.academicTermId,
    enrollmentNumber: row.enrollmentNumber,
    enrollmentDate: row.enrollmentDate,
    startDate: row.startDate,
    expectedEndDate: row.expectedEndDate,
    status: row.status,
    notes: row.notes,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    deletedAt: row.deletedAt,
    createdBy: row.createdBy,
    updatedBy: row.updatedBy,
    studentName: `${row.student.firstName} ${row.student.lastName}`,
    studentCode: row.student.code,
    courseName: row.course.name,
    courseLevelName: row.courseLevel?.name ?? null,
    classGroupName: row.classGroup?.name ?? null,
    branchName: row.branch?.name ?? null,
    academicYearName: row.academicYear.name,
    academicTermName: row.academicTerm?.name ?? null,
    financialStatus: computeFinancialStatus(row.invoices),
  };
}

export async function findEnrollmentsByOrganization(
  organizationId: string,
  params: ListEnrollmentsParams
): Promise<PaginatedResult<Enrollment>> {
  const db = await getDb();
  const { skip, take } = buildSkipTake(params);

  const financialStatusFilter =
    params.financialStatus === "NO_INVOICE"
      ? { invoices: { none: {} } }
      : params.financialStatus === "OVERDUE"
        ? { invoices: { some: { status: "OVERDUE" } } }
        : params.financialStatus === "PARTIALLY_PAID"
          ? { invoices: { some: { status: "PARTIALLY_PAID" } } }
          : params.financialStatus === "PENDING"
            ? { invoices: { some: { status: "PENDING" } } }
            : params.financialStatus === "PAID"
              ? { invoices: { some: { status: "PAID" } }, NOT: { invoices: { some: { status: { in: ["OVERDUE", "PENDING", "PARTIALLY_PAID"] } } } } }
              : {};

  const where = {
    organizationId,
    deletedAt: null,
    ...(params.status && { status: params.status }),
    ...(params.courseId && { courseId: params.courseId }),
    ...(params.branchId && { branchId: params.branchId }),
    ...(params.classGroupId && { classGroupId: params.classGroupId }),
    ...(params.academicYearId && { academicYearId: params.academicYearId }),
    ...(params.academicTermId && { academicTermId: params.academicTermId }),
    ...(params.financialStatus && financialStatusFilter),
    ...(params.search && {
      OR: [
        { enrollmentNumber: { contains: params.search } },
        { student: { firstName: { contains: params.search } } },
        { student: { lastName: { contains: params.search } } },
        { student: { code: { contains: params.search } } },
      ],
    }),
  };

  const [rows, total] = await Promise.all([
    db.enrollment.findMany({
      where,
      select: enrollmentSelect,
      skip,
      take,
      orderBy: [{ createdAt: "desc" }],
    }),
    db.enrollment.count({ where }),
  ]);

  return buildPaginationMeta(rows.map(mapToEnrollment), total, params);
}

export async function findEnrollmentByIdInOrganization(
  id: string,
  organizationId: string
): Promise<Enrollment | null> {
  const db = await getDb();
  const row = await db.enrollment.findFirst({
    where: { id, organizationId, deletedAt: null },
    select: enrollmentSelect,
  });
  return row ? mapToEnrollment(row) : null;
}

export async function createEnrollment(data: {
  organizationId: string;
  branchId: string | null;
  studentId: string;
  courseId: string;
  courseLevelId?: string | null;
  classGroupId?: string | null;
  academicYearId: string;
  academicTermId?: string | null;
  enrollmentNumber: string;
  enrollmentDate: Date;
  startDate?: Date | null;
  expectedEndDate?: Date | null;
  status: string;
  notes?: string | null;
  createdBy?: string | null;
}): Promise<Enrollment> {
  const db = await getDb();
  const row = await db.enrollment.create({
    data: {
      organizationId: data.organizationId,
      branchId: data.branchId,
      studentId: data.studentId,
      courseId: data.courseId,
      courseLevelId: data.courseLevelId ?? null,
      classGroupId: data.classGroupId ?? null,
      academicYearId: data.academicYearId,
      academicTermId: data.academicTermId ?? null,
      enrollmentNumber: data.enrollmentNumber,
      enrollmentDate: data.enrollmentDate,
      startDate: data.startDate ?? null,
      expectedEndDate: data.expectedEndDate ?? null,
      status: data.status,
      notes: data.notes ?? null,
      createdBy: data.createdBy ?? null,
    },
    select: enrollmentSelect,
  });
  return mapToEnrollment(row);
}

export async function updateEnrollment(
  id: string,
  organizationId: string,
  data: {
    branchId?: string | null;
    courseLevelId?: string | null;
    classGroupId?: string | null;
    academicYearId?: string;
    academicTermId?: string | null;
    startDate?: Date | null;
    expectedEndDate?: Date | null;
    notes?: string | null;
    updatedBy?: string | null;
  }
): Promise<Enrollment> {
  const db = await getDb();
  const updateData: Record<string, unknown> = { updatedBy: data.updatedBy ?? null };
  if (data.branchId !== undefined) updateData.branchId = data.branchId;
  if (data.courseLevelId !== undefined) updateData.courseLevelId = data.courseLevelId;
  if (data.classGroupId !== undefined) updateData.classGroupId = data.classGroupId;
  if (data.academicYearId !== undefined) updateData.academicYearId = data.academicYearId;
  if (data.academicTermId !== undefined) updateData.academicTermId = data.academicTermId;
  if (data.startDate !== undefined) updateData.startDate = data.startDate;
  if (data.expectedEndDate !== undefined) updateData.expectedEndDate = data.expectedEndDate;
  if (data.notes !== undefined) updateData.notes = data.notes;

  const row = await db.enrollment.update({
    where: { id, organizationId },
    data: updateData,
    select: enrollmentSelect,
  });
  return mapToEnrollment(row);
}

export async function updateEnrollmentStatus(
  id: string,
  organizationId: string,
  status: string,
  updatedBy?: string | null
): Promise<Enrollment> {
  const db = await getDb();
  const row = await db.enrollment.update({
    where: { id, organizationId },
    data: { status, updatedBy: updatedBy ?? null },
    select: enrollmentSelect,
  });
  return mapToEnrollment(row);
}

export async function softDeleteEnrollment(
  id: string,
  organizationId: string
): Promise<void> {
  const db = await getDb();
  await db.enrollment.update({
    where: { id, organizationId },
    data: { deletedAt: new Date() },
  });
}

export async function countActiveEnrollmentsByCourse(
  courseId: string,
  organizationId: string
): Promise<number> {
  const db = await getDb();
  return db.enrollment.count({
    where: { courseId, organizationId, status: "ACTIVE", deletedAt: null },
  });
}

export async function countActiveEnrollmentsByClassGroup(
  classGroupId: string,
  organizationId: string
): Promise<number> {
  const db = await getDb();
  return db.enrollment.count({
    where: {
      classGroupId,
      organizationId,
      status: { notIn: ["CANCELLED", "COMPLETED"] },
      deletedAt: null,
    },
  });
}

export async function studentHasActiveEnrollmentInCourse(
  studentId: string,
  courseId: string,
  organizationId: string,
  excludeEnrollmentId?: string
): Promise<boolean> {
  const db = await getDb();
  const count = await db.enrollment.count({
    where: {
      studentId,
      courseId,
      organizationId,
      status: "ACTIVE",
      deletedAt: null,
      ...(excludeEnrollmentId ? { id: { not: excludeEnrollmentId } } : {}),
    },
  });
  return count > 0;
}

export async function getLastEnrollmentNumber(organizationId: string): Promise<number> {
  const db = await getDb();
  const last = await db.enrollment.findFirst({
    where: {
      organizationId,
      enrollmentNumber: { not: null },
    },
    orderBy: { enrollmentNumber: "desc" },
    select: { enrollmentNumber: true },
  });
  if (!last?.enrollmentNumber) return 0;
  const num = parseInt(last.enrollmentNumber.replace(/\D/g, ""), 10);
  return isNaN(num) ? 0 : num;
}

export async function createEnrollmentStatusHistory(data: {
  enrollmentId: string;
  fromStatus: string | null;
  toStatus: string;
  reason?: string | null;
  changedBy?: string | null;
}): Promise<void> {
  const db = await getDb();
  await db.enrollmentStatusHistory.create({
    data: {
      enrollmentId: data.enrollmentId,
      fromStatus: data.fromStatus ?? null,
      toStatus: data.toStatus,
      reason: data.reason ?? null,
      changedBy: data.changedBy ?? null,
    },
  });
}

export async function findEnrollmentHistory(
  enrollmentId: string,
  organizationId: string
): Promise<EnrollmentStatusHistory[]> {
  const db = await getDb();
  const rows = await db.enrollmentStatusHistory.findMany({
    where: { enrollmentId, enrollment: { organizationId, deletedAt: null } },
    orderBy: { changedAt: "desc" },
    select: {
      id: true,
      enrollmentId: true,
      fromStatus: true,
      toStatus: true,
      reason: true,
      changedBy: true,
      changedAt: true,
    },
  });
  return rows.map((r) => ({
    id: r.id,
    enrollmentId: r.enrollmentId,
    fromStatus: r.fromStatus,
    toStatus: r.toStatus,
    reason: r.reason,
    changedBy: r.changedBy,
    changedAt: r.changedAt,
  }));
}

export async function countEnrollmentsByStatus(
  organizationId: string
): Promise<Record<string, number>> {
  const db = await getDb();
  const rows = await db.enrollment.groupBy({
    by: ["status"],
    where: { organizationId, deletedAt: null },
    _count: { _all: true },
  });
  const result: Record<string, number> = {};
  for (const row of rows) {
    result[row.status] = row._count._all;
  }
  return result;
}

export interface CourseLevelEnrollmentStats {
  total: number;
  active: number;
  byLevel: Record<string, { total: number; active: number }>;
}

export async function findEnrollmentStatsByCourse(
  courseId: string,
  organizationId: string
): Promise<CourseLevelEnrollmentStats> {
  const db = await getDb();
  const rows = await db.enrollment.groupBy({
    by: ["courseLevelId", "status"],
    where: { courseId, organizationId, deletedAt: null },
    _count: { _all: true },
  });

  const byLevel: Record<string, { total: number; active: number }> = {};
  let total = 0;
  let active = 0;

  for (const row of rows) {
    const count = row._count._all;
    total += count;
    if (row.status === "ACTIVE") active += count;
    if (row.courseLevelId) {
      if (!byLevel[row.courseLevelId]) byLevel[row.courseLevelId] = { total: 0, active: 0 };
      byLevel[row.courseLevelId].total += count;
      if (row.status === "ACTIVE") byLevel[row.courseLevelId].active += count;
    }
  }

  return { total, active, byLevel };
}

// =============================================================================
// DASHBOARD QUERIES
// =============================================================================

export async function countActiveEnrollmentsWithoutClassGroup(
  organizationId: string
): Promise<number> {
  const db = await getDb();
  return db.enrollment.count({
    where: { organizationId, status: "ACTIVE", classGroupId: null, deletedAt: null },
  });
}

export async function countEnrollmentsWithOverdueInvoices(
  organizationId: string
): Promise<number> {
  const db = await getDb();
  return db.enrollment.count({
    where: { organizationId, deletedAt: null, invoices: { some: { status: "OVERDUE" } } },
  });
}

export async function countActiveEnrollmentsWithoutInvoice(
  organizationId: string
): Promise<number> {
  const db = await getDb();
  return db.enrollment.count({
    where: { organizationId, status: "ACTIVE", deletedAt: null, invoices: { none: {} } },
  });
}

export async function countStudentsWithWalletCredit(
  organizationId: string
): Promise<number> {
  const db = await getDb();
  const result = await db.$queryRaw<Array<{ cnt: number | bigint }>>`
    SELECT COUNT(*) as cnt
    FROM (
      SELECT sw.studentId
      FROM student_wallets sw
      INNER JOIN student_wallet_transactions swt ON swt.studentWalletId = sw.id
      WHERE sw.organizationId = ${organizationId}
      AND sw.status = 'ACTIVE'
      GROUP BY sw.studentId
      HAVING SUM(swt.amount) > 0
    ) AS t
  `;
  return Number(result[0]?.cnt ?? 0);
}

export async function findTopCoursesByActiveEnrollments(
  organizationId: string,
  limit = 5
): Promise<EnrollmentCourseDistribution[]> {
  const db = await getDb();
  const rows = await db.enrollment.groupBy({
    by: ["courseId"],
    where: { organizationId, status: "ACTIVE", deletedAt: null },
    _count: { _all: true },
  });
  if (rows.length === 0) return [];
  const sorted = [...rows].sort((a, b) => b._count._all - a._count._all).slice(0, limit);
  const courseIds = sorted.map((r) => r.courseId);
  const courses = await db.course.findMany({
    where: { id: { in: courseIds } },
    select: { id: true, name: true },
  });
  const nameMap = Object.fromEntries(courses.map((c) => [c.id, c.name]));
  return sorted.map((r) => ({
    courseId: r.courseId,
    courseName: nameMap[r.courseId] ?? r.courseId,
    activeCount: r._count._all,
  }));
}

export async function findEnrollmentMonthlyTrend(
  organizationId: string,
  months = 6
): Promise<EnrollmentMonthlyTrend[]> {
  const db = await getDb();
  const since = new Date();
  since.setMonth(since.getMonth() - months);
  since.setDate(1);
  since.setHours(0, 0, 0, 0);
  const rows = await db.enrollment.findMany({
    where: { organizationId, deletedAt: null, createdAt: { gte: since } },
    select: { createdAt: true },
    orderBy: { createdAt: "asc" },
  });
  const map = new Map<string, number>();
  for (const row of rows) {
    const key = `${row.createdAt.getFullYear()}-${String(row.createdAt.getMonth() + 1).padStart(2, "0")}`;
    map.set(key, (map.get(key) ?? 0) + 1);
  }
  return Array.from(map.entries()).map(([month, total]) => ({ month, total }));
}

export async function findEnrollmentBranchDistribution(
  organizationId: string
): Promise<EnrollmentBranchDistribution[]> {
  const db = await getDb();
  const rows = await db.enrollment.groupBy({
    by: ["branchId"],
    where: { organizationId, status: "ACTIVE", deletedAt: null },
    _count: { _all: true },
  });
  if (rows.length === 0) return [];
  const branchIds = rows.filter((r) => r.branchId !== null).map((r) => r.branchId as string);
  const branches =
    branchIds.length > 0
      ? await db.branch.findMany({
          where: { id: { in: branchIds } },
          select: { id: true, name: true },
        })
      : [];
  const nameMap = Object.fromEntries(branches.map((b) => [b.id, b.name]));
  return rows
    .map((r) => ({
      branchId: r.branchId,
      branchName: r.branchId ? (nameMap[r.branchId] ?? r.branchId) : "Sem filial",
      count: r._count._all,
    }))
    .sort((a, b) => b.count - a.count);
}

const watchlistSelect = {
  id: true,
  enrollmentNumber: true,
  studentId: true,
  createdAt: true,
  student: { select: { id: true, firstName: true, lastName: true, code: true } },
  course: { select: { id: true, name: true } },
  courseLevel: { select: { id: true, name: true } },
  classGroup: { select: { id: true, name: true } },
} as const;

export async function findEnrollmentWatchlist(
  organizationId: string,
  limit = 20
): Promise<EnrollmentWatchlistItem[]> {
  const db = await getDb();
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const perGroup = Math.ceil(limit / 4);

  const [withOverdue, withoutInvoice, longPending, withoutClassGroup] = await Promise.all([
    db.enrollment.findMany({
      where: { organizationId, status: "ACTIVE", deletedAt: null, invoices: { some: { status: "OVERDUE" } } },
      select: watchlistSelect,
      take: perGroup,
      orderBy: { createdAt: "desc" },
    }),
    db.enrollment.findMany({
      where: { organizationId, status: "ACTIVE", deletedAt: null, invoices: { none: {} } },
      select: watchlistSelect,
      take: perGroup,
      orderBy: { createdAt: "desc" },
    }),
    db.enrollment.findMany({
      where: { organizationId, status: "PENDING_PAYMENT", deletedAt: null, createdAt: { lt: sevenDaysAgo } },
      select: watchlistSelect,
      take: perGroup,
      orderBy: { createdAt: "asc" },
    }),
    db.enrollment.findMany({
      where: { organizationId, status: "ACTIVE", classGroupId: null, deletedAt: null },
      select: watchlistSelect,
      take: perGroup,
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const results: EnrollmentWatchlistItem[] = [];
  const seenIds = new Set<string>();

  const push = (
    rows: typeof withOverdue,
    issue: string,
    severity: EnrollmentWatchlistItem["severity"],
    recommendedAction: string
  ) => {
    for (const row of rows) {
      if (seenIds.has(row.id)) continue;
      seenIds.add(row.id);
      results.push({
        enrollmentId: row.id,
        enrollmentNumber: row.enrollmentNumber,
        studentId: row.studentId,
        studentName: `${row.student.firstName} ${row.student.lastName}`,
        studentCode: row.student.code,
        courseName: row.course.name,
        courseLevelName: row.courseLevel?.name ?? null,
        classGroupName: row.classGroup?.name ?? null,
        issue,
        severity,
        recommendedAction,
        createdAt: row.createdAt,
      });
    }
  };

  push(withOverdue, "Fatura vencida", "critical", "Regularizar pagamento");
  push(withoutInvoice, "Sem fatura associada", "high", "Gerar fatura");
  push(longPending, "Aguarda pagamento há mais de 7 dias", "medium", "Verificar pagamento");
  push(withoutClassGroup, "Sem turma atribuída", "low", "Atribuir turma");

  return results.slice(0, limit);
}
