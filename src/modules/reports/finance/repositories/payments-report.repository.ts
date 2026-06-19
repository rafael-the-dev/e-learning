import { Prisma } from "@prisma/client";
import { getDb } from "@/server/db";
import type {
  PaymentsReportFilters,
  PaymentsReportKPIs,
  PaymentsReportRow,
  PaymentMethodBreakdown,
  PaymentMonthlyPoint,
} from "../types";

type DecimalLike = { toNumber(): number };

function toNum(v: DecimalLike | number | null | undefined): number {
  if (v == null) return 0;
  return typeof v === "object" ? v.toNumber() : v;
}

function buildPaymentWhere(
  filters: Omit<PaymentsReportFilters, "page" | "pageSize">
) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = {
    organizationId: filters.organizationId,
    status: "CONFIRMED",
  };

  if (filters.branchId) where.branchId = filters.branchId;
  if (filters.studentId) where.studentId = filters.studentId;

  if (filters.dateFrom || filters.dateTo) {
    where.paymentDate = {};
    if (filters.dateFrom) where.paymentDate.gte = new Date(filters.dateFrom);
    if (filters.dateTo) where.paymentDate.lte = new Date(filters.dateTo);
  }

  if (filters.paymentMethod) {
    where.splits = { some: { method: filters.paymentMethod } };
  }

  if (filters.search) {
    where.OR = [
      { paymentNumber: { contains: filters.search } },
      { student: { firstName: { contains: filters.search } } },
      { student: { lastName: { contains: filters.search } } },
      { invoice: { invoiceNumber: { contains: filters.search } } },
    ];
  }

  return where;
}

// Monthly trend — SQL-side GROUP BY so it never loads raw payment rows just to bucket
// them by month. Mirrors buildPaymentWhere(), including the method-filtered gross
// amount logic, so totals reconcile with getPaymentsReportKPIs for the same filters.
export async function getPaymentsMonthlyTrend(
  filters: Omit<PaymentsReportFilters, "page" | "pageSize">
): Promise<PaymentMonthlyPoint[]> {
  const db = await getDb();

  const clauses: Prisma.Sql[] = [
    Prisma.sql`p.organizationId = ${filters.organizationId}`,
    Prisma.sql`p.status = 'CONFIRMED'`,
  ];
  if (filters.branchId) clauses.push(Prisma.sql`p.branchId = ${filters.branchId}`);
  if (filters.studentId) clauses.push(Prisma.sql`p.studentId = ${filters.studentId}`);
  if (filters.dateFrom) clauses.push(Prisma.sql`p.paymentDate >= ${new Date(filters.dateFrom)}`);
  if (filters.dateTo) clauses.push(Prisma.sql`p.paymentDate <= ${new Date(filters.dateTo)}`);
  if (filters.paymentMethod) {
    clauses.push(Prisma.sql`EXISTS (
      SELECT 1 FROM payment_splits ps WHERE ps.paymentId = p.id AND ps.method = ${filters.paymentMethod}
    )`);
  }
  if (filters.search) {
    const escaped = filters.search.replace(/[%_[\]]/g, "\\$&");
    const term = `%${escaped}%`;
    clauses.push(Prisma.sql`(
      p.paymentNumber LIKE ${term} ESCAPE '\\'
      OR st.firstName LIKE ${term} ESCAPE '\\'
      OR st.lastName  LIKE ${term} ESCAPE '\\'
      OR i.invoiceNumber LIKE ${term} ESCAPE '\\'
    )`);
  }

  // When a method filter is active, sum only the matching splits — same rule as the
  // KPI's per-payment `gross` calculation — so the chart total matches totalReceived.
  const amountExpr = filters.paymentMethod
    ? Prisma.sql`ISNULL((
        SELECT SUM(CAST(ps2.amount AS FLOAT)) FROM payment_splits ps2
        WHERE ps2.paymentId = p.id AND ps2.method = ${filters.paymentMethod}
      ), 0)`
    : Prisma.sql`CAST(p.totalAmount AS FLOAT)`;

  const rows = await db.$queryRaw<{ month: string; count: number | bigint; total: number }[]>(Prisma.sql`
    SELECT
      CONVERT(VARCHAR(7), p.paymentDate, 120) AS month,
      COUNT(*)                                AS count,
      ISNULL(SUM(${amountExpr}), 0)           AS total
    FROM payments p
    LEFT JOIN students st ON st.id = p.studentId
    LEFT JOIN invoices i  ON i.id = p.invoiceId
    WHERE ${Prisma.join(clauses, " AND ")}
    GROUP BY CONVERT(VARCHAR(7), p.paymentDate, 120)
    ORDER BY month ASC
  `);

  return rows.map((r) => ({ month: r.month, count: Number(r.count), totalAmount: r.total }));
}

export async function getPaymentsReportKPIs(
  filters: Omit<PaymentsReportFilters, "page" | "pageSize">
): Promise<{ kpis: PaymentsReportKPIs; methodBreakdown: PaymentMethodBreakdown[]; monthlyTrend: PaymentMonthlyPoint[] }> {
  const db = await getDb();
  const where = buildPaymentWhere(filters);

  const [payments, monthlyTrend] = await Promise.all([
    db.payment.findMany({
      where,
      select: {
        id: true,
        totalAmount: true,
        splits: { select: { method: true, amount: true } },
        refunds: {
          where: { status: "COMPLETED" },
          select: { amount: true },
        },
      },
    }),
    getPaymentsMonthlyTrend(filters),
  ]);

  let totalReceived = 0;
  let cashReceived = 0;
  let mobileMoneyReceived = 0;
  let bankTransferReceived = 0;
  let refundedTotal = 0;

  const methodMap = new Map<string, { count: number; total: number }>();

  for (const p of payments) {
    const refunded = p.refunds.reduce((s, r) => s + toNum(r.amount as DecimalLike), 0);

    // When a method filter is active, count only the splits for that method — not the
    // full payment amount. Otherwise a CASH+MPESA payment filtered by CASH would inflate
    // totalReceived by the MPESA portion too.
    const gross = filters.paymentMethod
      ? p.splits
          .filter((s) => s.method === filters.paymentMethod)
          .reduce((s, sp) => s + toNum(sp.amount as DecimalLike), 0)
      : toNum(p.totalAmount as DecimalLike);

    totalReceived += gross;
    refundedTotal += refunded;

    for (const split of p.splits) {
      const amt = toNum(split.amount as DecimalLike);
      const m = split.method;

      if (m === "CASH") cashReceived += amt;
      else if (m === "MPESA" || m === "EMOLA") mobileMoneyReceived += amt;
      else if (m === "BANK_TRANSFER") bankTransferReceived += amt;

      const existing = methodMap.get(m) ?? { count: 0, total: 0 };
      existing.count++;
      existing.total += amt;
      methodMap.set(m, existing);
    }
  }

  const kpis: PaymentsReportKPIs = {
    totalReceived,
    paymentsCount: payments.length,
    averagePayment: payments.length > 0 ? totalReceived / payments.length : 0,
    cashReceived,
    mobileMoneyReceived,
    bankTransferReceived,
    refundedTotal,
    netReceived: totalReceived - refundedTotal,
  };

  const methodBreakdown: PaymentMethodBreakdown[] = Array.from(methodMap.entries()).map(
    ([method, { count, total }]) => ({ method, count, totalAmount: total })
  );

  return { kpis, methodBreakdown, monthlyTrend };
}

export async function listPaymentsReport(
  filters: PaymentsReportFilters
): Promise<{ rows: PaymentsReportRow[]; total: number }> {
  const db = await getDb();
  const where = buildPaymentWhere(filters);
  const skip = (filters.page - 1) * filters.pageSize;

  const [rawRows, total] = await Promise.all([
    db.payment.findMany({
      where,
      skip,
      take: filters.pageSize,
      orderBy: [{ paymentDate: "desc" }],
      select: {
        id: true,
        paymentNumber: true,
        studentId: true,
        invoiceId: true,
        branchId: true,
        totalAmount: true,
        status: true,
        paymentDate: true,
        createdAt: true,
        createdBy: true,
        student: { select: { firstName: true, lastName: true } },
        invoice: { select: { invoiceNumber: true } },
        branch: { select: { name: true } },
        splits: { select: { method: true, amount: true } },
        receipt: { select: { receiptNumber: true } },
        refunds: {
          where: { status: "COMPLETED" },
          select: { amount: true },
        },
      },
    }),
    db.payment.count({ where }),
  ]);

  const rows: PaymentsReportRow[] = rawRows.map((r) => {
    const gross = toNum(r.totalAmount as DecimalLike);
    const refundedAmount = r.refunds.reduce((s, ref) => s + toNum(ref.amount as DecimalLike), 0);
    const paymentMethods = [...new Set(r.splits.map((s) => s.method))];

    return {
      paymentId: r.id,
      paymentNumber: r.paymentNumber,
      studentId: r.studentId,
      studentName: r.student ? `${r.student.firstName} ${r.student.lastName}` : null,
      invoiceId: r.invoiceId,
      invoiceNumber: r.invoice?.invoiceNumber ?? null,
      branchId: r.branchId,
      branchName: r.branch?.name ?? null,
      totalAmount: gross,
      refundedAmount,
      netAmount: gross - refundedAmount,
      paymentMethods,
      status: r.status,
      paymentDate: r.paymentDate,
      confirmedAt: r.createdAt,
      createdBy: r.createdBy,
    };
  });

  return { rows, total };
}
