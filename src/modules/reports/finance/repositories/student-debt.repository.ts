import { Prisma } from "@prisma/client";
import { getDb } from "@/server/db";
import type { StudentDebtFilters, StudentDebtKPIs, StudentDebtRow } from "../types";

type DecimalLike = { toNumber(): number };

function toNum(v: DecimalLike | number | null | undefined): number {
  if (v == null) return 0;
  return typeof v === "object" && "toNumber" in v ? v.toNumber() : (v as number);
}

function calcDaysOverdue(dueDate: Date | null, today: Date): number {
  if (!dueDate) return 0;
  return Math.max(0, Math.floor((today.getTime() - dueDate.getTime()) / 86_400_000));
}

// ---------------------------------------------------------------------------
// KPI helper — uses Prisma groupBy (DB-level aggregation, no row hydration)
// ---------------------------------------------------------------------------

function buildKpiWhere(filters: StudentDebtFilters) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = {
    organizationId: filters.organizationId,
    balanceAmount: { gt: 0 },
    status: { notIn: ["CANCELLED", "PAID"] },
    deletedAt: null,
  };

  if (filters.studentId) where.studentId = filters.studentId;
  if (filters.branchId) where.branchId = filters.branchId;
  if (filters.courseId) where.enrollment = { courseId: filters.courseId };
  if (filters.overdueOnly) where.dueDate = { lt: new Date() };
  if (filters.minBalance != null) where.balanceAmount = { ...where.balanceAmount, gte: filters.minBalance };

  if (filters.dueDateFrom || filters.dueDateTo) {
    where.dueDate = { ...(where.dueDate ?? {}) };
    if (filters.dueDateFrom) where.dueDate.gte = new Date(filters.dueDateFrom);
    if (filters.dueDateTo) where.dueDate.lte = new Date(filters.dueDateTo);
  }

  if (filters.dateFrom || filters.dateTo) {
    where.issueDate = {};
    if (filters.dateFrom) where.issueDate.gte = new Date(filters.dateFrom);
    if (filters.dateTo) where.issueDate.lte = new Date(filters.dateTo);
  }

  if (filters.search) {
    where.OR = [
      { student: { firstName: { contains: filters.search } } },
      { student: { lastName: { contains: filters.search } } },
      { student: { code: { contains: filters.search } } },
    ];
  }

  return where;
}

export async function getStudentDebtKPIs(
  filters: StudentDebtFilters
): Promise<StudentDebtKPIs> {
  const db = await getDb();
  const today = new Date();
  const where = buildKpiWhere(filters);

  const [totalAgg, overdueAgg, byStudent] = await Promise.all([
    db.invoice.aggregate({ where, _sum: { balanceAmount: true } }),
    db.invoice.aggregate({
      where: { ...where, dueDate: { lt: today } },
      _sum: { balanceAmount: true },
    }),
    db.invoice.groupBy({
      by: ["studentId"],
      where: { ...where, studentId: { not: null } },
      _sum: { balanceAmount: true },
      // _min gives the earliest due date → largest days-overdue value
      _min: { dueDate: true },
      orderBy: { _sum: { balanceAmount: "desc" } },
    }),
  ]);

  const largestDebtorBalance =
    byStudent.length > 0 ? toNum(byStudent[0]._sum.balanceAmount as DecimalLike) : 0;

  let longestOverdueDays = 0;
  for (const row of byStudent) {
    const days = calcDaysOverdue(row._min.dueDate ?? null, today);
    if (days > longestOverdueDays) longestOverdueDays = days;
  }

  return {
    totalOutstanding: toNum(totalAgg._sum.balanceAmount as DecimalLike),
    overdueOutstanding: toNum(overdueAgg._sum.balanceAmount as DecimalLike),
    studentsWithDebt: byStudent.length,
    largestDebtorBalance,
    longestOverdueDays,
  };
}

// ---------------------------------------------------------------------------
// Row query — pure SQL aggregation + DB-level pagination
// ---------------------------------------------------------------------------

// Whitelisted ORDER BY expressions — never interpolated from raw user input
const SORT_EXPRESSIONS: Record<string, string> = {
  outstandingBalance: "SUM(CAST(i.balanceAmount AS FLOAT))",
  overdueBalance:
    "SUM(CASE WHEN i.dueDate < GETDATE() OR i.status = 'OVERDUE' THEN CAST(i.balanceAmount AS FLOAT) ELSE 0 END)",
  longestOverdueDays:
    "MAX(CASE WHEN i.dueDate < GETDATE() THEN DATEDIFF(day, i.dueDate, GETDATE()) ELSE 0 END)",
  studentName: "s.firstName",
  totalInvoiced: "SUM(CAST(i.totalAmount AS FLOAT))",
};

function resolveOrderBy(sortBy?: string, sortDir?: string): Prisma.Sql {
  const expr = SORT_EXPRESSIONS[sortBy ?? ""] ?? SORT_EXPRESSIONS.outstandingBalance;
  const dir = sortDir === "asc" ? "ASC" : "DESC";
  return Prisma.raw(`${expr} ${dir}`);
}

function buildSqlWhere(filters: StudentDebtFilters): Prisma.Sql {
  const clauses: Prisma.Sql[] = [
    Prisma.sql`i.organizationId = ${filters.organizationId}`,
    Prisma.sql`i.deletedAt IS NULL`,
    Prisma.sql`i.status NOT IN ('CANCELLED', 'PAID')`,
    Prisma.sql`CAST(i.balanceAmount AS FLOAT) > 0`,
    Prisma.sql`i.studentId IS NOT NULL`,
  ];

  if (filters.studentId) {
    clauses.push(Prisma.sql`i.studentId = ${filters.studentId}`);
  }

  if (filters.branchId) {
    clauses.push(Prisma.sql`i.branchId = ${filters.branchId}`);
  }

  if (filters.overdueOnly) {
    clauses.push(Prisma.sql`i.dueDate < GETDATE()`);
  }

  if (filters.minBalance != null) {
    clauses.push(Prisma.sql`CAST(i.balanceAmount AS FLOAT) >= ${filters.minBalance}`);
  }

  if (filters.dueDateFrom) {
    clauses.push(Prisma.sql`i.dueDate >= ${new Date(filters.dueDateFrom)}`);
  }

  if (filters.dueDateTo) {
    clauses.push(Prisma.sql`i.dueDate <= ${new Date(filters.dueDateTo)}`);
  }

  if (filters.dateFrom) {
    clauses.push(Prisma.sql`i.issueDate >= ${new Date(filters.dateFrom)}`);
  }

  if (filters.dateTo) {
    clauses.push(Prisma.sql`i.issueDate <= ${new Date(filters.dateTo)}`);
  }

  if (filters.courseId) {
    clauses.push(
      Prisma.sql`EXISTS (
        SELECT 1 FROM enrollments e
        WHERE e.id = i.enrollmentId
          AND e.courseId = ${filters.courseId}
          AND e.deletedAt IS NULL
      )`
    );
  }

  if (filters.academicYearId) {
    clauses.push(
      Prisma.sql`EXISTS (
        SELECT 1 FROM enrollments e
        WHERE e.id = i.enrollmentId
          AND e.academicYearId = ${filters.academicYearId}
          AND e.deletedAt IS NULL
      )`
    );
  }

  if (filters.academicTermId) {
    clauses.push(
      Prisma.sql`EXISTS (
        SELECT 1 FROM enrollments e
        WHERE e.id = i.enrollmentId
          AND e.academicTermId = ${filters.academicTermId}
          AND e.deletedAt IS NULL
      )`
    );
  }

  if (filters.search) {
    const escaped = filters.search.replace(/[%_[\]]/g, "\\$&");
    const term = `%${escaped}%`;
    clauses.push(
      Prisma.sql`(s.firstName LIKE ${term} ESCAPE '\\' OR s.lastName LIKE ${term} ESCAPE '\\' OR s.code LIKE ${term} ESCAPE '\\')`
    );
  }

  return Prisma.sql`WHERE ${Prisma.join(clauses, " AND ")}`;
}

interface RawDebtRow {
  studentId: string;
  firstName: string;
  lastName: string;
  studentCode: string | null;
  totalInvoiced: number;
  totalPaid: number;
  outstandingBalance: number;
  overdueBalance: number;
  invoiceCount: bigint | number;
  longestOverdueDays: number;
}

export async function listStudentDebtRows(
  filters: StudentDebtFilters
): Promise<{ rows: StudentDebtRow[]; total: number }> {
  const db = await getDb();
  const { page, pageSize } = filters;
  const skip = (page - 1) * pageSize;

  const whereFragment = buildSqlWhere(filters);
  const orderByExpr = resolveOrderBy(filters.sortBy, filters.sortDir);

  // Run main aggregation query and count query concurrently
  const [rawRows, countResult] = await Promise.all([
    db.$queryRaw<RawDebtRow[]>(Prisma.sql`
      SELECT
        i.studentId,
        s.firstName,
        s.lastName,
        s.code                                                    AS studentCode,
        SUM(CAST(i.totalAmount   AS FLOAT))                      AS totalInvoiced,
        SUM(CAST(i.paidAmount    AS FLOAT))                      AS totalPaid,
        SUM(CAST(i.balanceAmount AS FLOAT))                      AS outstandingBalance,
        SUM(CASE WHEN i.dueDate < GETDATE() OR i.status = 'OVERDUE'
              THEN CAST(i.balanceAmount AS FLOAT) ELSE 0 END)    AS overdueBalance,
        COUNT(i.id)                                              AS invoiceCount,
        MAX(CASE WHEN i.dueDate < GETDATE()
              THEN DATEDIFF(day, i.dueDate, GETDATE()) ELSE 0 END) AS longestOverdueDays
      FROM invoices i
      INNER JOIN students s ON s.id = i.studentId
        AND s.organizationId = i.organizationId
        AND s.deletedAt IS NULL
      ${whereFragment}
      GROUP BY i.studentId, s.firstName, s.lastName, s.code
      ORDER BY ${orderByExpr}
      OFFSET ${skip} ROWS FETCH NEXT ${pageSize} ROWS ONLY
    `),
    db.$queryRaw<[{ total: bigint }]>(Prisma.sql`
      SELECT COUNT(*) AS total
      FROM (
        SELECT i.studentId
        FROM invoices i
        INNER JOIN students s ON s.id = i.studentId
          AND s.organizationId = i.organizationId
          AND s.deletedAt IS NULL
        ${whereFragment}
        GROUP BY i.studentId
      ) AS cnt
    `),
  ]);

  const total = Number(countResult[0]?.total ?? 0);

  if (rawRows.length === 0) return { rows: [], total };

  const studentIds = rawRows.map((r) => r.studentId);

  // Single batched fetch for course + branch names (bounded to pageSize students)
  const enrichFilter: Prisma.InvoiceWhereInput = {
    organizationId: filters.organizationId,
    studentId: { in: studentIds },
    deletedAt: null,
    status: { notIn: ["CANCELLED", "PAID"] },
    balanceAmount: { gt: 0 },
    ...(filters.courseId || filters.academicYearId || filters.academicTermId
      ? {
          enrollment: {
            ...(filters.courseId && { courseId: filters.courseId }),
            ...(filters.academicYearId && { academicYearId: filters.academicYearId }),
            ...(filters.academicTermId && { academicTermId: filters.academicTermId }),
          },
        }
      : {}),
  };

  const enrichInvoices = await db.invoice.findMany({
    where: enrichFilter,
    select: {
      studentId: true,
      branch: { select: { name: true } },
      enrollment: { select: { course: { select: { name: true } } } },
    },
  });

  const coursesByStudent = new Map<string, Set<string>>();
  const branchesByStudent = new Map<string, Set<string>>();

  for (const inv of enrichInvoices) {
    if (!inv.studentId) continue;
    const courseName = inv.enrollment?.course?.name;
    const branchName = inv.branch?.name;

    if (courseName) {
      if (!coursesByStudent.has(inv.studentId)) coursesByStudent.set(inv.studentId, new Set());
      coursesByStudent.get(inv.studentId)!.add(courseName);
    }
    if (branchName) {
      if (!branchesByStudent.has(inv.studentId)) branchesByStudent.set(inv.studentId, new Set());
      branchesByStudent.get(inv.studentId)!.add(branchName);
    }
  }

  const rows: StudentDebtRow[] = rawRows.map((r) => ({
    studentId: r.studentId,
    studentName: `${r.firstName} ${r.lastName}`,
    studentCode: r.studentCode,
    courseNames: Array.from(coursesByStudent.get(r.studentId) ?? []),
    branchNames: Array.from(branchesByStudent.get(r.studentId) ?? []),
    totalInvoiced: r.totalInvoiced,
    totalPaid: r.totalPaid,
    outstandingBalance: r.outstandingBalance,
    overdueBalance: r.overdueBalance,
    invoiceCount: Number(r.invoiceCount),
    longestOverdueDays: r.longestOverdueDays,
  }));

  return { rows, total };
}
