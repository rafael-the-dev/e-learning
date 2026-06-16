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

export async function getRefundsReportKPIs(
  filters: Omit<RefundsReportFilters, "page" | "pageSize">
): Promise<{ kpis: RefundsReportKPIs; methodBreakdown: Array<{ method: string; count: number; totalAmount: number }>; monthlyTrend: RefundMonthlyPoint[] }> {
  const db = await getDb();
  const baseWhere = buildRefundWhere({ ...filters, refundStatus: undefined });

  const all = await db.refund.findMany({
    where: baseWhere,
    select: { status: true, refundMethod: true, amount: true, createdAt: true, completedAt: true },
  });

  let totalRefunded = 0;
  let refundCount = 0;
  let pendingRefunds = 0;
  let approvedNotCompleted = 0;
  let cashReturns = 0;
  let walletCreditRefunds = 0;

  const methodMap = new Map<string, { count: number; total: number }>();
  const monthMap = new Map<string, { count: number; total: number }>();

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

      // Monthly trend uses createdAt (same axis as the KPI date filter) so that
      // the chart totals reconcile against the KPI totalRefunded for any given period.
      const monthKey = `${r.createdAt.getFullYear()}-${String(r.createdAt.getMonth() + 1).padStart(2, "0")}`;
      const monthEntry = monthMap.get(monthKey) ?? { count: 0, total: 0 };
      monthEntry.count++;
      monthEntry.total += amt;
      monthMap.set(monthKey, monthEntry);
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

  const monthlyTrend = Array.from(monthMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, { count, total }]) => ({ month, count, totalAmount: total }));

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
