import { Prisma } from "@prisma/client";
import { getDb } from "@/server/db";
import type {
  RefundsReportFilters,
  RefundsReportKPIs,
  RefundsReportRow,
  RefundMonthlyPoint,
} from "../types";

type DecimalLike = { toNumber(): number };

function toNum(v: DecimalLike | number | null | undefined): number {
  if (v == null) return 0;
  return typeof v === "object" ? v.toNumber() : v;
}

function buildRefundWhere(filters: Omit<RefundsReportFilters, "page" | "pageSize">) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = {
    organizationId: filters.organizationId,
    deletedAt: null,
  };

  if (filters.refundMethod) where.refundMethod = filters.refundMethod;
  if (filters.refundStatus) where.status = filters.refundStatus;
  if (filters.studentId) where.studentId = filters.studentId;
  if (filters.branchId) {
    where.branchId = filters.branchId;
  }

  if (filters.dateFrom || filters.dateTo) {
    where.createdAt = {};
    if (filters.dateFrom) where.createdAt.gte = new Date(filters.dateFrom);
    if (filters.dateTo) where.createdAt.lte = new Date(filters.dateTo);
  }

  if (filters.search) {
    where.OR = [
      { refundNumber: { contains: filters.search } },
      { student: { firstName: { contains: filters.search } } },
      { student: { lastName: { contains: filters.search } } },
    ];
  }

  return where;
}

// Monthly trend — SQL-side GROUP BY so it never loads raw refund rows just to bucket
// them by month. Always restricted to COMPLETED refunds (refundStatus filter is ignored)
// to match the KPI's totalRefunded basis, using createdAt as the date axis.
export async function getRefundsMonthlyTrend(
  filters: Omit<RefundsReportFilters, "page" | "pageSize">
): Promise<RefundMonthlyPoint[]> {
  const db = await getDb();

  const clauses: Prisma.Sql[] = [
    Prisma.sql`r.organizationId = ${filters.organizationId}`,
    Prisma.sql`r.deletedAt IS NULL`,
    Prisma.sql`r.status = 'COMPLETED'`,
  ];
  if (filters.refundMethod) clauses.push(Prisma.sql`r.refundMethod = ${filters.refundMethod}`);
  if (filters.studentId) clauses.push(Prisma.sql`r.studentId = ${filters.studentId}`);
  if (filters.branchId) clauses.push(Prisma.sql`r.branchId = ${filters.branchId}`);
  if (filters.dateFrom) clauses.push(Prisma.sql`r.createdAt >= ${new Date(filters.dateFrom)}`);
  if (filters.dateTo) clauses.push(Prisma.sql`r.createdAt <= ${new Date(filters.dateTo)}`);
  if (filters.search) {
    const escaped = filters.search.replace(/[%_[\]]/g, "\\$&");
    const term = `%${escaped}%`;
    clauses.push(Prisma.sql`(
      r.refundNumber LIKE ${term} ESCAPE '\\'
      OR st.firstName LIKE ${term} ESCAPE '\\'
      OR st.lastName  LIKE ${term} ESCAPE '\\'
    )`);
  }

  const rows = await db.$queryRaw<{ month: string; count: number | bigint; total: number }[]>(Prisma.sql`
    SELECT
      CONVERT(VARCHAR(7), r.createdAt, 120)   AS month,
      COUNT(*)                                AS count,
      ISNULL(SUM(CAST(r.amount AS FLOAT)), 0) AS total
    FROM refunds r
    LEFT JOIN students st ON st.id = r.studentId
    WHERE ${Prisma.join(clauses, " AND ")}
    GROUP BY CONVERT(VARCHAR(7), r.createdAt, 120)
    ORDER BY month ASC
  `);

  return rows.map((r) => ({ month: r.month, count: Number(r.count), totalAmount: r.total }));
}

export async function getRefundsReportKPIs(
  filters: Omit<RefundsReportFilters, "page" | "pageSize">
): Promise<{ kpis: RefundsReportKPIs; methodBreakdown: Array<{ method: string; count: number; totalAmount: number }>; monthlyTrend: RefundMonthlyPoint[] }> {
  const db = await getDb();
  const baseWhere = buildRefundWhere({ ...filters, refundStatus: undefined });

  const [all, monthlyTrend] = await Promise.all([
    db.refund.findMany({
      where: baseWhere,
      select: { status: true, refundMethod: true, amount: true, createdAt: true, completedAt: true },
    }),
    getRefundsMonthlyTrend(filters),
  ]);

  let totalRefunded = 0;
  let refundCount = 0;
  let pendingRefunds = 0;
  let approvedNotCompleted = 0;
  let cashReturns = 0;
  let walletCreditRefunds = 0;

  const methodMap = new Map<string, { count: number; total: number }>();

  for (const r of all) {
    const amt = toNum(r.amount as DecimalLike);

    if (r.status === "COMPLETED") {
      totalRefunded += amt;
      refundCount++;
      if (r.refundMethod === "CASH_RETURN") cashReturns++;
      else walletCreditRefunds++;

      const existing = methodMap.get(r.refundMethod) ?? { count: 0, total: 0 };
      existing.count++;
      existing.total += amt;
      methodMap.set(r.refundMethod, existing);
    } else if (r.status === "REQUESTED") {
      pendingRefunds++;
    } else if (r.status === "APPROVED") {
      approvedNotCompleted++;
    }
  }

  const kpis: RefundsReportKPIs = {
    totalRefunded,
    refundCount,
    pendingRefunds,
    approvedNotCompleted,
    cashReturns,
    walletCreditRefunds,
  };

  const methodBreakdown = Array.from(methodMap.entries()).map(([method, { count, total }]) => ({
    method,
    count,
    totalAmount: total,
  }));

  return { kpis, methodBreakdown, monthlyTrend };
}

export async function listRefundsReport(
  filters: RefundsReportFilters
): Promise<{ rows: RefundsReportRow[]; total: number }> {
  const db = await getDb();
  const where = buildRefundWhere(filters);
  const skip = (filters.page - 1) * filters.pageSize;

  const [rawRows, total] = await Promise.all([
    db.refund.findMany({
      where,
      skip,
      take: filters.pageSize,
      orderBy: [{ createdAt: "desc" }],
      select: {
        id: true,
        refundNumber: true,
        studentId: true,
        paymentId: true,
        branchId: true,
        amount: true,
        refundMethod: true,
        status: true,
        reason: true,
        createdAt: true,
        completedAt: true,
        approvedBy: true,
        student: { select: { firstName: true, lastName: true } },
        branch: { select: { name: true } },
        payment: {
          select: {
            paymentNumber: true,
            receipt: { select: { id: true, receiptNumber: true } },
          },
        },
      },
    }),
    db.refund.count({ where }),
  ]);

  const rows: RefundsReportRow[] = rawRows.map((r) => ({
    refundId: r.id,
    refundNumber: r.refundNumber,
    studentId: r.studentId,
    studentName: r.student ? `${r.student.firstName} ${r.student.lastName}` : null,
    paymentId: r.paymentId,
    paymentNumber: r.payment?.paymentNumber ?? null,
    receiptId: r.payment?.receipt?.id ?? null,
    receiptNumber: r.payment?.receipt?.receiptNumber ?? null,
    amount: toNum(r.amount as DecimalLike),
    refundMethod: r.refundMethod,
    status: r.status,
    reason: r.reason,
    requestedAt: r.createdAt,
    completedAt: r.completedAt,
    branchId: r.branchId,
    branchName: r.branch?.name ?? null,
    approvedBy: r.approvedBy,
  }));

  return { rows, total };
}
