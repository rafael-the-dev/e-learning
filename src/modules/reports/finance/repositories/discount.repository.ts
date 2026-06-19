import { Prisma } from "@prisma/client";
import { getDb } from "@/server/db";
import type {
  DiscountReportFilters,
  DiscountReportRow,
  DiscountReportKPIs,
  DiscountByRulePoint,
  DiscountByBranchPoint,
  DiscountByCoursePoint,
  DiscountMonthlyPoint,
  DiscountWatchlistItem,
} from "../types";

// ── Numeric coercion ────────────────────────────────────────────────────────
type DecimalLike = { toNumber(): number };

function toNum(v: DecimalLike | number | null | undefined): number {
  if (v == null) return 0;
  return typeof v === "object" && "toNumber" in v ? v.toNumber() : (v as number);
}

// Per-row leakage rate = (sum of discounts on this invoice that match the
// current filters) / invoice.subtotal * 100. Uses a window function so the
// table/watchlist queries (one row per AppliedDiscount, no GROUP BY) get an
// invoice-level total without a second round trip. When a discountRuleId /
// discountType / minDiscountAmount filter narrows the WHERE clause, the
// window only sums the rows that pass that filter — i.e. it reflects the
// filtered view, not necessarily 100% of the invoice's real-world discounts
// if other unrelated rules also applied and were filtered out. Documented in
// docs/financial-reports.md.
const LEAKAGE_RATE_EXPR = `CASE WHEN i.subtotal <> 0 THEN (SUM(CAST(ad.amount AS FLOAT)) OVER (PARTITION BY ad.invoiceId) / CAST(i.subtotal AS FLOAT)) * 100 ELSE 0 END`;

// ── Watchlist severity thresholds (see docs/financial-reports.md "Discount Watchlist") ──
const WATCHLIST_LIMIT = 20;
const CRITICAL_AMOUNT = 50000;
const CRITICAL_RATE = 50;
const HIGH_AMOUNT = 10000;
const HIGH_RATE = 30;
const MEDIUM_AMOUNT = 5000;
const MEDIUM_RATE = 15;

// ── Sort whitelist (table is rooted at AppliedDiscount) ─────────────────────
const SORT_EXPRESSIONS: Record<string, string> = {
  createdAt: "ad.createdAt",
  discountAmount: "CAST(ad.amount AS FLOAT)",
  leakageRate: LEAKAGE_RATE_EXPR,
  invoiceNumber: "i.invoiceNumber",
  studentName: "s.firstName",
};

function resolveOrderBy(sortBy?: string, sortDir?: string): Prisma.Sql {
  if (!sortBy || !SORT_EXPRESSIONS[sortBy]) {
    // Default sort per spec: Discount Amount DESC.
    return Prisma.raw(`${SORT_EXPRESSIONS.discountAmount} DESC`);
  }
  const expr = SORT_EXPRESSIONS[sortBy];
  const dir = sortDir === "asc" ? "ASC" : "DESC";
  return Prisma.raw(`${expr} ${dir}`);
}

// ── WHERE builder — discount-rooted queries (KPIs part 1, by-rule/branch/course, trend, table, watchlist) ──
type DiscountWhereFilters = Pick<
  DiscountReportFilters,
  | "organizationId" | "branchId" | "courseId" | "academicYearId" | "academicTermId"
  | "dateFrom" | "dateTo" | "discountRuleId" | "discountType" | "invoiceStatus"
  | "studentId" | "appliedBy" | "minDiscountAmount"
>;

function buildDiscountWhere(filters: Partial<DiscountWhereFilters> & Pick<DiscountWhereFilters, "organizationId">): Prisma.Sql {
  const clauses: Prisma.Sql[] = [
    Prisma.sql`ad.organizationId = ${filters.organizationId}`,
    Prisma.sql`i.deletedAt IS NULL`,
  ];

  // "Exclude CANCELLED by default; include only if explicitly requested."
  if (filters.invoiceStatus) {
    clauses.push(Prisma.sql`i.status = ${filters.invoiceStatus}`);
  } else {
    clauses.push(Prisma.sql`i.status <> 'CANCELLED'`);
  }

  if (filters.branchId) clauses.push(Prisma.sql`i.branchId = ${filters.branchId}`);
  if (filters.courseId) clauses.push(Prisma.sql`e.courseId = ${filters.courseId}`);
  if (filters.academicYearId) clauses.push(Prisma.sql`e.academicYearId = ${filters.academicYearId}`);
  if (filters.academicTermId) clauses.push(Prisma.sql`e.academicTermId = ${filters.academicTermId}`);
  // Date basis: AppliedDiscount.createdAt (see types/index.ts section comment).
  if (filters.dateFrom) clauses.push(Prisma.sql`ad.createdAt >= ${new Date(filters.dateFrom)}`);
  if (filters.dateTo) clauses.push(Prisma.sql`ad.createdAt <= ${new Date(filters.dateTo)}`);
  if (filters.discountRuleId) clauses.push(Prisma.sql`ad.discountRuleId = ${filters.discountRuleId}`);
  if (filters.discountType) clauses.push(Prisma.sql`dr.discountType = ${filters.discountType}`);
  if (filters.studentId) clauses.push(Prisma.sql`i.studentId = ${filters.studentId}`);
  // Tenant isolation is structural: organizationId is always ANDed in, so a
  // cross-tenant appliedBy/studentId simply matches zero rows.
  if (filters.appliedBy) clauses.push(Prisma.sql`i.createdBy = ${filters.appliedBy}`);
  if (filters.minDiscountAmount != null) clauses.push(Prisma.sql`CAST(ad.amount AS FLOAT) >= ${filters.minDiscountAmount}`);

  return Prisma.sql`WHERE ${Prisma.join(clauses, " AND ")}`;
}

const BASE_FROM = Prisma.sql`
  FROM applied_discounts ad
  JOIN invoices       i  ON i.id = ad.invoiceId
  JOIN discount_rules dr ON dr.id = ad.discountRuleId
  LEFT JOIN students    s ON s.id = i.studentId    AND s.deletedAt IS NULL
  LEFT JOIN branches    b ON b.id = i.branchId
  LEFT JOIN enrollments e ON e.id = i.enrollmentId AND e.deletedAt IS NULL
  LEFT JOIN courses     c ON c.id = e.courseId
  LEFT JOIN users       u ON u.id = i.createdBy
`;

// ── Invoice-rooted WHERE (for Gross Before Discounts / Net Invoiced / Discounted Invoices Count) ──
// Distinct from the discount-rooted WHERE above: this scopes to invoices
// directly so an invoice with N applied discounts is never counted N times,
// and a row-level SUM(invoice.totalAmount) is never multiplied by discount count.
function buildInvoiceWhere(filters: Partial<DiscountWhereFilters> & Pick<DiscountWhereFilters, "organizationId">): Prisma.Sql {
  const clauses: Prisma.Sql[] = [
    Prisma.sql`i.organizationId = ${filters.organizationId}`,
    Prisma.sql`i.deletedAt IS NULL`,
  ];

  if (filters.invoiceStatus) {
    clauses.push(Prisma.sql`i.status = ${filters.invoiceStatus}`);
  } else {
    clauses.push(Prisma.sql`i.status <> 'CANCELLED'`);
  }

  if (filters.branchId) clauses.push(Prisma.sql`i.branchId = ${filters.branchId}`);
  if (filters.courseId) clauses.push(Prisma.sql`e.courseId = ${filters.courseId}`);
  if (filters.academicYearId) clauses.push(Prisma.sql`e.academicYearId = ${filters.academicYearId}`);
  if (filters.academicTermId) clauses.push(Prisma.sql`e.academicTermId = ${filters.academicTermId}`);
  if (filters.dateFrom) clauses.push(Prisma.sql`i.issueDate >= ${new Date(filters.dateFrom)}`);
  if (filters.dateTo) clauses.push(Prisma.sql`i.issueDate <= ${new Date(filters.dateTo)}`);
  if (filters.studentId) clauses.push(Prisma.sql`i.studentId = ${filters.studentId}`);
  if (filters.appliedBy) clauses.push(Prisma.sql`i.createdBy = ${filters.appliedBy}`);

  // Scope down to invoices that have a discount matching the discount-specific
  // filters — keeps Gross Before Discounts / Net Invoiced / Discounted
  // Invoices internally consistent with the discount-rooted aggregates above
  // (same pattern as Tax Report's taxRuleId scoping).
  if (filters.discountRuleId || filters.discountType || filters.minDiscountAmount != null) {
    const existsClauses: Prisma.Sql[] = [Prisma.sql`ad2.invoiceId = i.id`];
    if (filters.discountRuleId) existsClauses.push(Prisma.sql`ad2.discountRuleId = ${filters.discountRuleId}`);
    if (filters.minDiscountAmount != null) existsClauses.push(Prisma.sql`CAST(ad2.amount AS FLOAT) >= ${filters.minDiscountAmount}`);
    if (filters.discountType) {
      clauses.push(Prisma.sql`EXISTS (
        SELECT 1 FROM applied_discounts ad2
        JOIN discount_rules dr2 ON dr2.id = ad2.discountRuleId
        WHERE ${Prisma.join([...existsClauses, Prisma.sql`dr2.discountType = ${filters.discountType}`], " AND ")}
      )`);
    } else {
      clauses.push(Prisma.sql`EXISTS (SELECT 1 FROM applied_discounts ad2 WHERE ${Prisma.join(existsClauses, " AND ")})`);
    }
  }

  return Prisma.sql`WHERE ${Prisma.join(clauses, " AND ")}`;
}

// ── Raw row shape ────────────────────────────────────────────────────────────
interface RawDiscountRow {
  id: string;
  invoiceId: string;
  invoiceNumber: string;
  studentId: string | null;
  firstName: string | null;
  lastName: string | null;
  branchId: string | null;
  branchName: string | null;
  courseId: string | null;
  courseName: string | null;
  discountRuleId: string;
  discountRuleName: string;
  discountType: string;
  discountAmount: number;
  invoiceSubtotal: number;
  invoiceTotal: number;
  leakageRate: number;
  appliedByUserId: string | null;
  appliedByName: string | null;
  appliedAt: Date;
  status: string;
}

// ── KPIs ─────────────────────────────────────────────────────────────────────
export async function getDiscountKPIs(filters: DiscountWhereFilters): Promise<DiscountReportKPIs> {
  const db = await getDb();
  const discountWhere = buildDiscountWhere(filters);
  const invoiceWhere = buildInvoiceWhere(filters);

  const [[discountRow], [invoiceRow]] = await Promise.all([
    db.$queryRaw<[{ totalDiscounts: number; largestDiscount: number | null }]>(Prisma.sql`
      SELECT
        ISNULL(SUM(CAST(ad.amount AS FLOAT)), 0) AS totalDiscounts,
        MAX(CAST(ad.amount AS FLOAT)) AS largestDiscount
      ${BASE_FROM}
      ${discountWhere}
    `),
    db.$queryRaw<[{ grossBeforeDiscounts: number; netInvoiced: number; discountedInvoicesCount: number | bigint }]>(Prisma.sql`
      SELECT
        ISNULL(SUM(CAST(i.subtotal AS FLOAT)), 0) AS grossBeforeDiscounts,
        ISNULL(SUM(CAST(i.totalAmount AS FLOAT)), 0) AS netInvoiced,
        COUNT(CASE WHEN EXISTS (
          SELECT 1 FROM applied_discounts ad3 WHERE ad3.invoiceId = i.id
        ) THEN 1 END) AS discountedInvoicesCount
      FROM invoices i
      LEFT JOIN enrollments e ON e.id = i.enrollmentId AND e.deletedAt IS NULL
      ${invoiceWhere}
    `),
  ]);

  const totalDiscounts = toNum(discountRow?.totalDiscounts);
  const grossBeforeDiscounts = toNum(invoiceRow?.grossBeforeDiscounts);
  const discountedInvoicesCount = Number(invoiceRow?.discountedInvoicesCount ?? 0);

  return {
    totalDiscounts,
    discountedInvoicesCount,
    grossBeforeDiscounts,
    netInvoiced: toNum(invoiceRow?.netInvoiced),
    revenueLeakageRate: grossBeforeDiscounts > 0 ? (totalDiscounts / grossBeforeDiscounts) * 100 : 0,
    averageDiscountPerInvoice: discountedInvoicesCount > 0 ? totalDiscounts / discountedInvoicesCount : 0,
    largestDiscount: toNum(discountRow?.largestDiscount),
    // AppliedDiscount.discountRuleId is NOT NULL and DiscountRule.discountType
    // has no "MANUAL" value — the schema has no concept of a manually-entered
    // discount, so this is always 0. See types/index.ts section comment.
    manualDiscountsAmount: 0,
    manualDiscountsCount: 0,
  };
}

// ── Discounts by rule ────────────────────────────────────────────────────────
export async function getDiscountByRule(filters: DiscountWhereFilters): Promise<DiscountByRulePoint[]> {
  const db = await getDb();
  const whereFragment = buildDiscountWhere(filters);

  const rows = await db.$queryRaw<{ discountRuleId: string; discountRuleName: string; discountAmount: number; count: number | bigint }[]>(Prisma.sql`
    SELECT
      ad.discountRuleId,
      dr.name AS discountRuleName,
      ISNULL(SUM(CAST(ad.amount AS FLOAT)), 0) AS discountAmount,
      COUNT(*) AS count
    ${BASE_FROM}
    ${whereFragment}
    GROUP BY ad.discountRuleId, dr.name
    ORDER BY discountAmount DESC
  `);

  return rows.map((r) => ({
    discountRuleId: r.discountRuleId,
    discountRuleName: r.discountRuleName,
    discountAmount: toNum(r.discountAmount),
    count: Number(r.count),
  }));
}

// ── Discounts by branch ──────────────────────────────────────────────────────
export async function getDiscountByBranch(filters: DiscountWhereFilters): Promise<DiscountByBranchPoint[]> {
  const db = await getDb();
  const whereFragment = buildDiscountWhere(filters);

  const rows = await db.$queryRaw<{ branchId: string | null; branchName: string | null; discountAmount: number }[]>(Prisma.sql`
    SELECT
      i.branchId,
      ISNULL(b.name, 'Sem Filial') AS branchName,
      ISNULL(SUM(CAST(ad.amount AS FLOAT)), 0) AS discountAmount
    ${BASE_FROM}
    ${whereFragment}
    GROUP BY i.branchId, b.name
    ORDER BY discountAmount DESC
  `);

  return rows.map((r) => ({
    branchId: r.branchId,
    branchName: r.branchName ?? "Sem Filial",
    discountAmount: toNum(r.discountAmount),
  }));
}

// ── Discounts by course ──────────────────────────────────────────────────────
export async function getDiscountByCourse(filters: DiscountWhereFilters): Promise<DiscountByCoursePoint[]> {
  const db = await getDb();
  const whereFragment = buildDiscountWhere(filters);

  const rows = await db.$queryRaw<{ courseId: string | null; courseName: string | null; discountAmount: number }[]>(Prisma.sql`
    SELECT
      e.courseId,
      ISNULL(c.name, 'Sem Curso') AS courseName,
      ISNULL(SUM(CAST(ad.amount AS FLOAT)), 0) AS discountAmount
    ${BASE_FROM}
    ${whereFragment}
    GROUP BY e.courseId, c.name
    ORDER BY discountAmount DESC
  `);

  return rows.map((r) => ({
    courseId: r.courseId,
    courseName: r.courseName ?? "Sem Curso",
    discountAmount: toNum(r.discountAmount),
  }));
}

// ── Monthly trend (Discounts by Month chart) ────────────────────────────────
export async function getDiscountMonthlyTrend(filters: DiscountWhereFilters): Promise<DiscountMonthlyPoint[]> {
  const db = await getDb();
  const whereFragment = buildDiscountWhere(filters);

  const rows = await db.$queryRaw<{ month: string; discountAmount: number }[]>(Prisma.sql`
    SELECT
      CONVERT(VARCHAR(7), ad.createdAt, 120) AS month,
      ISNULL(SUM(CAST(ad.amount AS FLOAT)), 0) AS discountAmount
    ${BASE_FROM}
    ${whereFragment}
    GROUP BY CONVERT(VARCHAR(7), ad.createdAt, 120)
    ORDER BY month ASC
  `);

  return rows.map((r) => ({ month: r.month, discountAmount: toNum(r.discountAmount) }));
}

// ── Paginated row list ───────────────────────────────────────────────────────
export async function listDiscountRows(
  filters: DiscountReportFilters
): Promise<{ rows: DiscountReportRow[]; total: number }> {
  const db = await getDb();
  const { page, pageSize } = filters;
  const skip = (page - 1) * pageSize;
  const whereFragment = buildDiscountWhere(filters);
  const orderByExpr = resolveOrderBy(filters.sortBy, filters.sortDir);

  const [rawRows, countResult] = await Promise.all([
    db.$queryRaw<RawDiscountRow[]>(Prisma.sql`
      SELECT
        ad.id,
        i.id AS invoiceId,
        i.invoiceNumber,
        i.studentId,
        s.firstName,
        s.lastName,
        i.branchId,
        b.name AS branchName,
        e.courseId,
        c.name AS courseName,
        ad.discountRuleId,
        dr.name AS discountRuleName,
        dr.discountType,
        CAST(ad.amount AS FLOAT) AS discountAmount,
        CAST(i.subtotal AS FLOAT) AS invoiceSubtotal,
        CAST(i.totalAmount AS FLOAT) AS invoiceTotal,
        ${Prisma.raw(LEAKAGE_RATE_EXPR)} AS leakageRate,
        i.createdBy AS appliedByUserId,
        u.name AS appliedByName,
        ad.createdAt AS appliedAt,
        i.status
      ${BASE_FROM}
      ${whereFragment}
      ORDER BY ${orderByExpr}
      OFFSET ${skip} ROWS FETCH NEXT ${pageSize} ROWS ONLY
    `),
    db.$queryRaw<[{ total: bigint }]>(Prisma.sql`
      SELECT COUNT(*) AS total
      ${BASE_FROM}
      ${whereFragment}
    `),
  ]);

  const total = Number(countResult[0]?.total ?? 0);

  const rows: DiscountReportRow[] = rawRows.map((r) => ({
    appliedDiscountId: r.id,
    invoiceId: r.invoiceId,
    invoiceNumber: r.invoiceNumber,
    studentId: r.studentId,
    studentName: r.firstName ? `${r.firstName} ${r.lastName ?? ""}`.trim() : null,
    branchId: r.branchId,
    branchName: r.branchName ?? null,
    courseId: r.courseId,
    courseName: r.courseName ?? null,
    discountRuleId: r.discountRuleId,
    discountRuleName: r.discountRuleName,
    discountType: r.discountType,
    discountAmount: toNum(r.discountAmount),
    invoiceSubtotal: toNum(r.invoiceSubtotal),
    invoiceTotal: toNum(r.invoiceTotal),
    leakageRate: toNum(r.leakageRate),
    appliedByUserId: r.appliedByUserId,
    appliedByName: r.appliedByName,
    appliedAt: r.appliedAt,
    status: r.status,
  }));

  return { rows, total };
}

// ── Top Leakage Watchlist ────────────────────────────────────────────────────
// Single discount-rooted query: severity is driven by whichever threshold the
// row crosses (single-discount amount OR this invoice's overall leakage
// rate — see thresholds above). "LOW / informational" rows are intentionally
// not surfaced here (every discount would qualify, defeating the purpose of a
// *Top* Leakage Watchlist) — the full population remains visible in the
// paginated table regardless of severity.
export async function getDiscountWatchlist(filters: DiscountWhereFilters): Promise<DiscountWatchlistItem[]> {
  const db = await getDb();
  const whereFragment = buildDiscountWhere(filters);

  // SQL Server forbids window functions (OVER) in a WHERE clause, so
  // leakageRate is computed once in a CTE and then filtered/ordered as a
  // plain column in the outer query.
  const rows = await db.$queryRaw<RawDiscountRow[]>(Prisma.sql`
    WITH DiscountRows AS (
      SELECT
        ad.id,
        i.id AS invoiceId,
        i.invoiceNumber,
        i.studentId,
        s.firstName,
        s.lastName,
        i.branchId,
        b.name AS branchName,
        e.courseId,
        c.name AS courseName,
        ad.discountRuleId,
        dr.name AS discountRuleName,
        dr.discountType,
        CAST(ad.amount AS FLOAT) AS discountAmount,
        CAST(i.subtotal AS FLOAT) AS invoiceSubtotal,
        CAST(i.totalAmount AS FLOAT) AS invoiceTotal,
        ${Prisma.raw(LEAKAGE_RATE_EXPR)} AS leakageRate,
        i.createdBy AS appliedByUserId,
        u.name AS appliedByName,
        ad.createdAt AS appliedAt,
        i.status
      ${BASE_FROM}
      ${whereFragment}
    )
    SELECT TOP (${WATCHLIST_LIMIT}) *
    FROM DiscountRows
    WHERE discountAmount >= ${MEDIUM_AMOUNT} OR leakageRate >= ${MEDIUM_RATE}
    ORDER BY
      CASE
        WHEN discountAmount >= ${CRITICAL_AMOUNT} OR leakageRate >= ${CRITICAL_RATE} THEN 0
        WHEN discountAmount >= ${HIGH_AMOUNT} OR leakageRate >= ${HIGH_RATE} THEN 1
        ELSE 2
      END,
      discountAmount DESC
  `);

  return rows.map((r) => {
    const discountAmount = toNum(r.discountAmount);
    const leakageRate = toNum(r.leakageRate);

    const severity =
      discountAmount >= CRITICAL_AMOUNT || leakageRate >= CRITICAL_RATE ? "CRITICAL" :
      discountAmount >= HIGH_AMOUNT || leakageRate >= HIGH_RATE ? "HIGH" :
      "MEDIUM";

    // Rate-triggered ⇒ this rule wiped out a large share of this specific
    // invoice (review the rule's configuration). Amount-triggered ⇒ a single
    // large one-off discount (go look at the invoice itself).
    const recommendedAction = leakageRate >= MEDIUM_RATE ? "REVIEW_DISCOUNT_RULE" : "VIEW_INVOICE";
    const link = recommendedAction === "REVIEW_DISCOUNT_RULE"
      ? "/settings/billing/discounts"
      : `/invoices/${r.invoiceId}`;

    return {
      severity,
      invoiceId: r.invoiceId,
      invoiceNumber: r.invoiceNumber,
      studentId: r.studentId,
      studentName: r.firstName ? `${r.firstName} ${r.lastName ?? ""}`.trim() : "—",
      branchName: r.branchName ?? "Sem Filial",
      courseName: r.courseName ?? "Sem Curso",
      discountAmount,
      leakageRate,
      discountRuleName: r.discountRuleName,
      appliedByName: r.appliedByName,
      recommendedAction,
      link,
    } as DiscountWatchlistItem;
  });
}

// ── Integrity warning flag ──────────────────────────────────────────────────
// Discount amounts are part of Invoice.totalAmount (subtotal - discount + tax),
// so a critical INVOICE_BALANCE issue (e.g. "invoice.total_formula") means the
// discount figures shown here may not reflect reality.
export async function hasCriticalDiscountIntegrityIssue(organizationId: string): Promise<boolean> {
  const db = await getDb();
  const [{ count }] = await db.$queryRaw<[{ count: number | bigint }]>(Prisma.sql`
    SELECT COUNT(*) AS count
    FROM financial_integrity_issues
    WHERE organizationId = ${organizationId}
      AND status = 'OPEN'
      AND severity = 'CRITICAL'
      AND category = 'INVOICE_BALANCE'
  `);
  return Number(count) > 0;
}
