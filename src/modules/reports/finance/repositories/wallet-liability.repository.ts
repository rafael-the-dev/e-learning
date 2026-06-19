import { Prisma } from "@prisma/client";
import { getDb } from "@/server/db";
import type {
  WalletLiabilityBranchPoint,
  WalletLiabilityCoursePoint,
  WalletLiabilityFilters,
  WalletLiabilityKPIs,
  WalletLiabilityMonthlyPoint,
  WalletLiabilityRow,
  WalletLiabilityWatchlistItem,
} from "../types";

type Db = Awaited<ReturnType<typeof getDb>>;

function num(v: { toNumber(): number } | number | bigint | null | undefined): number {
  if (v == null) return 0;
  if (typeof v === "bigint") return Number(v);
  return typeof v === "object" ? v.toNumber() : v;
}

// Dormancy threshold for KPI #8 ("Dormant Wallets") — see docs/financial-reports.md.
const DORMANT_KPI_DAYS = 90;

// Watchlist tuning constants — see docs/financial-reports.md "Wallet Liability Watchlist".
const WATCHLIST_LIMIT = 10;
const HIGH_BALANCE_THRESHOLD = 50000;
const MEDIUM_BALANCE_THRESHOLD = 10000;
const HIGH_DORMANT_DAYS = 180;
const MEDIUM_DORMANT_DAYS = 90;
const CONCENTRATION_SHARE = 0.05;

// =============================================================================
// SHARED SQL FRAGMENTS
// =============================================================================

// "Use active Enrollment if available... choose the most recent active
// enrollment" — resolved here via ROW_NUMBER() so every other query just
// joins rn = 1. A student with no ACTIVE enrollment gets courseId = NULL,
// mapped to "Sem Curso" in the row-mapping layer.
function activeEnrollmentCte(organizationId: string): Prisma.Sql {
  return Prisma.sql`
    SELECT studentId, courseId,
           ROW_NUMBER() OVER (PARTITION BY studentId ORDER BY enrollmentDate DESC, createdAt DESC) AS rn
    FROM enrollments
    WHERE organizationId = ${organizationId} AND status = 'ACTIVE' AND deletedAt IS NULL
  `;
}

// currentBalance / lastTransactionDate are always all-time (no period condition).
// creditsIssued / creditsConsumed / transactionCount are scoped to the filtered
// date range when one is supplied, otherwise all-time too (1=1).
function periodCondition(filters: Pick<WalletLiabilityFilters, "dateFrom" | "dateTo">): Prisma.Sql {
  const clauses: Prisma.Sql[] = [];
  if (filters.dateFrom) clauses.push(Prisma.sql`t.createdAt >= ${new Date(filters.dateFrom)}`);
  if (filters.dateTo) {
    const end = new Date(filters.dateTo);
    end.setHours(23, 59, 59, 999);
    clauses.push(Prisma.sql`t.createdAt <= ${end}`);
  }
  return clauses.length > 0 ? Prisma.join(clauses, " AND ") : Prisma.sql`1=1`;
}

// Wallet-level scope filters shared by every aggregate below. Tenant isolation
// is enforced structurally: organizationId is always ANDed with every other
// filter, so a cross-tenant branchId/courseId/studentId simply matches zero
// rows rather than requiring a separate pre-validation round trip.
function walletScopeClauses(
  filters: Pick<WalletLiabilityFilters, "organizationId" | "branchId" | "courseId" | "studentId">
): Prisma.Sql[] {
  const clauses: Prisma.Sql[] = [Prisma.sql`w.organizationId = ${filters.organizationId}`];
  if (filters.branchId) clauses.push(Prisma.sql`s.branchId = ${filters.branchId}`);
  if (filters.courseId) clauses.push(Prisma.sql`ae.courseId = ${filters.courseId}`);
  if (filters.studentId) clauses.push(Prisma.sql`w.studentId = ${filters.studentId}`);
  return clauses;
}

function buildSelectFields(period: Prisma.Sql): Prisma.Sql {
  // Three independent substitutions of the same period-condition fragment —
  // Prisma.sql fragments are immutable and side-effect free, so reusing the
  // same `period` value three times is safe (it is not a string replace).
  return Prisma.sql`
    w.id                                                                          AS walletId,
    w.studentId                                                                   AS studentId,
    s.firstName, s.lastName, s.code AS studentCode, s.branchId,
    b.name                                                                        AS branchName,
    ae.courseId, c.name                                                           AS courseName,
    ISNULL(SUM(CAST(t.amount AS FLOAT)), 0)                                       AS currentBalance,
    ISNULL(SUM(CASE WHEN ${period} AND CAST(t.amount AS FLOAT) > 0 THEN CAST(t.amount AS FLOAT) ELSE 0 END), 0)  AS creditsIssued,
    ABS(ISNULL(SUM(CASE WHEN ${period} AND CAST(t.amount AS FLOAT) < 0 THEN CAST(t.amount AS FLOAT) ELSE 0 END), 0)) AS creditsConsumed,
    COUNT(CASE WHEN ${period} THEN t.id END)                                      AS transactionCount,
    MAX(t.createdAt)                                                              AS lastTransactionDate,
    DATEDIFF(day, MAX(t.createdAt), GETDATE())                                    AS daysDormant
  `;
}

function baseFrom(organizationId: string): Prisma.Sql {
  return Prisma.sql`
    FROM student_wallets w
    JOIN students s ON s.id = w.studentId
    LEFT JOIN branches b ON b.id = s.branchId
    LEFT JOIN ActiveEnrollment ae ON ae.studentId = w.studentId AND ae.rn = 1
    LEFT JOIN courses c ON c.id = ae.courseId
    LEFT JOIN student_wallet_transactions t ON t.studentWalletId = w.id
  `;
}

const GROUP_BY_FIELDS = Prisma.sql`
  GROUP BY w.id, w.studentId, s.firstName, s.lastName, s.code, s.branchId, b.name, ae.courseId, c.name
`;

interface RawAggRow {
  walletId: string;
  studentId: string;
  firstName: string | null;
  lastName: string | null;
  studentCode: string | null;
  branchId: string | null;
  branchName: string | null;
  courseId: string | null;
  courseName: string | null;
  currentBalance: number;
  creditsIssued: number;
  creditsConsumed: number;
  transactionCount: number | bigint;
  lastTransactionDate: Date | null;
  daysDormant: number | null;
}

function mapRow(r: RawAggRow): WalletLiabilityRow {
  return {
    walletId: r.walletId,
    studentId: r.studentId,
    studentName: `${r.firstName ?? ""} ${r.lastName ?? ""}`.trim(),
    studentCode: r.studentCode,
    branchId: r.branchId,
    branchName: r.branchId ? (r.branchName ?? r.branchId) : "Sem Filial",
    courseId: r.courseId,
    courseName: r.courseId ? (r.courseName ?? r.courseId) : "Sem Curso",
    currentBalance: num(r.currentBalance),
    creditsIssued: num(r.creditsIssued),
    creditsConsumed: num(r.creditsConsumed),
    netMovement: num(r.creditsIssued) - num(r.creditsConsumed),
    lastTransactionDate: r.lastTransactionDate,
    daysDormant: r.daysDormant,
    transactionCount: Number(r.transactionCount),
  };
}

// "Negative balances must be visually flagged" + default scope rules.
function balanceHavingClauses(filters: WalletLiabilityFilters): Prisma.Sql[] {
  const clauses: Prisma.Sql[] = [];
  const balanceExpr = Prisma.sql`SUM(CAST(t.amount AS FLOAT))`;

  if (!filters.includeNegativeBalances) {
    clauses.push(
      filters.includeZeroBalances
        ? Prisma.sql`ISNULL(${balanceExpr}, 0) >= 0`
        : Prisma.sql`ISNULL(${balanceExpr}, 0) > 0`
    );
  }
  if (filters.minBalance != null) {
    clauses.push(Prisma.sql`ISNULL(${balanceExpr}, 0) >= ${filters.minBalance}`);
  }
  if (filters.dormantDays != null) {
    clauses.push(Prisma.sql`DATEDIFF(day, MAX(t.createdAt), GETDATE()) >= ${filters.dormantDays}`);
  }
  return clauses;
}

const SORT_EXPRESSIONS: Record<string, string> = {
  currentBalance: "currentBalance",
  creditsIssued: "creditsIssued",
  creditsConsumed: "creditsConsumed",
  netMovement: "(creditsIssued - creditsConsumed)",
  lastTransactionDate: "lastTransactionDate",
  daysDormant: "daysDormant",
  transactionCount: "transactionCount",
  studentName: "s.firstName",
};

function resolveOrderBy(sortBy?: string, sortDir?: string): Prisma.Sql {
  if (!sortBy || !SORT_EXPRESSIONS[sortBy]) {
    return Prisma.raw("currentBalance DESC");
  }
  const dir = sortDir === "asc" ? "ASC" : "DESC";
  return Prisma.raw(`${SORT_EXPRESSIONS[sortBy]} ${dir}`);
}

// =============================================================================
// PAGINATED ROW LISTING — table on the report page.
// Pagination, sorting, and the balance/dormancy predicates all happen in SQL
// (HAVING + ORDER BY + OFFSET/FETCH) — never in JavaScript.
// =============================================================================

export async function listWalletLiabilityRows(
  filters: WalletLiabilityFilters
): Promise<{ rows: WalletLiabilityRow[]; total: number }> {
  const db = await getDb();
  const period = periodCondition(filters);
  const scope = walletScopeClauses(filters);
  const having = balanceHavingClauses(filters);
  const havingFragment = having.length > 0 ? Prisma.sql`HAVING ${Prisma.join(having, " AND ")}` : Prisma.sql``;
  const orderByExpr = resolveOrderBy(filters.sortBy, filters.sortDir);
  const skip = (filters.page - 1) * filters.pageSize;
  const cte = activeEnrollmentCte(filters.organizationId);

  const [rawRows, countResult] = await Promise.all([
    db.$queryRaw<RawAggRow[]>(Prisma.sql`
      WITH ActiveEnrollment AS (${cte})
      SELECT ${buildSelectFields(period)}
      ${baseFrom(filters.organizationId)}
      WHERE ${Prisma.join(scope, " AND ")}
      ${GROUP_BY_FIELDS}
      ${havingFragment}
      ORDER BY ${orderByExpr}
      OFFSET ${skip} ROWS FETCH NEXT ${filters.pageSize} ROWS ONLY
    `),
    db.$queryRaw<[{ total: bigint }]>(Prisma.sql`
      WITH ActiveEnrollment AS (${cte})
      SELECT COUNT(*) AS total FROM (
        SELECT w.id
        ${baseFrom(filters.organizationId)}
        WHERE ${Prisma.join(scope, " AND ")}
        ${GROUP_BY_FIELDS}
        ${havingFragment}
      ) AS cnt
    `),
  ]);

  return { rows: rawRows.map(mapRow), total: Number(countResult[0]?.total ?? 0) };
}

// =============================================================================
// KPIs (cards 1-4, 8) — one aggregate-of-aggregate query over all wallets in
// scope (ignoring pagination), never the paginated page.
// =============================================================================

export async function getWalletLiabilityKPIs(
  filters: Omit<WalletLiabilityFilters, "page" | "pageSize" | "sortBy" | "sortDir" | "minBalance" | "dormantDays" | "includeZeroBalances" | "includeNegativeBalances">
): Promise<WalletLiabilityKPIs> {
  const db = await getDb();
  const period = periodCondition(filters);
  const scope = walletScopeClauses(filters);
  const cte = activeEnrollmentCte(filters.organizationId);

  const [row] = await db.$queryRaw<
    [{
      totalLiability: number;
      studentsWithCredit: number | bigint;
      largestBalance: number | null;
      creditsIssuedThisPeriod: number;
      creditsConsumedThisPeriod: number;
      dormantWallets: number | bigint;
    }]
  >(Prisma.sql`
    WITH ActiveEnrollment AS (${cte}),
    WalletAgg AS (
      SELECT ${buildSelectFields(period)}
      ${baseFrom(filters.organizationId)}
      WHERE ${Prisma.join(scope, " AND ")}
      ${GROUP_BY_FIELDS}
    )
    SELECT
      ISNULL(SUM(CASE WHEN currentBalance > 0 THEN currentBalance ELSE 0 END), 0)         AS totalLiability,
      COUNT(CASE WHEN currentBalance > 0 THEN 1 END)                                      AS studentsWithCredit,
      ISNULL(MAX(CASE WHEN currentBalance > 0 THEN currentBalance END), 0)                AS largestBalance,
      ISNULL(SUM(creditsIssued), 0)                                                       AS creditsIssuedThisPeriod,
      ISNULL(SUM(creditsConsumed), 0)                                                     AS creditsConsumedThisPeriod,
      COUNT(CASE WHEN currentBalance > 0 AND daysDormant >= ${DORMANT_KPI_DAYS} THEN 1 END) AS dormantWallets
    FROM WalletAgg
  `);

  const totalLiability = num(row?.totalLiability);
  const studentsWithCredit = Number(row?.studentsWithCredit ?? 0);
  const creditsIssuedThisPeriod = num(row?.creditsIssuedThisPeriod);
  const creditsConsumedThisPeriod = num(row?.creditsConsumedThisPeriod);

  return {
    totalLiability,
    studentsWithCredit,
    averagePositiveBalance: studentsWithCredit > 0 ? totalLiability / studentsWithCredit : 0,
    largestBalance: num(row?.largestBalance),
    creditsIssuedThisPeriod,
    creditsConsumedThisPeriod,
    netWalletMovement: creditsIssuedThisPeriod - creditsConsumedThisPeriod,
    dormantWallets: Number(row?.dormantWallets ?? 0),
  };
}

// =============================================================================
// LIABILITY BY BRANCH / BY COURSE — charts 3 & 4. One more GROUP BY pass over
// the same wallet-level aggregate, never raw transactions.
// =============================================================================

export async function getWalletLiabilityByBranch(
  filters: Omit<WalletLiabilityFilters, "page" | "pageSize" | "sortBy" | "sortDir" | "minBalance" | "dormantDays" | "includeZeroBalances" | "includeNegativeBalances">
): Promise<WalletLiabilityBranchPoint[]> {
  const db = await getDb();
  const period = periodCondition(filters);
  const scope = walletScopeClauses(filters);
  const cte = activeEnrollmentCte(filters.organizationId);

  const rows = await db.$queryRaw<Array<{ branchId: string | null; branchName: string | null; totalLiability: number }>>(Prisma.sql`
    WITH ActiveEnrollment AS (${cte}),
    WalletAgg AS (
      SELECT ${buildSelectFields(period)}
      ${baseFrom(filters.organizationId)}
      WHERE ${Prisma.join(scope, " AND ")}
      ${GROUP_BY_FIELDS}
    )
    SELECT branchId, branchName, ISNULL(SUM(CASE WHEN currentBalance > 0 THEN currentBalance ELSE 0 END), 0) AS totalLiability
    FROM WalletAgg
    GROUP BY branchId, branchName
    HAVING SUM(CASE WHEN currentBalance > 0 THEN currentBalance ELSE 0 END) > 0
    ORDER BY totalLiability DESC
  `);

  return rows.map((r) => ({
    branchId: r.branchId,
    branchName: r.branchId ? (r.branchName ?? r.branchId) : "Sem Filial",
    totalLiability: num(r.totalLiability),
  }));
}

export async function getWalletLiabilityByCourse(
  filters: Omit<WalletLiabilityFilters, "page" | "pageSize" | "sortBy" | "sortDir" | "minBalance" | "dormantDays" | "includeZeroBalances" | "includeNegativeBalances">
): Promise<WalletLiabilityCoursePoint[]> {
  const db = await getDb();
  const period = periodCondition(filters);
  const scope = walletScopeClauses(filters);
  const cte = activeEnrollmentCte(filters.organizationId);

  const rows = await db.$queryRaw<Array<{ courseId: string | null; courseName: string | null; totalLiability: number }>>(Prisma.sql`
    WITH ActiveEnrollment AS (${cte}),
    WalletAgg AS (
      SELECT ${buildSelectFields(period)}
      ${baseFrom(filters.organizationId)}
      WHERE ${Prisma.join(scope, " AND ")}
      ${GROUP_BY_FIELDS}
    )
    SELECT courseId, courseName, ISNULL(SUM(CASE WHEN currentBalance > 0 THEN currentBalance ELSE 0 END), 0) AS totalLiability
    FROM WalletAgg
    GROUP BY courseId, courseName
    HAVING SUM(CASE WHEN currentBalance > 0 THEN currentBalance ELSE 0 END) > 0
    ORDER BY totalLiability DESC
  `);

  return rows.map((r) => ({
    courseId: r.courseId,
    courseName: r.courseId ? (r.courseName ?? r.courseId) : "Sem Curso",
    totalLiability: num(r.totalLiability),
  }));
}

// =============================================================================
// MONTHLY TREND (chart 1) — transaction-level GROUP BY month, org/branch/
// course/student scoped. Cumulative liability = starting balance before the
// filtered period (one extra single-row aggregate) plus the running sum of
// each month's net movement — never a second pass over raw transactions.
// =============================================================================

export async function getWalletLiabilityMonthlyTrend(
  filters: Pick<WalletLiabilityFilters, "organizationId" | "branchId" | "courseId" | "studentId" | "dateFrom" | "dateTo">
): Promise<WalletLiabilityMonthlyPoint[]> {
  const db = await getDb();
  const cte = activeEnrollmentCte(filters.organizationId);

  const clauses: Prisma.Sql[] = [Prisma.sql`w.organizationId = ${filters.organizationId}`];
  if (filters.branchId) clauses.push(Prisma.sql`s.branchId = ${filters.branchId}`);
  if (filters.courseId) clauses.push(Prisma.sql`ae.courseId = ${filters.courseId}`);
  if (filters.studentId) clauses.push(Prisma.sql`w.studentId = ${filters.studentId}`);
  if (filters.dateFrom) clauses.push(Prisma.sql`t.createdAt >= ${new Date(filters.dateFrom)}`);
  if (filters.dateTo) {
    const end = new Date(filters.dateTo);
    end.setHours(23, 59, 59, 999);
    clauses.push(Prisma.sql`t.createdAt <= ${end}`);
  }

  const [rows, startingBalanceRow] = await Promise.all([
    db.$queryRaw<Array<{ month: string; creditsIssued: number; creditsConsumed: number }>>(Prisma.sql`
      WITH ActiveEnrollment AS (${cte})
      SELECT
        CONVERT(VARCHAR(7), t.createdAt, 120)                                                                  AS month,
        ISNULL(SUM(CASE WHEN CAST(t.amount AS FLOAT) > 0 THEN CAST(t.amount AS FLOAT) ELSE 0 END), 0)          AS creditsIssued,
        ABS(ISNULL(SUM(CASE WHEN CAST(t.amount AS FLOAT) < 0 THEN CAST(t.amount AS FLOAT) ELSE 0 END), 0))     AS creditsConsumed
      FROM student_wallet_transactions t
      JOIN student_wallets w ON w.id = t.studentWalletId
      JOIN students s ON s.id = w.studentId
      LEFT JOIN ActiveEnrollment ae ON ae.studentId = w.studentId AND ae.rn = 1
      WHERE ${Prisma.join(clauses, " AND ")}
      GROUP BY CONVERT(VARCHAR(7), t.createdAt, 120)
      ORDER BY month ASC
    `),
    filters.dateFrom
      ? db.$queryRaw<[{ balance: number }]>(Prisma.sql`
          SELECT ISNULL(SUM(CAST(t.amount AS FLOAT)), 0) AS balance
          FROM student_wallet_transactions t
          JOIN student_wallets w ON w.id = t.studentWalletId
          JOIN students s ON s.id = w.studentId
          LEFT JOIN ActiveEnrollment ae ON ae.studentId = w.studentId AND ae.rn = 1
          WHERE w.organizationId = ${filters.organizationId}
            ${filters.branchId ? Prisma.sql`AND s.branchId = ${filters.branchId}` : Prisma.sql``}
            ${filters.courseId ? Prisma.sql`AND ae.courseId = ${filters.courseId}` : Prisma.sql``}
            ${filters.studentId ? Prisma.sql`AND w.studentId = ${filters.studentId}` : Prisma.sql``}
            AND t.createdAt < ${new Date(filters.dateFrom)}
        `)
      : Promise.resolve([{ balance: 0 }] as [{ balance: number }]),
  ]);

  let cumulative = num(startingBalanceRow[0]?.balance);
  return rows.map((r) => {
    const creditsIssued = num(r.creditsIssued);
    const creditsConsumed = num(r.creditsConsumed);
    const netMovement = creditsIssued - creditsConsumed;
    cumulative += netMovement;
    return { month: r.month, creditsIssued, creditsConsumed, netMovement, cumulativeLiability: cumulative };
  });
}

// =============================================================================
// WATCHLIST SOURCES
// =============================================================================

export async function getNegativeBalanceWatchlist(db: Db, filters: WalletLiabilityFilters): Promise<WalletLiabilityWatchlistItem[]> {
  const period = periodCondition(filters);
  const scope = walletScopeClauses(filters);
  const cte = activeEnrollmentCte(filters.organizationId);

  const rows = await db.$queryRaw<RawAggRow[]>(Prisma.sql`
    WITH ActiveEnrollment AS (${cte})
    SELECT TOP (${WATCHLIST_LIMIT}) ${buildSelectFields(period)}
    ${baseFrom(filters.organizationId)}
    WHERE ${Prisma.join(scope, " AND ")}
    ${GROUP_BY_FIELDS}
    HAVING ISNULL(SUM(CAST(t.amount AS FLOAT)), 0) < 0
    ORDER BY SUM(CAST(t.amount AS FLOAT)) ASC
  `);

  return rows.map((r) => {
    const row = mapRow(r);
    return {
      severity: "CRITICAL",
      studentId: row.studentId,
      studentName: row.studentName,
      branchName: row.branchName,
      courseName: row.courseName,
      currentBalance: row.currentBalance,
      lastTransactionDate: row.lastTransactionDate,
      daysDormant: row.daysDormant,
      issue: `Saldo de carteira negativo: ${row.currentBalance.toFixed(2)} MT — possível defeito de integridade`,
      recommendedAction: "VIEW_STUDENT_STATEMENT",
      integrityIssueId: null,
      link: `/reports/finance/student-statement/${row.studentId}`,
    };
  });
}

export async function getBalanceBandWatchlist(db: Db, filters: WalletLiabilityFilters): Promise<WalletLiabilityWatchlistItem[]> {
  const period = periodCondition(filters);
  const scope = walletScopeClauses(filters);
  const cte = activeEnrollmentCte(filters.organizationId);

  const rows = await db.$queryRaw<RawAggRow[]>(Prisma.sql`
    WITH ActiveEnrollment AS (${cte})
    SELECT TOP (${WATCHLIST_LIMIT}) ${buildSelectFields(period)}
    ${baseFrom(filters.organizationId)}
    WHERE ${Prisma.join(scope, " AND ")}
    ${GROUP_BY_FIELDS}
    HAVING ISNULL(SUM(CAST(t.amount AS FLOAT)), 0) >= ${MEDIUM_BALANCE_THRESHOLD}
    ORDER BY SUM(CAST(t.amount AS FLOAT)) DESC
  `);

  return rows.map((r) => {
    const row = mapRow(r);
    const severity = row.currentBalance >= HIGH_BALANCE_THRESHOLD ? "HIGH" : "MEDIUM";
    return {
      severity,
      studentId: row.studentId,
      studentName: row.studentName,
      branchName: row.branchName,
      courseName: row.courseName,
      currentBalance: row.currentBalance,
      lastTransactionDate: row.lastTransactionDate,
      daysDormant: row.daysDormant,
      issue: `Saldo de carteira elevado: ${row.currentBalance.toFixed(2)} MT`,
      recommendedAction: "VIEW_STUDENT",
      integrityIssueId: null,
      link: `/students/${row.studentId}`,
    } as WalletLiabilityWatchlistItem;
  });
}

export async function getDormancyBandWatchlist(db: Db, filters: WalletLiabilityFilters): Promise<WalletLiabilityWatchlistItem[]> {
  const period = periodCondition(filters);
  const scope = walletScopeClauses(filters);
  const cte = activeEnrollmentCte(filters.organizationId);

  const rows = await db.$queryRaw<RawAggRow[]>(Prisma.sql`
    WITH ActiveEnrollment AS (${cte})
    SELECT TOP (${WATCHLIST_LIMIT}) ${buildSelectFields(period)}
    ${baseFrom(filters.organizationId)}
    WHERE ${Prisma.join(scope, " AND ")}
    ${GROUP_BY_FIELDS}
    HAVING ISNULL(SUM(CAST(t.amount AS FLOAT)), 0) > 0
       AND DATEDIFF(day, MAX(t.createdAt), GETDATE()) >= ${MEDIUM_DORMANT_DAYS}
    ORDER BY DATEDIFF(day, MAX(t.createdAt), GETDATE()) DESC
  `);

  return rows.map((r) => {
    const row = mapRow(r);
    const severity = (row.daysDormant ?? 0) >= HIGH_DORMANT_DAYS ? "HIGH" : "MEDIUM";
    return {
      severity,
      studentId: row.studentId,
      studentName: row.studentName,
      branchName: row.branchName,
      courseName: row.courseName,
      currentBalance: row.currentBalance,
      lastTransactionDate: row.lastTransactionDate,
      daysDormant: row.daysDormant,
      issue: `Carteira dormente há ${row.daysDormant} dias, com saldo de ${row.currentBalance.toFixed(2)} MT`,
      recommendedAction: "VIEW_WALLET_ACTIVITY",
      integrityIssueId: null,
      link: `/reports/finance/wallets?studentId=${row.studentId}`,
    } as WalletLiabilityWatchlistItem;
  });
}

export async function getConcentrationWatchlist(
  db: Db,
  filters: WalletLiabilityFilters,
  totalLiability: number
): Promise<WalletLiabilityWatchlistItem[]> {
  if (totalLiability <= 0) return [];
  const threshold = totalLiability * CONCENTRATION_SHARE;

  const period = periodCondition(filters);
  const scope = walletScopeClauses(filters);
  const cte = activeEnrollmentCte(filters.organizationId);

  const rows = await db.$queryRaw<RawAggRow[]>(Prisma.sql`
    WITH ActiveEnrollment AS (${cte})
    SELECT TOP (3) ${buildSelectFields(period)}
    ${baseFrom(filters.organizationId)}
    WHERE ${Prisma.join(scope, " AND ")}
    ${GROUP_BY_FIELDS}
    HAVING ISNULL(SUM(CAST(t.amount AS FLOAT)), 0) > 0
       AND ISNULL(SUM(CAST(t.amount AS FLOAT)), 0) < ${MEDIUM_BALANCE_THRESHOLD}
       AND ISNULL(SUM(CAST(t.amount AS FLOAT)), 0) > ${threshold}
    ORDER BY SUM(CAST(t.amount AS FLOAT)) DESC
  `);

  return rows.map((r) => {
    const row = mapRow(r);
    const share = totalLiability > 0 ? (row.currentBalance / totalLiability) * 100 : 0;
    return {
      severity: "LOW",
      studentId: row.studentId,
      studentName: row.studentName,
      branchName: row.branchName,
      courseName: row.courseName,
      currentBalance: row.currentBalance,
      lastTransactionDate: row.lastTransactionDate,
      daysDormant: row.daysDormant,
      issue: `Concentra ${share.toFixed(1)}% do passivo total de carteiras`,
      recommendedAction: "VIEW_STUDENT",
      integrityIssueId: null,
      link: `/students/${row.studentId}`,
    } as WalletLiabilityWatchlistItem;
  });
}

export async function getIntegrityWatchlist(db: Db, organizationId: string): Promise<WalletLiabilityWatchlistItem[]> {
  const rows = await db.$queryRaw<
    Array<{ id: string; entityType: string; entityId: string; description: string; severity: string; detectedAt: Date }>
  >(Prisma.sql`
    SELECT TOP (${WATCHLIST_LIMIT}) id, entityType, entityId, description, severity, detectedAt
    FROM financial_integrity_issues
    WHERE organizationId = ${organizationId}
      AND status = 'OPEN'
      AND (category = 'WALLET_BALANCE' OR checkName = 'wallet_transaction.missing_wallet')
    ORDER BY detectedAt DESC
  `);

  return rows.map((r) => ({
    severity: r.severity as WalletLiabilityWatchlistItem["severity"],
    studentId: null,
    studentName: `${r.entityType} ${r.entityId}`,
    branchName: "—",
    courseName: "—",
    currentBalance: null,
    lastTransactionDate: null,
    daysDormant: null,
    issue: r.description,
    recommendedAction: "VIEW_INTEGRITY",
    integrityIssueId: r.id,
    link: `/reports/finance/integrity?entityType=${encodeURIComponent(r.entityType)}`,
  }));
}

const SEVERITY_RANK: Record<string, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };

export async function getWalletLiabilityWatchlist(
  filters: WalletLiabilityFilters,
  totalLiability: number
): Promise<WalletLiabilityWatchlistItem[]> {
  const db = await getDb();

  const [negative, integrity, balanceBand, dormancyBand, concentration] = await Promise.all([
    getNegativeBalanceWatchlist(db, filters),
    getIntegrityWatchlist(db, filters.organizationId),
    getBalanceBandWatchlist(db, filters),
    getDormancyBandWatchlist(db, filters),
    getConcentrationWatchlist(db, filters, totalLiability),
  ]);

  return [...negative, ...integrity, ...balanceBand, ...dormancyBand, ...concentration].sort(
    (a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]
  );
}

// =============================================================================
// INTEGRITY WARNING FLAG
// =============================================================================

export async function hasCriticalWalletIntegrityIssue(organizationId: string): Promise<boolean> {
  const db = await getDb();
  const [row] = await db.$queryRaw<[{ cnt: number | bigint }]>(Prisma.sql`
    SELECT COUNT(*) AS cnt
    FROM financial_integrity_issues
    WHERE organizationId = ${organizationId}
      AND status = 'OPEN'
      AND severity = 'CRITICAL'
      AND (category = 'WALLET_BALANCE' OR checkName = 'wallet_transaction.missing_wallet')
  `);
  return Number(row?.cnt ?? 0) > 0;
}
