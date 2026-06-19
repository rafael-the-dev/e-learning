import { Prisma } from "@prisma/client";
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

// Monthly trend — SQL-side GROUP BY so it never loads raw transaction rows just to
// bucket them by month. PAYMENT_RECEIVED is cash-in; PAYMENT_CANCELLED and
// REFUND_DISBURSED are cash-out — same split as the KPI loop below.
export async function getCashFlowMonthlyTrend(filters: CashFlowFilters): Promise<CashFlowMonthlyPoint[]> {
  const db = await getDb();

  const clauses: Prisma.Sql[] = [
    Prisma.sql`t.organizationId = ${filters.organizationId}`,
    Prisma.sql`t.transactionType IN (${Prisma.join([...CASH_FLOW_INCLUDED_TYPES])})`,
  ];
  if (filters.studentId) clauses.push(Prisma.sql`t.studentId = ${filters.studentId}`);
  if (filters.dateFrom) clauses.push(Prisma.sql`t.occurredAt >= ${new Date(filters.dateFrom)}`);
  if (filters.dateTo) {
    const end = new Date(filters.dateTo);
    end.setHours(23, 59, 59, 999);
    clauses.push(Prisma.sql`t.occurredAt <= ${end}`);
  }

  const rows = await db.$queryRaw<{ month: string; cashIn: number; cashOut: number }[]>(Prisma.sql`
    SELECT
      CONVERT(VARCHAR(7), t.occurredAt, 120) AS month,
      ISNULL(SUM(CASE WHEN t.transactionType = 'PAYMENT_RECEIVED'
        THEN CAST(t.amount AS FLOAT) ELSE 0 END), 0) AS cashIn,
      ISNULL(SUM(CASE WHEN t.transactionType IN ('PAYMENT_CANCELLED', 'REFUND_DISBURSED')
        THEN CAST(t.amount AS FLOAT) ELSE 0 END), 0) AS cashOut
    FROM financial_transactions t
    WHERE ${Prisma.join(clauses, " AND ")}
    GROUP BY CONVERT(VARCHAR(7), t.occurredAt, 120)
    ORDER BY month ASC
  `);

  return rows.map((r) => ({ month: r.month, cashIn: r.cashIn, cashOut: r.cashOut, net: r.cashIn - r.cashOut }));
}

export async function getCashFlowKPIs(
  filters: CashFlowFilters
): Promise<{ kpis: CashFlowKPIs; monthlyTrend: CashFlowMonthlyPoint[] }> {
  const db = await getDb();
  const where = buildWhere(filters);

  const [entries, monthlyTrend] = await Promise.all([
    db.financialTransaction.findMany({
      where,
      select: { transactionType: true, amount: true, occurredAt: true },
    }),
    getCashFlowMonthlyTrend(filters),
  ]);

  let totalCashIn = 0;
  let totalCancellations = 0;
  let totalRefunds = 0;
  let paymentCount = 0;
  let cancellationCount = 0;
  let refundCount = 0;

  for (const e of entries) {
    const amt = toNum(e.amount as DecimalLike);

    if (e.transactionType === "PAYMENT_RECEIVED") {
      totalCashIn += amt;
      paymentCount++;
    } else if (e.transactionType === "PAYMENT_CANCELLED") {
      totalCancellations += amt;
      cancellationCount++;
    } else if (e.transactionType === "REFUND_DISBURSED") {
      totalRefunds += amt;
      refundCount++;
    }
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
