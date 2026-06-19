import { Prisma } from "@prisma/client";
import { getDb } from "@/server/db";
import type {
  BranchRevenueFilters,
  BranchRevenueKPIs,
  BranchRevenueRow,
  BranchRevenueMonthlyPoint,
  BranchRevenueReport,
} from "../types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Dec = { toNumber(): number };
function n(v: Dec | number | null | undefined): number {
  if (v == null) return 0;
  return typeof v === "object" ? v.toNumber() : v;
}

const NULL_KEY = "__null__";
const k = (id: string | null) => id ?? NULL_KEY;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildInvoiceWhere(filters: BranchRevenueFilters): any {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = {
    organizationId: filters.organizationId,
    status: { notIn: ["CANCELLED"] },
    deletedAt: null,
  };
  if (filters.branchId) where.branchId = filters.branchId;
  if (filters.dateFrom || filters.dateTo) {
    where.issueDate = {};
    if (filters.dateFrom) where.issueDate.gte = new Date(filters.dateFrom);
    if (filters.dateTo) where.issueDate.lte = new Date(filters.dateTo);
  }
  if (filters.academicYearId || filters.academicTermId) {
    where.enrollment = {};
    if (filters.academicYearId) where.enrollment.academicYearId = filters.academicYearId;
    if (filters.academicTermId) where.enrollment.academicTermId = filters.academicTermId;
  }
  return where;
}

export async function getBranchRevenueReport(
  filters: BranchRevenueFilters
): Promise<BranchRevenueReport> {
  const db = await getDb();
  const today = new Date();
  const invoiceWhere = buildInvoiceWhere(filters);

  // Invoice groupBy is the authoritative source for both invoiced and collected amounts.
  //   totalInvoiced  = Invoice.totalAmount  (gross billed)
  //   totalCollected = Invoice.paidAmount   (confirmed payments applied to invoices,
  //                                          reversed on payment cancellation,
  //                                          NOT reversed on refund — by design)
  //
  // This matches exactly how Course Revenue computes the same figures, keeping both
  // reports on the same basis. Refunds are tracked in the Refund table and the
  // Refunds Report; they do not adjust Invoice.paidAmount (CompleteRefundCommand doc).
  const [
    branches,
    invoiceGroups,
    overdueGroups,
    rawPayments,
    studentPairs,
  ] = await Promise.all([
    db.branch.findMany({
      where: { organizationId: filters.organizationId, deletedAt: null },
      select: { id: true, name: true },
    }),
    db.invoice.groupBy({
      by: ["branchId"],
      where: invoiceWhere,
      _sum: { totalAmount: true, paidAmount: true, balanceAmount: true },
      _count: { id: true },
    }),
    db.invoice.groupBy({
      by: ["branchId"],
      where: {
        ...invoiceWhere,
        status: { in: ["OVERDUE", "PARTIALLY_PAID"] },
        dueDate: { lt: today },
      },
      _sum: { balanceAmount: true },
    }),
    // Payments are used only for: (a) paymentCount per branch, (b) monthly trend dates.
    // Status includes all non-cancelled, non-pending payments so that PARTIALLY_REFUNDED
    // and REFUNDED payments are counted — they did receive cash, even if later returned.
    // Do NOT filter by branchId here: Payment.branchId may be null for records created
    // before the source fix. Effective branch is resolved via the linked invoice.
    db.payment.findMany({
      where: {
        organizationId: filters.organizationId,
        status: { notIn: ["PENDING", "CANCELLED"] },
        ...(filters.dateFrom || filters.dateTo
          ? {
              paymentDate: {
                ...(filters.dateFrom ? { gte: new Date(filters.dateFrom) } : {}),
                ...(filters.dateTo ? { lte: new Date(filters.dateTo) } : {}),
              },
            }
          : {}),
      },
      select: { branchId: true, invoiceId: true, totalAmount: true, paymentDate: true },
    }),
    db.invoice.findMany({
      where: invoiceWhere,
      select: { branchId: true, studentId: true },
      distinct: ["branchId", "studentId"],
    }),
  ]);

  // Resolve effective branchId for payments where Payment.branchId is null.
  const nullBranchInvoiceIds = rawPayments
    .filter((p) => p.branchId == null && p.invoiceId != null)
    .map((p) => p.invoiceId!);
  const invoiceBranchLookup =
    nullBranchInvoiceIds.length > 0
      ? await db.invoice.findMany({
          where: { id: { in: nullBranchInvoiceIds }, organizationId: filters.organizationId },
          select: { id: true, branchId: true },
        })
      : [];
  const invoiceBranchMap = new Map(invoiceBranchLookup.map((i) => [i.id, i.branchId]));

  // Build payment count per effective branch (used for the paymentCount column).
  // Branch scoping is applied here since the DB query is intentionally un-filtered.
  const paymentCountByBranch = new Map<string, number>();
  for (const p of rawPayments) {
    const effectiveBranchId = p.branchId ?? (p.invoiceId ? invoiceBranchMap.get(p.invoiceId) ?? null : null);
    if (filters.branchId && effectiveBranchId !== filters.branchId) continue;
    const bk2 = k(effectiveBranchId);
    paymentCountByBranch.set(bk2, (paymentCountByBranch.get(bk2) ?? 0) + 1);
  }

  const branchNameMap = new Map(branches.map((b) => [b.id, b.name]));
  const invoiceByBranch = new Map(invoiceGroups.map((g) => [k(g.branchId), g]));
  const overdueByBranch = new Map(
    overdueGroups.map((g) => [k(g.branchId), n(g._sum.balanceAmount as Dec)])
  );

  const studentCountByBranch = new Map<string, number>();
  for (const { branchId } of studentPairs) {
    const bk = k(branchId);
    studentCountByBranch.set(bk, (studentCountByBranch.get(bk) ?? 0) + 1);
  }

  const rows: BranchRevenueRow[] = [];
  for (const bk of invoiceByBranch.keys()) {
    const branchId = bk === NULL_KEY ? null : bk;
    const inv = invoiceByBranch.get(bk)!;
    const totalInvoiced = n(inv._sum.totalAmount as Dec);
    // totalCollected = Invoice.paidAmount — same basis as Course Revenue.
    const totalCollected = n(inv._sum.paidAmount as Dec);
    const outstandingBalance = n(inv._sum.balanceAmount as Dec);
    const overdueBalance = overdueByBranch.get(bk) ?? 0;
    const collectionRate = totalInvoiced > 0 ? (totalCollected / totalInvoiced) * 100 : 0;

    rows.push({
      branchId,
      branchName: branchId ? (branchNameMap.get(branchId) ?? branchId) : "Sem Filial",
      totalInvoiced,
      totalCollected,
      outstandingBalance,
      overdueBalance,
      collectionRate,
      paymentCount: paymentCountByBranch.get(bk) ?? 0,
      studentCount: studentCountByBranch.get(bk) ?? 0,
    });
  }
  rows.sort((a, b) => b.totalCollected - a.totalCollected);

  const totalInvoiced = rows.reduce((s, r) => s + r.totalInvoiced, 0);
  const totalCollected = rows.reduce((s, r) => s + r.totalCollected, 0);
  const totalOutstanding = rows.reduce((s, r) => s + r.outstandingBalance, 0);
  const averageCollectionRate = totalInvoiced > 0 ? (totalCollected / totalInvoiced) * 100 : 0;
  const withData = rows.filter((r) => r.totalInvoiced > 0);
  const bestBranch = withData.reduce<BranchRevenueRow | null>(
    (best, r) => (best === null || r.collectionRate > best.collectionRate ? r : best),
    null
  );
  const worstBranch = withData.reduce<BranchRevenueRow | null>(
    (worst, r) => (worst === null || r.collectionRate < worst.collectionRate ? r : worst),
    null
  );

  const kpis: BranchRevenueKPIs = {
    totalInvoiced,
    totalCollected,
    totalOutstanding,
    averageCollectionRate,
    bestBranchName: bestBranch?.branchName ?? null,
    worstBranchName: worstBranch?.branchName ?? null,
  };

  // Monthly trend — top 5 branches by collected, using payment dates for time axis.
  // Payment.totalAmount (gross) is used here since Invoice.paidAmount has no event date.
  // PARTIALLY_REFUNDED and REFUNDED payments are included — they represent real cash received.
  // Pushed to SQL so it never loads raw payment rows just to bucket them by month/branch.
  const top5BranchIds = rows.slice(0, 5).map((r) => r.branchId);
  const nonNullTop5 = top5BranchIds.filter((id): id is string => id !== null);
  const includeNullBranch = top5BranchIds.includes(null);

  let monthlyTrend: BranchRevenueMonthlyPoint[] = [];
  if (top5BranchIds.length > 0) {
    const branchMatchClauses: Prisma.Sql[] = [];
    if (nonNullTop5.length > 0) {
      branchMatchClauses.push(Prisma.sql`COALESCE(p.branchId, inv.branchId) IN (${Prisma.join(nonNullTop5)})`);
    }
    if (includeNullBranch) {
      branchMatchClauses.push(Prisma.sql`COALESCE(p.branchId, inv.branchId) IS NULL`);
    }

    const trendClauses: Prisma.Sql[] = [
      Prisma.sql`p.organizationId = ${filters.organizationId}`,
      Prisma.sql`p.status NOT IN ('PENDING', 'CANCELLED')`,
      Prisma.sql`(${Prisma.join(branchMatchClauses, " OR ")})`,
    ];
    if (filters.branchId) {
      trendClauses.push(Prisma.sql`COALESCE(p.branchId, inv.branchId) = ${filters.branchId}`);
    }
    if (filters.dateFrom) trendClauses.push(Prisma.sql`p.paymentDate >= ${new Date(filters.dateFrom)}`);
    if (filters.dateTo) trendClauses.push(Prisma.sql`p.paymentDate <= ${new Date(filters.dateTo)}`);

    const trendRows = await db.$queryRaw<{ month: string; branchId: string | null; collected: number }[]>(Prisma.sql`
      SELECT
        CONVERT(VARCHAR(7), p.paymentDate, 120) AS month,
        COALESCE(p.branchId, inv.branchId)      AS branchId,
        SUM(CAST(p.totalAmount AS FLOAT))       AS collected
      FROM payments p
      LEFT JOIN invoices inv ON inv.id = p.invoiceId
      WHERE ${Prisma.join(trendClauses, " AND ")}
      GROUP BY CONVERT(VARCHAR(7), p.paymentDate, 120), COALESCE(p.branchId, inv.branchId)
      HAVING SUM(CAST(p.totalAmount AS FLOAT)) > 0
      ORDER BY month ASC
    `);

    monthlyTrend = trendRows.flatMap((r) => {
      const row = rows.find((rr) => k(rr.branchId) === k(r.branchId));
      return row ? [{ month: r.month, branchId: row.branchId, branchName: row.branchName, collected: r.collected }] : [];
    });
  }

  return { kpis, rows, monthlyTrend };
}
