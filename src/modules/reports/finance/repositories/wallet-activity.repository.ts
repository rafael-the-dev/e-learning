import { getDb } from "@/server/db";
import type {
  WalletActivityFilters,
  WalletActivityKPIs,
  WalletActivityRow,
  WalletTransactionTypePoint,
  WalletMonthlyPoint,
} from "../types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Dec = { toNumber(): number };
function n(v: Dec | number | null | undefined): number {
  if (v == null) return 0;
  return typeof v === "object" ? v.toNumber() : v;
}

function buildDateFilter(filters: WalletActivityFilters) {
  if (!filters.dateFrom && !filters.dateTo) return {};
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const createdAt: any = {};
  if (filters.dateFrom) createdAt.gte = new Date(filters.dateFrom);
  if (filters.dateTo) createdAt.lte = new Date(filters.dateTo);
  return { createdAt };
}

export async function getWalletActivityKPIs(
  filters: WalletActivityFilters
): Promise<WalletActivityKPIs> {
  const db = await getDb();
  const orgFilter = { organizationId: filters.organizationId };
  const dateFilter = buildDateFilter(filters);

  const [allBalances, creditsAgg, debitsAgg, creditAppliedAgg, refundAgg] = await Promise.all([
    db.studentWalletTransaction.groupBy({
      by: ["studentWalletId"],
      where: orgFilter,
      _sum: { amount: true },
    }),
    db.studentWalletTransaction.aggregate({
      where: { ...orgFilter, ...dateFilter, amount: { gt: 0 } },
      _sum: { amount: true },
    }),
    db.studentWalletTransaction.aggregate({
      where: { ...orgFilter, ...dateFilter, amount: { lt: 0 } },
      _sum: { amount: true },
    }),
    db.studentWalletTransaction.aggregate({
      where: { ...orgFilter, ...dateFilter, type: "CREDIT_APPLIED" },
      _sum: { amount: true },
    }),
    // Only positive REFUND entries — payment refunds credited INTO the wallet.
    // Negative REFUND entries (RefundWalletCommand cash disbursements) are
    // already captured by debitsThisPeriod (amount: { lt: 0 }).
    db.studentWalletTransaction.aggregate({
      where: { ...orgFilter, ...dateFilter, type: "REFUND", amount: { gt: 0 } },
      _sum: { amount: true },
    }),
  ]);

  const totalWalletBalance = allBalances.reduce((s, g) => s + n(g._sum.amount as Dec), 0);
  const studentsWithPositiveBalance = allBalances.filter((g) => n(g._sum.amount as Dec) > 0).length;

  return {
    totalWalletBalance,
    studentsWithPositiveBalance,
    creditsThisPeriod: n(creditsAgg._sum.amount as Dec),
    debitsThisPeriod: Math.abs(n(debitsAgg._sum.amount as Dec)),
    creditAppliedThisPeriod: Math.abs(n(creditAppliedAgg._sum.amount as Dec)),
    walletRefundsThisPeriod: n(refundAgg._sum.amount as Dec),
  };
}

export async function getWalletTypeBreakdown(
  filters: WalletActivityFilters
): Promise<WalletTransactionTypePoint[]> {
  const db = await getDb();
  const dateFilter = buildDateFilter(filters);
  const groups = await db.studentWalletTransaction.groupBy({
    by: ["type"],
    where: { organizationId: filters.organizationId, ...dateFilter },
    _sum: { amount: true },
    _count: { id: true },
  });

  return groups
    .map((g) => ({ type: g.type, count: g._count.id, totalAmount: Math.abs(n(g._sum.amount as Dec)) }))
    .sort((a, b) => b.totalAmount - a.totalAmount);
}

export async function getWalletMonthlyTrend(
  filters: WalletActivityFilters
): Promise<WalletMonthlyPoint[]> {
  const db = await getDb();
  const dateFilter = buildDateFilter(filters);

  // Default to last 12 months if no date filter set
  const effectiveDateFilter = Object.keys(dateFilter).length > 0 ? dateFilter : {
    createdAt: { gte: new Date(new Date().setFullYear(new Date().getFullYear() - 1)) },
  };

  const txList = await db.studentWalletTransaction.findMany({
    where: { organizationId: filters.organizationId, ...effectiveDateFilter },
    select: { amount: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });

  const monthMap = new Map<string, { credits: number; debits: number }>();
  for (const tx of txList) {
    const monthKey = `${tx.createdAt.getFullYear()}-${String(tx.createdAt.getMonth() + 1).padStart(2, "0")}`;
    const entry = monthMap.get(monthKey) ?? { credits: 0, debits: 0 };
    const amt = n(tx.amount as Dec);
    if (amt >= 0) entry.credits += amt;
    else entry.debits += Math.abs(amt);
    monthMap.set(monthKey, entry);
  }

  return Array.from(monthMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, { credits, debits }]) => ({ month, credits, debits }));
}

export async function listWalletActivityRows(
  filters: WalletActivityFilters
): Promise<{ rows: WalletActivityRow[]; total: number }> {
  const db = await getDb();

  // Build wallet where clause
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const conditions: any[] = [{ organizationId: filters.organizationId }];
  if (filters.branchId) conditions.push({ student: { branchId: filters.branchId } });
  if (filters.studentId) conditions.push({ studentId: filters.studentId });
  if (filters.search) {
    conditions.push({
      OR: [
        { student: { firstName: { contains: filters.search } } },
        { student: { lastName: { contains: filters.search } } },
        { student: { code: { contains: filters.search } } },
      ],
    });
  }
  const walletWhere = conditions.length === 1 ? conditions[0] : { AND: conditions };

  const wallets = await db.studentWallet.findMany({
    where: walletWhere,
    select: {
      id: true,
      studentId: true,
      student: { select: { firstName: true, lastName: true, code: true } },
    },
  });

  if (wallets.length === 0) return { rows: [], total: 0 };

  const walletIds = wallets.map((w) => w.id);
  const txWhere = { organizationId: filters.organizationId, studentWalletId: { in: walletIds } };

  const [balanceGroups, creditGroups, debitGroups, lastTxList] = await Promise.all([
    db.studentWalletTransaction.groupBy({
      by: ["studentWalletId"],
      where: txWhere,
      _sum: { amount: true },
      _count: { id: true },
    }),
    db.studentWalletTransaction.groupBy({
      by: ["studentWalletId"],
      where: { ...txWhere, amount: { gt: 0 } },
      _sum: { amount: true },
    }),
    db.studentWalletTransaction.groupBy({
      by: ["studentWalletId"],
      where: { ...txWhere, amount: { lt: 0 } },
      _sum: { amount: true },
    }),
    db.studentWalletTransaction.findMany({
      where: txWhere,
      orderBy: { createdAt: "desc" },
      distinct: ["studentWalletId"],
      select: { studentWalletId: true, type: true, createdAt: true },
    }),
  ]);

  const balanceMap = new Map(balanceGroups.map((g) => [g.studentWalletId, g]));
  const creditMap = new Map(creditGroups.map((g) => [g.studentWalletId, n(g._sum.amount as Dec)]));
  const debitMap = new Map(debitGroups.map((g) => [g.studentWalletId, Math.abs(n(g._sum.amount as Dec))]));
  const lastTxMap = new Map(lastTxList.map((t) => [t.studentWalletId, t]));

  let allRows: WalletActivityRow[] = wallets.map((w) => {
    const agg = balanceMap.get(w.id);
    return {
      walletId: w.id,
      studentId: w.studentId,
      studentName: `${w.student.firstName} ${w.student.lastName}`,
      studentCode: w.student.code,
      currentBalance: n(agg?._sum.amount as Dec),
      totalCredits: creditMap.get(w.id) ?? 0,
      totalDebits: debitMap.get(w.id) ?? 0,
      transactionCount: agg?._count.id ?? 0,
      lastTransactionDate: lastTxMap.get(w.id)?.createdAt ?? null,
      lastTransactionType: lastTxMap.get(w.id)?.type ?? null,
    };
  });

  if (filters.minBalance != null) {
    allRows = allRows.filter((r) => r.currentBalance >= (filters.minBalance ?? 0));
  }

  allRows.sort((a, b) => b.currentBalance - a.currentBalance);

  const total = allRows.length;
  const skip = (filters.page - 1) * filters.pageSize;
  return { rows: allRows.slice(skip, skip + filters.pageSize), total };
}
