import { getDb } from "@/server/db";
import type {
  AccountsReceivableFilters,
  AccountsReceivableKPIs,
  AccountsReceivableRow,
  AgingBucket,
} from "../types";

type DecimalLike = { toNumber(): number };

function toNum(v: DecimalLike | number | null | undefined): number {
  if (v == null) return 0;
  return typeof v === "object" ? v.toNumber() : v;
}

function calcAgingBucket(dueDate: Date | null, today: Date): AgingBucket {
  if (!dueDate) return "current";
  const days = Math.floor((today.getTime() - dueDate.getTime()) / 86_400_000);
  if (days <= 0) return "current";
  if (days <= 30) return "1-30";
  if (days <= 60) return "31-60";
  if (days <= 90) return "61-90";
  return "90+";
}

function calcDaysOverdue(dueDate: Date | null, today: Date): number {
  if (!dueDate) return 0;
  const days = Math.floor((today.getTime() - dueDate.getTime()) / 86_400_000);
  return Math.max(0, days);
}

export async function getAccountsReceivableKPIs(
  filters: Pick<AccountsReceivableFilters, "organizationId" | "branchId" | "courseId" | "studentId" | "dueDateFrom" | "dueDateTo" | "dateFrom" | "dateTo" | "academicYearId" | "academicTermId">
): Promise<AccountsReceivableKPIs> {
  const db = await getDb();
  const today = new Date();

  const where = buildInvoiceWhere(filters);

  const [rows, studentCount] = await Promise.all([
    db.invoice.findMany({
      where,
      select: {
        balanceAmount: true,
        dueDate: true,
        status: true,
        studentId: true,
      },
    }),
    db.invoice.groupBy({
      by: ["studentId"],
      where,
      _count: { studentId: true },
    }),
  ]);

  let totalReceivable = 0;
  let overdueReceivable = 0;
  let dueSoon = 0;
  let partiallyPaid = 0;

  for (const row of rows) {
    const bal = toNum(row.balanceAmount as DecimalLike);
    totalReceivable += bal;
    const daysOverdue = calcDaysOverdue(row.dueDate, today);
    if (daysOverdue > 0) overdueReceivable += bal;
    else if (row.dueDate) {
      const daysUntilDue = Math.floor((row.dueDate.getTime() - today.getTime()) / 86_400_000);
      if (daysUntilDue <= 7) dueSoon += bal;
    }
    if (row.status === "PARTIALLY_PAID") partiallyPaid++;
  }

  return {
    totalReceivable,
    overdueReceivable,
    dueSoon,
    partiallyPaid,
    studentsWithDebt: studentCount.filter((r) => r.studentId !== null).length,
    invoiceCount: rows.length,
  };
}

function buildInvoiceWhere(
  filters: Pick<AccountsReceivableFilters, "organizationId" | "branchId" | "courseId" | "studentId" | "dueDateFrom" | "dueDateTo" | "dateFrom" | "dateTo" | "academicYearId" | "academicTermId" | "invoiceStatus" | "agingBucket" | "search">
) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = {
    organizationId: filters.organizationId,
    balanceAmount: { gt: 0 },
    status: { notIn: ["CANCELLED", "PAID"] },
    deletedAt: null,
  };

  if (filters.branchId) where.branchId = filters.branchId;
  if (filters.studentId) where.studentId = filters.studentId;
  if (filters.invoiceStatus) where.status = filters.invoiceStatus;

  if (filters.dateFrom || filters.dateTo) {
    where.issueDate = {};
    if (filters.dateFrom) where.issueDate.gte = new Date(filters.dateFrom);
    if (filters.dateTo) where.issueDate.lte = new Date(filters.dateTo);
  }

  if (filters.dueDateFrom || filters.dueDateTo) {
    where.dueDate = {};
    if (filters.dueDateFrom) where.dueDate.gte = new Date(filters.dueDateFrom);
    if (filters.dueDateTo) where.dueDate.lte = new Date(filters.dueDateTo);
  }

  // Invoice.enrollment is a nullable to-one relation — use direct field filters, not `some`.
  const enrollmentFilter: Record<string, unknown> = {};
  if (filters.courseId) enrollmentFilter.courseId = filters.courseId;
  if (filters.academicYearId) enrollmentFilter.academicYearId = filters.academicYearId;
  if (filters.academicTermId) enrollmentFilter.academicTermId = filters.academicTermId;
  if (Object.keys(enrollmentFilter).length > 0) where.enrollment = enrollmentFilter;

  if (filters.search) {
    where.OR = [
      { invoiceNumber: { contains: filters.search } },
      { student: { firstName: { contains: filters.search } } },
      { student: { lastName: { contains: filters.search } } },
    ];
  }

  return where;
}

const AR_INVOICE_SELECT = {
  id: true,
  invoiceNumber: true,
  issueDate: true,
  dueDate: true,
  totalAmount: true,
  paidAmount: true,
  balanceAmount: true,
  status: true,
  studentId: true,
  branchId: true,
  enrollmentId: true,
  student: { select: { firstName: true, lastName: true } },
  branch: { select: { name: true } },
  enrollment: {
    select: {
      enrollmentNumber: true,
      id: true,
      course: { select: { id: true, name: true } },
    },
  },
} as const;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapArRow(r: any, today: Date): AccountsReceivableRow {
  return {
    invoiceId: r.id,
    invoiceNumber: r.invoiceNumber,
    studentId: r.studentId,
    studentName: r.student ? `${r.student.firstName} ${r.student.lastName}` : null,
    enrollmentId: r.enrollmentId,
    enrollmentNumber: r.enrollment?.enrollmentNumber ?? null,
    courseId: r.enrollment?.course?.id ?? null,
    courseName: r.enrollment?.course?.name ?? null,
    branchId: r.branchId,
    branchName: r.branch?.name ?? null,
    issueDate: r.issueDate,
    dueDate: r.dueDate,
    totalAmount: toNum(r.totalAmount as DecimalLike),
    paidAmount: toNum(r.paidAmount as DecimalLike),
    balanceAmount: toNum(r.balanceAmount as DecimalLike),
    status: r.status,
    daysOverdue: calcDaysOverdue(r.dueDate, today),
    agingBucket: calcAgingBucket(r.dueDate, today),
  };
}

export async function listAccountsReceivable(
  filters: AccountsReceivableFilters
): Promise<{ rows: AccountsReceivableRow[]; total: number }> {
  const db = await getDb();
  const today = new Date();
  const where = buildInvoiceWhere(filters);
  const skip = (filters.page - 1) * filters.pageSize;
  const orderBy = [{ dueDate: "asc" as const }, { balanceAmount: "desc" as const }];

  if (filters.agingBucket) {
    // Aging bucket is computed from dueDate at runtime — cannot be pushed to the DB query.
    // Fetch all matching rows, apply bucket filter in memory, then slice for the requested page.
    const allRaw = await db.invoice.findMany({ where, orderBy, select: AR_INVOICE_SELECT });
    const allMapped = allRaw.map((r) => mapArRow(r, today));
    const filtered = allMapped.filter((r) => r.agingBucket === filters.agingBucket);
    return { rows: filtered.slice(skip, skip + filters.pageSize), total: filtered.length };
  }

  const [rawRows, total] = await Promise.all([
    db.invoice.findMany({ where, skip, take: filters.pageSize, orderBy, select: AR_INVOICE_SELECT }),
    db.invoice.count({ where }),
  ]);

  return { rows: rawRows.map((r) => mapArRow(r, today)), total };
}
