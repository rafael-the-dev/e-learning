import { getDb } from "@/server/db";
import type { CollectionsFilters, CollectionsKPIs, CollectionsRow } from "../types";

type DecimalLike = { toNumber(): number };

function toNum(v: DecimalLike | number | null | undefined): number {
  if (v == null) return 0;
  return typeof v === "object" ? v.toNumber() : v;
}

function calcDaysOverdue(dueDate: Date, today: Date): number {
  return Math.max(0, Math.floor((today.getTime() - dueDate.getTime()) / 86_400_000));
}

function buildCollectionsWhere(filters: CollectionsFilters, today: Date) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = { organizationId: filters.organizationId };

  if (filters.installmentStatus) {
    where.status = filters.installmentStatus;
  } else {
    where.status = { in: ["PENDING", "PARTIALLY_PAID", "OVERDUE"] };
  }

  // Branch / course / student filter via nested paymentPlan.invoice
  const invoiceWhere: Record<string, unknown> = {};
  if (filters.branchId) invoiceWhere.branchId = filters.branchId;
  if (filters.studentId) invoiceWhere.studentId = filters.studentId;
  if (filters.courseId) invoiceWhere.enrollment = { courseId: filters.courseId };
  if (Object.keys(invoiceWhere).length > 0) {
    where.paymentPlan = { invoice: invoiceWhere };
  }

  // daysOverdue range → converted to dueDate range
  if (filters.minDaysOverdue != null) {
    const cutoff = new Date(today.getTime() - filters.minDaysOverdue * 86_400_000);
    where.dueDate = { ...(where.dueDate ?? {}), lte: cutoff };
  }
  if (filters.maxDaysOverdue != null) {
    const cutoff = new Date(today.getTime() - filters.maxDaysOverdue * 86_400_000);
    where.dueDate = { ...(where.dueDate ?? {}), gte: cutoff };
  }

  if (filters.dueDateFrom || filters.dueDateTo) {
    where.dueDate = where.dueDate ?? {};
    if (filters.dueDateFrom) where.dueDate.gte = new Date(filters.dueDateFrom);
    if (filters.dueDateTo) {
      const end = new Date(filters.dueDateTo);
      end.setHours(23, 59, 59, 999);
      where.dueDate.lte = end;
    }
  }

  // Search by student name or invoice number via nested path
  if (filters.search) {
    where.paymentPlan = {
      ...(where.paymentPlan ?? {}),
      invoice: {
        ...(where.paymentPlan?.invoice ?? {}),
        OR: [
          { invoiceNumber: { contains: filters.search } },
          { student: { firstName: { contains: filters.search } } },
          { student: { lastName: { contains: filters.search } } },
        ],
      },
    };
  }

  return where;
}

export async function getCollectionsKPIs(
  filters: CollectionsFilters
): Promise<CollectionsKPIs> {
  const db = await getDb();
  const today = new Date();

  const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0, 23, 59, 59, 999);
  const endOfWeek = new Date(today.getTime() + 7 * 86_400_000);

  const baseOrgWhere = { organizationId: filters.organizationId };

  const [overdueAgg, overdueRows, dueThisWeek, dueThisMonth] = await Promise.all([
    db.installment.aggregate({
      where: { ...baseOrgWhere, status: "OVERDUE" },
      _sum: { balanceAmount: true },
      _count: { id: true },
    }),
    db.installment.findMany({
      where: { ...baseOrgWhere, status: "OVERDUE" },
      select: { dueDate: true },
    }),
    db.installment.count({
      where: {
        ...baseOrgWhere,
        status: { in: ["PENDING", "PARTIALLY_PAID"] },
        dueDate: { gte: today, lte: endOfWeek },
      },
    }),
    db.installment.count({
      where: {
        ...baseOrgWhere,
        status: { in: ["PENDING", "PARTIALLY_PAID"] },
        dueDate: { gte: startOfMonth, lte: endOfMonth },
      },
    }),
  ]);

  let totalOverdueDays = 0;
  for (const row of overdueRows) {
    totalOverdueDays += calcDaysOverdue(row.dueDate, today);
  }
  const overdueCount = overdueAgg._count.id;
  const averageDaysOverdue = overdueCount > 0 ? Math.round(totalOverdueDays / overdueCount) : 0;

  return {
    overdueInstallments: overdueCount,
    overdueAmount: toNum(overdueAgg._sum.balanceAmount as DecimalLike),
    averageDaysOverdue,
    dueThisWeek,
    dueThisMonth,
  };
}

const INSTALLMENT_SELECT = {
  id: true,
  invoiceId: true,
  installmentNumber: true,
  dueDate: true,
  amount: true,
  paidAmount: true,
  balanceAmount: true,
  status: true,
  paymentPlan: {
    select: {
      id: true,
      name: true,
      invoice: {
        select: {
          invoiceNumber: true,
          studentId: true,
          branchId: true,
          student: { select: { firstName: true, lastName: true } },
          branch: { select: { name: true } },
          enrollment: { select: { course: { select: { name: true } } } },
        },
      },
    },
  },
} as const;

export async function listCollectionsRows(
  filters: CollectionsFilters
): Promise<{ rows: CollectionsRow[]; total: number }> {
  const db = await getDb();
  const today = new Date();
  const where = buildCollectionsWhere(filters, today);
  const skip = (filters.page - 1) * filters.pageSize;

  const [rawRows, total] = await Promise.all([
    db.installment.findMany({
      where,
      skip,
      take: filters.pageSize,
      orderBy: [{ dueDate: "asc" }, { status: "asc" }],
      select: INSTALLMENT_SELECT,
    }),
    db.installment.count({ where }),
  ]);

  const rows: CollectionsRow[] = rawRows.map((r) => {
    const inv = r.paymentPlan.invoice;
    return {
      installmentId: r.id,
      studentId: inv.studentId,
      studentName: inv.student ? `${inv.student.firstName} ${inv.student.lastName}` : null,
      invoiceId: r.invoiceId,
      invoiceNumber: inv.invoiceNumber,
      paymentPlanId: r.paymentPlan.id,
      paymentPlanName: r.paymentPlan.name,
      courseName: inv.enrollment?.course?.name ?? null,
      branchName: inv.branch?.name ?? null,
      installmentNumber: r.installmentNumber,
      dueDate: r.dueDate,
      amount: toNum(r.amount as DecimalLike),
      paidAmount: toNum(r.paidAmount as DecimalLike),
      balanceAmount: toNum(r.balanceAmount as DecimalLike),
      daysOverdue: calcDaysOverdue(r.dueDate, today),
      status: r.status,
    };
  });

  return { rows, total };
}
