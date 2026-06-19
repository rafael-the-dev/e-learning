import { Prisma } from "@prisma/client";
import { getDb } from "@/server/db";
import type {
  WalletActivityFilters,
  WalletActivityKPIs,
  WalletActivityRow,
  WalletTransactionTypePoint,
  WalletMonthlyPoint,
} from "../types";

type Dec = { toNumber(): number };
function n(v: Dec | number | null | undefined): number {
  if (v == null) return 0;
  return typeof v === "object" ? v.toNumber() : v;
}

// ── Sort whitelist ────────────────────────────────────────────────────────────
const SORT_EXPRESSIONS: Record<string, string> = {
  currentBalance:      "currentBalance",
  totalCredits:        "totalCredits",
  totalDebits:         "totalDebits",
  lastTransactionDate: "lastTransactionDate",
  studentName:         "s.firstName",
};

function resolveOrderBy(sortBy?: string, sortDir?: string): Prisma.Sql {
  if (!sortBy || !SORT_EXPRESSIONS[sortBy]) {
    return Prisma.raw("currentBalance DESC");
  }
  const dir = sortDir === "asc" ? "ASC" : "DESC";
  return Prisma.raw(`${SORT_EXPRESSIONS[sortBy]} ${dir}`);
}

// ── Raw row shape ─────────────────────────────────────────────────────────────
interface RawWalletRow {
  walletId:            string;
  studentId:           string;
  firstName:           string | null;
  lastName:            string | null;
  studentCode:         string | null;
  currentBalance:      number;
  totalCredits:        number;
  totalDebits:         number;
  transactionCount:    number | bigint;
  lastTransactionDate: Date | null;
  lastTransactionType: string | null;
}

// ── KPIs ──────────────────────────────────────────────────────────────────────
export async function getWalletActivityKPIs(
  filters: WalletActivityFilters
): Promise<WalletActivityKPIs> {
  const db = await getDb();
  const orgFilter = { organizationId: filters.organizationId };

  const dateFilter: { createdAt?: { gte?: Date; lte?: Date } } = {};
  if (filters.dateFrom) dateFilter.createdAt = { ...dateFilter.createdAt, gte: new Date(filters.dateFrom) };
  if (filters.dateTo)   dateFilter.createdAt = { ...dateFilter.createdAt, lte: new Date(filters.dateTo) };

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
    creditsThisPeriod:      n(creditsAgg._sum.amount as Dec),
    debitsThisPeriod:       Math.abs(n(debitsAgg._sum.amount as Dec)),
    creditAppliedThisPeriod: Math.abs(n(creditAppliedAgg._sum.amount as Dec)),
    walletRefundsThisPeriod: n(refundAgg._sum.amount as Dec),
  };
}

// ── Type breakdown ────────────────────────────────────────────────────────────
export async function getWalletTypeBreakdown(
  filters: WalletActivityFilters
): Promise<WalletTransactionTypePoint[]> {
  const db = await getDb();
  const dateFilter: { createdAt?: { gte?: Date; lte?: Date } } = {};
  if (filters.dateFrom) dateFilter.createdAt = { ...dateFilter.createdAt, gte: new Date(filters.dateFrom) };
  if (filters.dateTo)   dateFilter.createdAt = { ...dateFilter.createdAt, lte: new Date(filters.dateTo) };

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

// ── Monthly trend — DB-aggregated ─────────────────────────────────────────────
export async function getWalletMonthlyTrend(
  filters: WalletActivityFilters
): Promise<WalletMonthlyPoint[]> {
  const db = await getDb();

  const dateFrom = filters.dateFrom
    ? new Date(filters.dateFrom)
    : new Date(new Date().setFullYear(new Date().getFullYear() - 1));
  const dateTo = filters.dateTo ? new Date(filters.dateTo) : new Date();

  const rows = await db.$queryRaw<{ month: string; credits: number; debits: number }[]>(Prisma.sql`
    SELECT
      CONVERT(VARCHAR(7), t.createdAt, 120)                                             AS month,
      ISNULL(SUM(CASE WHEN CAST(t.amount AS FLOAT) >= 0
        THEN CAST(t.amount AS FLOAT) ELSE 0 END), 0)                                   AS credits,
      ABS(ISNULL(SUM(CASE WHEN CAST(t.amount AS FLOAT) < 0
        THEN CAST(t.amount AS FLOAT) ELSE 0 END), 0))                                  AS debits
    FROM student_wallet_transactions t
    WHERE t.organizationId = ${filters.organizationId}
      AND t.createdAt >= ${dateFrom}
      AND t.createdAt <= ${dateTo}
    GROUP BY CONVERT(VARCHAR(7), t.createdAt, 120)
    ORDER BY month ASC
  `);

  return rows.map((r) => ({ month: r.month, credits: r.credits, debits: r.debits }));
}

// ── Paginated wallet activity list — fully DB-side ────────────────────────────
export async function listWalletActivityRows(
  filters: WalletActivityFilters
): Promise<{ rows: WalletActivityRow[]; total: number }> {
  const db = await getDb();
  const { page, pageSize } = filters;
  const skip = (page - 1) * pageSize;

  // ── Wallet-level WHERE filters ──
  const walletClauses: Prisma.Sql[] = [
    Prisma.sql`w.organizationId = ${filters.organizationId}`,
  ];

  if (filters.studentId) walletClauses.push(Prisma.sql`w.studentId = ${filters.studentId}`);
  if (filters.branchId)  walletClauses.push(Prisma.sql`s.branchId = ${filters.branchId}`);

  if (filters.search) {
    const escaped = filters.search.replace(/[%_[\]]/g, "\\$&");
    const term = `%${escaped}%`;
    walletClauses.push(Prisma.sql`(
      s.firstName LIKE ${term} ESCAPE '\\'
      OR s.lastName  LIKE ${term} ESCAPE '\\'
      OR s.code      LIKE ${term} ESCAPE '\\'
    )`);
  }

  const whereFragment = Prisma.sql`WHERE ${Prisma.join(walletClauses, " AND ")}`;

  // ── Period condition — applied to credits/debits/count but NOT currentBalance ──
  const periodClauses: Prisma.Sql[] = [];
  if (filters.dateFrom)        periodClauses.push(Prisma.sql`t.createdAt >= ${new Date(filters.dateFrom)}`);
  if (filters.dateTo)          periodClauses.push(Prisma.sql`t.createdAt <= ${new Date(filters.dateTo)}`);
  if (filters.transactionType) periodClauses.push(Prisma.sql`t.type = ${filters.transactionType}`);

  const periodCond = periodClauses.length > 0
    ? Prisma.sql`AND ${Prisma.join(periodClauses, " AND ")}`
    : Prisma.sql``;

  // ── Minimum balance HAVING clause ──
  const havingClause = filters.minBalance != null
    ? Prisma.sql`HAVING ISNULL(SUM(CAST(t.amount AS FLOAT)), 0) >= ${filters.minBalance}`
    : Prisma.sql``;

  const orderByExpr = resolveOrderBy(filters.sortBy, filters.sortDir);

  const [rawRows, countResult] = await Promise.all([
    db.$queryRaw<RawWalletRow[]>(Prisma.sql`
      WITH LastTx AS (
        SELECT
          studentWalletId,
          type,
          ROW_NUMBER() OVER (PARTITION BY studentWalletId ORDER BY createdAt DESC) AS rn
        FROM student_wallet_transactions
        WHERE organizationId = ${filters.organizationId}
      )
      SELECT
        w.id                                                                         AS walletId,
        w.studentId,
        s.firstName,
        s.lastName,
        s.code                                                                       AS studentCode,
        ISNULL(SUM(CAST(t.amount AS FLOAT)), 0)                                     AS currentBalance,
        ISNULL(SUM(CASE WHEN CAST(t.amount AS FLOAT) > 0 ${periodCond}
          THEN CAST(t.amount AS FLOAT) ELSE 0 END), 0)                              AS totalCredits,
        ABS(ISNULL(SUM(CASE WHEN CAST(t.amount AS FLOAT) < 0 ${periodCond}
          THEN CAST(t.amount AS FLOAT) ELSE 0 END), 0))                             AS totalDebits,
        COUNT(CASE WHEN 1=1 ${periodCond} THEN t.id END)                            AS transactionCount,
        MAX(t.createdAt)                                                             AS lastTransactionDate,
        lt.type                                                                      AS lastTransactionType
      FROM student_wallets w
      LEFT JOIN students s             ON s.id = w.studentId
      LEFT JOIN student_wallet_transactions t ON t.studentWalletId = w.id
      LEFT JOIN LastTx lt              ON lt.studentWalletId = w.id AND lt.rn = 1
      ${whereFragment}
      GROUP BY w.id, w.studentId, s.firstName, s.lastName, s.code, lt.type
      ${havingClause}
      ORDER BY ${orderByExpr}
      OFFSET ${skip} ROWS FETCH NEXT ${pageSize} ROWS ONLY
    `),
    db.$queryRaw<[{ total: bigint }]>(Prisma.sql`
      SELECT COUNT(*) AS total FROM (
        SELECT w.id
        FROM student_wallets w
        LEFT JOIN students s ON s.id = w.studentId
        LEFT JOIN student_wallet_transactions t ON t.studentWalletId = w.id
        ${whereFragment}
        GROUP BY w.id
        ${havingClause}
      ) AS cnt
    `),
  ]);

  const total = Number(countResult[0]?.total ?? 0);

  const rows: WalletActivityRow[] = rawRows.map((r) => ({
    walletId:            r.walletId,
    studentId:           r.studentId,
    studentName:         `${r.firstName ?? ""} ${r.lastName ?? ""}`.trim(),
    studentCode:         r.studentCode,
    currentBalance:      r.currentBalance,
    totalCredits:        r.totalCredits,
    totalDebits:         r.totalDebits,
    transactionCount:    Number(r.transactionCount),
    lastTransactionDate: r.lastTransactionDate,
    lastTransactionType: r.lastTransactionType,
  }));

  return { rows, total };
}
