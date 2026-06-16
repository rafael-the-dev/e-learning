import { getDb } from "@/server/db";
import type { StudentDebtFilters, StudentDebtKPIs, StudentDebtRow } from "../types";

type DecimalLike = { toNumber(): number };

function toNum(v: DecimalLike | number | null | undefined): number {
  if (v == null) return 0;
  return typeof v === "object" ? v.toNumber() : v;
}

function calcDaysOverdue(dueDate: Date | null, today: Date): number {
  if (!dueDate) return 0;
  return Math.max(0, Math.floor((today.getTime() - dueDate.getTime()) / 86_400_000));
}

function buildDebtWhere(filters: StudentDebtFilters) {
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

  if (filters.dueDateFrom || filters.dueDateTo) {
    where.dueDate = where.dueDate ?? {};
    if (filters.dueDateFrom) where.dueDate.gte = new Date(filters.dueDateFrom);
    if (filters.dueDateTo) where.dueDate.lte = new Date(filters.dueDateTo);
  }

  if (filters.dateFrom || filters.dateTo) {
    where.issueDate = {};
    if (filters.dateFrom) where.issueDate.gte = new Date(filters.dateFrom);
    if (filters.dateTo) where.issueDate.lte = new Date(filters.dateTo);
  }

  if (filters.minBalance) where.balanceAmount = { ...where.balanceAmount, gte: filters.minBalance };

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
  const where = buildDebtWhere(filters);

  const [totalAgg, overdueAgg, byStudent] = await Promise.all([
    db.invoice.aggregate({
      where,
      _sum: { balanceAmount: true },
    }),
    db.invoice.aggregate({
      where: { ...where, dueDate: { lt: today } },
      _sum: { balanceAmount: true },
    }),
    db.invoice.groupBy({
      by: ["studentId"],
      where: { ...where, studentId: { not: null } },
      _sum: { balanceAmount: true },
      _max: { dueDate: true },
      orderBy: { _sum: { balanceAmount: "desc" } },
    }),
  ]);

  const largestDebtorBalance = byStudent.length > 0
    ? toNum(byStudent[0]._sum.balanceAmount as DecimalLike)
    : 0;

  // compute longest overdue from the per-student max dueDate
  let longestOverdueDays = 0;
  for (const row of byStudent) {
    const days = calcDaysOverdue(row._max.dueDate ?? null, today);
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

const DEBT_INVOICE_SELECT = {
  totalAmount: true,
  paidAmount: true,
  balanceAmount: true,
  dueDate: true,
  studentId: true,
  branchId: true,
  student: { select: { id: true, firstName: true, lastName: true, code: true } },
  branch: { select: { name: true } },
  enrollment: { select: { course: { select: { name: true } } } },
} as const;

export async function listStudentDebtRows(
  filters: StudentDebtFilters
): Promise<{ rows: StudentDebtRow[]; total: number }> {
  const db = await getDb();
  const today = new Date();
  const where = buildDebtWhere(filters);

  const rawRows = await db.invoice.findMany({
    where,
    select: DEBT_INVOICE_SELECT,
  });

  // Group by student in memory
  const studentMap = new Map<string, StudentDebtRow>();

  for (const inv of rawRows) {
    if (!inv.studentId || !inv.student) continue;
    const key = inv.studentId;
    const bal = toNum(inv.balanceAmount as DecimalLike);
    const daysOverdue = calcDaysOverdue(inv.dueDate, today);
    const courseName = inv.enrollment?.course?.name ?? null;
    const branchName = inv.branch?.name ?? null;

    const existing = studentMap.get(key);
    if (!existing) {
      studentMap.set(key, {
        studentId: key,
        studentName: `${inv.student.firstName} ${inv.student.lastName}`,
        studentCode: inv.student.code ?? null,
        courseNames: courseName ? [courseName] : [],
        branchNames: branchName ? [branchName] : [],
        totalInvoiced: toNum(inv.totalAmount as DecimalLike),
        totalPaid: toNum(inv.paidAmount as DecimalLike),
        outstandingBalance: bal,
        overdueBalance: daysOverdue > 0 ? bal : 0,
        invoiceCount: 1,
        longestOverdueDays: daysOverdue,
      });
    } else {
      existing.totalInvoiced += toNum(inv.totalAmount as DecimalLike);
      existing.totalPaid += toNum(inv.paidAmount as DecimalLike);
      existing.outstandingBalance += bal;
      if (daysOverdue > 0) existing.overdueBalance += bal;
      existing.invoiceCount++;
      if (courseName && !existing.courseNames.includes(courseName)) {
        existing.courseNames.push(courseName);
      }
      if (branchName && !existing.branchNames.includes(branchName)) {
        existing.branchNames.push(branchName);
      }
      if (daysOverdue > existing.longestOverdueDays) {
        existing.longestOverdueDays = daysOverdue;
      }
    }
  }

  // Sort by outstanding balance DESC (default for collections view)
  const sorted = Array.from(studentMap.values()).sort(
    (a, b) => b.outstandingBalance - a.outstandingBalance
  );

  const total = sorted.length;
  const skip = (filters.page - 1) * filters.pageSize;
  const rows = sorted.slice(skip, skip + filters.pageSize);

  return { rows, total };
}
