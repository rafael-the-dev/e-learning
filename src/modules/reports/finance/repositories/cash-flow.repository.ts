import { getDb } from "@/server/db";
import type {
  CashFlowFilters,
  CashFlowKPIs,
  CashFlowMonthlyPoint,
  CashFlowEntry,
} from "../types";
import { CASH_FLOW_INCLUDED_TYPES } from "../types";

type DecimalLike = { toNumber(): number };

function toNum(v: DecimalLike | number | null | undefined): number {
  if (v == null) return 0;
  return typeof v === "object" ? v.toNumber() : v;
}

function buildWhere(filters: CashFlowFilters) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = {
    organizationId: filters.organizationId,
    transactionType: { in: [...CASH_FLOW_INCLUDED_TYPES] },
  };

  if (filters.studentId) where.studentId = filters.studentId;

  if (filters.dateFrom || filters.dateTo) {
    where.occurredAt = {};
    if (filters.dateFrom) where.occurredAt.gte = new Date(filters.dateFrom);
    if (filters.dateTo) {
      const end = new Date(filters.dateTo);
      end.setHours(23, 59, 59, 999);
      where.occurredAt.lte = end;
    }
  }

  return where;
}

export async function getCashFlowKPIs(
  filters: CashFlowFilters
): Promise<{ kpis: CashFlowKPIs; monthlyTrend: CashFlowMonthlyPoint[] }> {
  const db = await getDb();
  const where = buildWhere(filters);

  const entries = await db.financialTransaction.findMany({
    where,
    select: { transactionType: true, amount: true, occurredAt: true },
  });

  let totalCashIn = 0;
  let totalCancellations = 0;
  let totalRefunds = 0;
  let paymentCount = 0;
  let cancellationCount = 0;
  let refundCount = 0;

  const monthMap = new Map<string, { cashIn: number; cashOut: number }>();

  for (const e of entries) {
    const amt = toNum(e.amount as DecimalLike);
    const monthKey = `${e.occurredAt.getFullYear()}-${String(e.occurredAt.getMonth() + 1).padStart(2, "0")}`;
    const month = monthMap.get(monthKey) ?? { cashIn: 0, cashOut: 0 };

    if (e.transactionType === "PAYMENT_RECEIVED") {
      totalCashIn += amt;
      paymentCount++;
      month.cashIn += amt;
    } else if (e.transactionType === "PAYMENT_CANCELLED") {
      totalCancellations += amt;
      cancellationCount++;
      month.cashOut += amt;
    } else if (e.transactionType === "REFUND_DISBURSED") {
      totalRefunds += amt;
      refundCount++;
      month.cashOut += amt;
    }

    monthMap.set(monthKey, month);
  }

  const kpis: CashFlowKPIs = {
    totalCashIn,
    totalCancellations,
    totalRefunds,
    netCashFlow: totalCashIn - totalCancellations - totalRefunds,
    paymentCount,
    cancellationCount,
    refundCount,
  };

  const monthlyTrend: CashFlowMonthlyPoint[] = Array.from(monthMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, { cashIn, cashOut }]) => ({
      month,
      cashIn,
      cashOut,
      net: cashIn - cashOut,
    }));

  return { kpis, monthlyTrend };
}

export async function listCashFlowEntries(
  filters: CashFlowFilters & { page: number; pageSize: number }
): Promise<{ entries: CashFlowEntry[]; total: number }> {
  const db = await getDb();
  const where = buildWhere(filters);
  const skip = (filters.page - 1) * filters.pageSize;

  const [rawRows, total] = await Promise.all([
    db.financialTransaction.findMany({
      where,
      skip,
      take: filters.pageSize,
      orderBy: { occurredAt: "desc" },
      select: {
        id: true,
        transactionNumber: true,
        transactionType: true,
        direction: true,
        amount: true,
        description: true,
        occurredAt: true,
        studentId: true,
        paymentId: true,
        refundId: true,
      },
    }),
    db.financialTransaction.count({ where }),
  ]);

  const entries: CashFlowEntry[] = rawRows.map((r) => ({
    id: r.id,
    transactionNumber: r.transactionNumber,
    transactionType: r.transactionType,
    direction: r.direction,
    amount: toNum(r.amount as DecimalLike),
    description: r.description,
    occurredAt: r.occurredAt,
    studentId: r.studentId,
    paymentId: r.paymentId,
    refundId: r.refundId,
  }));

  return { entries, total };
}
