import { Prisma } from "@prisma/client";
import { getDb } from "@/server/db";
import type {
  RefundAnalysisFilters,
  RefundAnalysisKPIs,
  RefundAnalysisRow,
  RefundTrendPoint,
  RefundAmountTrendPoint,
  RefundByBranchPoint,
  RefundByCoursePoint,
  RefundByStatusPoint,
  RefundProcessingTimeTrendPoint,
  RefundWatchlistItem,
  RefundWatchlistAction,
  ReconciliationSeverity,
} from "../types";

type DecimalLike = { toNumber(): number };

function toNum(v: DecimalLike | number | null | undefined): number {
  if (v == null) return 0;
  return typeof v === "object" && "toNumber" in v ? v.toNumber() : (v as number);
}

// Watchlist tuning constants — see docs/financial-reports.md "Refund Analysis Watchlist".
const WATCHLIST_LIMIT = 20;
const CRITICAL_AMOUNT = 50000;
const CRITICAL_APPROVED_DAYS = 30;
const CRITICAL_PENDING_DAYS = 60;
const HIGH_AMOUNT = 10000;
const HIGH_PENDING_DAYS = 30;
const MEDIUM_AMOUNT = 5000;
const MEDIUM_PENDING_DAYS = 14;

// Rooted at refunds — Refund already carries its own branchId/studentId/
// enrollmentId/invoiceId, more direct than the spec's illustrative
// Refund -> Payment -> Invoice -> Enrollment -> Course join chain. COALESCE
// prefers the most direct stored field, falling back through the chain —
// the same principle the spec's own branch fallback applies. refunds -> 1
// payment is a straight FK lookup, so this join never multiplies rows.
const BASE_FROM = Prisma.sql`
  FROM refunds r
  JOIN payments p ON p.id = r.paymentId
  LEFT JOIN invoices i ON i.id = COALESCE(r.invoiceId, p.invoiceId)
  LEFT JOIN enrollments e ON e.id = COALESCE(r.enrollmentId, p.enrollmentId, i.enrollmentId) AND e.deletedAt IS NULL
  LEFT JOIN courses c ON c.id = e.courseId
  LEFT JOIN branches b ON b.id = COALESCE(r.branchId, p.branchId, i.branchId)
  LEFT JOIN students st ON st.id = COALESCE(r.studentId, p.studentId, i.studentId) AND st.deletedAt IS NULL
`;

type WhereFilters = Pick<
  RefundAnalysisFilters,
  | "organizationId" | "branchId" | "courseId" | "studentId" | "academicYearId" | "academicTermId"
  | "dateFrom" | "dateTo" | "status" | "minAmount"
>;

// Population filter — Refund.createdAt is the date basis for everything
// except the completedAt-bucketed queries below (see type-file comment).
function buildWhereClauses(filters: WhereFilters): Prisma.Sql[] {
  const clauses: Prisma.Sql[] = [
    Prisma.sql`r.organizationId = ${filters.organizationId}`,
    Prisma.sql`r.deletedAt IS NULL`,
  ];

  if (filters.status) clauses.push(Prisma.sql`r.status = ${filters.status}`);
  if (filters.branchId) clauses.push(Prisma.sql`COALESCE(r.branchId, p.branchId, i.branchId) = ${filters.branchId}`);
  if (filters.courseId) clauses.push(Prisma.sql`e.courseId = ${filters.courseId}`);
  if (filters.studentId) clauses.push(Prisma.sql`COALESCE(r.studentId, p.studentId, i.studentId) = ${filters.studentId}`);
  if (filters.academicYearId) clauses.push(Prisma.sql`e.academicYearId = ${filters.academicYearId}`);
  if (filters.academicTermId) clauses.push(Prisma.sql`e.academicTermId = ${filters.academicTermId}`);
  if (filters.dateFrom) clauses.push(Prisma.sql`r.createdAt >= ${new Date(filters.dateFrom)}`);
  if (filters.dateTo) {
    const end = new Date(filters.dateTo);
    end.setHours(23, 59, 59, 999);
    clauses.push(Prisma.sql`r.createdAt <= ${end}`);
  }
  if (filters.minAmount != null) clauses.push(Prisma.sql`CAST(r.amount AS FLOAT) >= ${filters.minAmount}`);

  return clauses;
}

function buildWhere(filters: WhereFilters): Prisma.Sql {
  return Prisma.sql`WHERE ${Prisma.join(buildWhereClauses(filters), " AND ")}`;
}

// ── Invoice-rooted "gross collected" — Refund Rate's denominator, reusing
// Revenue Trend's exact collection definition (SUM(Invoice.paidAmount) for
// non-cancelled invoices, scoped by Invoice.issueDate). See type-file
// comment: this intentionally uses a different date column than the refund
// side of the ratio, matching Revenue Trend's own internal precedent. ──────
type InvoiceWhereFilters = Pick<
  RefundAnalysisFilters,
  "organizationId" | "branchId" | "courseId" | "studentId" | "academicYearId" | "academicTermId" | "dateFrom" | "dateTo"
>;

function buildInvoiceWhere(filters: InvoiceWhereFilters): Prisma.Sql {
  const clauses: Prisma.Sql[] = [
    Prisma.sql`i.organizationId = ${filters.organizationId}`,
    Prisma.sql`i.deletedAt IS NULL`,
    Prisma.sql`i.status <> 'CANCELLED'`,
  ];

  if (filters.branchId) clauses.push(Prisma.sql`i.branchId = ${filters.branchId}`);
  if (filters.studentId) clauses.push(Prisma.sql`i.studentId = ${filters.studentId}`);
  if (filters.dateFrom) clauses.push(Prisma.sql`i.issueDate >= ${new Date(filters.dateFrom)}`);
  if (filters.dateTo) {
    const end = new Date(filters.dateTo);
    end.setHours(23, 59, 59, 999);
    clauses.push(Prisma.sql`i.issueDate <= ${end}`);
  }
  if (filters.courseId) {
    clauses.push(Prisma.sql`EXISTS (SELECT 1 FROM enrollments e2 WHERE e2.id = i.enrollmentId AND e2.courseId = ${filters.courseId} AND e2.deletedAt IS NULL)`);
  }
  if (filters.academicYearId) {
    clauses.push(Prisma.sql`EXISTS (SELECT 1 FROM enrollments e2 WHERE e2.id = i.enrollmentId AND e2.academicYearId = ${filters.academicYearId} AND e2.deletedAt IS NULL)`);
  }
  if (filters.academicTermId) {
    clauses.push(Prisma.sql`EXISTS (SELECT 1 FROM enrollments e2 WHERE e2.id = i.enrollmentId AND e2.academicTermId = ${filters.academicTermId} AND e2.deletedAt IS NULL)`);
  }

  return Prisma.sql`WHERE ${Prisma.join(clauses, " AND ")}`;
}

export async function getGrossCollected(filters: InvoiceWhereFilters): Promise<number> {
  const db = await getDb();
  const where = buildInvoiceWhere(filters);
  const [row] = await db.$queryRaw<[{ grossCollected: number }]>(Prisma.sql`
    SELECT ISNULL(SUM(CAST(i.paidAmount AS FLOAT)), 0) AS grossCollected
    FROM invoices i
    ${where}
  `);
  return toNum(row?.grossCollected);
}

// ── KPIs — one aggregate query over the createdAt-filtered population
// (every status-specific figure derived via CASE WHEN in a single pass),
// plus the separate invoice-rooted grossCollected query for Refund Rate. ──
export async function getRefundAnalysisKPIs(filters: WhereFilters): Promise<RefundAnalysisKPIs> {
  const db = await getDb();
  const where = buildWhere(filters);

  const [[core], grossCollected] = await Promise.all([
    db.$queryRaw<
      [{
        totalRefunded: number;
        refundRequests: number | bigint;
        completedCount: number | bigint;
        largestRefund: number | null;
        pendingExposure: number;
        rejectedCount: number | bigint;
        averageProcessingDays: number | null;
      }]
    >(Prisma.sql`
      SELECT
        ISNULL(SUM(CASE WHEN r.status = 'COMPLETED' THEN CAST(r.amount AS FLOAT) ELSE 0 END), 0) AS totalRefunded,
        COUNT(*) AS refundRequests,
        COUNT(CASE WHEN r.status = 'COMPLETED' THEN 1 END) AS completedCount,
        ISNULL(MAX(CASE WHEN r.status = 'COMPLETED' THEN CAST(r.amount AS FLOAT) END), 0) AS largestRefund,
        ISNULL(SUM(CASE WHEN r.status IN ('REQUESTED', 'APPROVED') THEN CAST(r.amount AS FLOAT) ELSE 0 END), 0) AS pendingExposure,
        COUNT(CASE WHEN r.status = 'REJECTED' THEN 1 END) AS rejectedCount,
        AVG(CASE WHEN r.status = 'COMPLETED' THEN CAST(DATEDIFF(day, r.createdAt, r.completedAt) AS FLOAT) END) AS averageProcessingDays
      ${BASE_FROM}
      ${where}
    `),
    getGrossCollected(filters),
  ]);

  const totalRefunded = toNum(core?.totalRefunded);
  const refundRequests = Number(core?.refundRequests ?? 0);
  const completedCount = Number(core?.completedCount ?? 0);
  const rejectedCount = Number(core?.rejectedCount ?? 0);

  return {
    totalRefunded,
    refundRequests,
    refundRate: grossCollected > 0 ? (totalRefunded / grossCollected) * 100 : 0,
    averageRefundAmount: completedCount > 0 ? totalRefunded / completedCount : 0,
    largestRefund: toNum(core?.largestRefund),
    pendingRefundExposure: toNum(core?.pendingExposure),
    rejectedRefundRate: refundRequests > 0 ? (rejectedCount / refundRequests) * 100 : 0,
    averageProcessingDays: toNum(core?.averageProcessingDays),
  };
}

// ── Refund Trend (chart 1) — cohort-by-createdAt-month, sliced by current
// status. "Of the refunds requested in month M, how many are now in each
// status." ──────────────────────────────────────────────────────────────
export async function getRefundTrend(filters: WhereFilters): Promise<RefundTrendPoint[]> {
  const db = await getDb();
  const where = buildWhere(filters);

  const rows = await db.$queryRaw<
    { month: string; requested: number | bigint; approved: number | bigint; completed: number | bigint; rejected: number | bigint }[]
  >(Prisma.sql`
    SELECT
      CONVERT(VARCHAR(7), r.createdAt, 120) AS month,
      COUNT(CASE WHEN r.status = 'REQUESTED' THEN 1 END) AS requested,
      COUNT(CASE WHEN r.status = 'APPROVED' THEN 1 END) AS approved,
      COUNT(CASE WHEN r.status = 'COMPLETED' THEN 1 END) AS completed,
      COUNT(CASE WHEN r.status = 'REJECTED' THEN 1 END) AS rejected
    ${BASE_FROM}
    ${where}
    GROUP BY CONVERT(VARCHAR(7), r.createdAt, 120)
    ORDER BY month ASC
  `);

  return rows.map((r) => ({
    month: r.month,
    requested: Number(r.requested),
    approved: Number(r.approved),
    completed: Number(r.completed),
    rejected: Number(r.rejected),
  }));
}

// ── Refund Amount Trend (chart 2) — two series, two date bases, merged by
// month label in JS (merging two small pre-aggregated SQL result sets, not
// raw-row aggregation — see type-file comment for why the bases differ). ──
export async function getRefundAmountTrend(filters: WhereFilters): Promise<RefundAmountTrendPoint[]> {
  const db = await getDb();

  const refundedClauses = buildWhereClauses(filters);
  refundedClauses.push(Prisma.sql`r.status = 'COMPLETED'`);

  const pendingClauses = buildWhereClauses(filters);
  pendingClauses.push(Prisma.sql`r.status IN ('REQUESTED', 'APPROVED')`);

  const [refundedRows, pendingRows] = await Promise.all([
    db.$queryRaw<{ month: string; refundedAmount: number }[]>(Prisma.sql`
      SELECT
        CONVERT(VARCHAR(7), r.completedAt, 120) AS month,
        ISNULL(SUM(CAST(r.amount AS FLOAT)), 0) AS refundedAmount
      ${BASE_FROM}
      WHERE ${Prisma.join(refundedClauses, " AND ")}
      GROUP BY CONVERT(VARCHAR(7), r.completedAt, 120)
      ORDER BY month ASC
    `),
    db.$queryRaw<{ month: string; pendingExposure: number }[]>(Prisma.sql`
      SELECT
        CONVERT(VARCHAR(7), r.createdAt, 120) AS month,
        ISNULL(SUM(CAST(r.amount AS FLOAT)), 0) AS pendingExposure
      ${BASE_FROM}
      WHERE ${Prisma.join(pendingClauses, " AND ")}
      GROUP BY CONVERT(VARCHAR(7), r.createdAt, 120)
      ORDER BY month ASC
    `),
  ]);

  const months = Array.from(new Set([...refundedRows.map((r) => r.month), ...pendingRows.map((r) => r.month)])).sort();
  const refundedMap = new Map(refundedRows.map((r) => [r.month, toNum(r.refundedAmount)]));
  const pendingMap = new Map(pendingRows.map((r) => [r.month, toNum(r.pendingExposure)]));

  return months.map((month) => ({
    month,
    refundedAmount: refundedMap.get(month) ?? 0,
    pendingExposure: pendingMap.get(month) ?? 0,
  }));
}

// ── By Branch / By Course (charts 3 & 4) — COMPLETED-amount basis, matching
// the "Total Refunded" KPI ("how much are refunds costing us"). ───────────
export async function getRefundByBranch(filters: WhereFilters): Promise<RefundByBranchPoint[]> {
  const db = await getDb();
  const where = buildWhere(filters);

  const rows = await db.$queryRaw<{ branchId: string | null; branchName: string | null; totalAmount: number }[]>(Prisma.sql`
    SELECT
      COALESCE(r.branchId, p.branchId, i.branchId) AS branchId,
      ISNULL(b.name, 'Sem Filial') AS branchName,
      ISNULL(SUM(CASE WHEN r.status = 'COMPLETED' THEN CAST(r.amount AS FLOAT) ELSE 0 END), 0) AS totalAmount
    ${BASE_FROM}
    ${where}
    GROUP BY COALESCE(r.branchId, p.branchId, i.branchId), b.name
    HAVING SUM(CASE WHEN r.status = 'COMPLETED' THEN CAST(r.amount AS FLOAT) ELSE 0 END) > 0
    ORDER BY totalAmount DESC
  `);

  return rows.map((r) => ({ branchId: r.branchId, branchName: r.branchName ?? "Sem Filial", totalAmount: toNum(r.totalAmount) }));
}

export async function getRefundByCourse(filters: WhereFilters): Promise<RefundByCoursePoint[]> {
  const db = await getDb();
  const where = buildWhere(filters);

  const rows = await db.$queryRaw<{ courseId: string | null; courseName: string | null; totalAmount: number }[]>(Prisma.sql`
    SELECT
      e.courseId,
      ISNULL(c.name, 'Sem Curso') AS courseName,
      ISNULL(SUM(CASE WHEN r.status = 'COMPLETED' THEN CAST(r.amount AS FLOAT) ELSE 0 END), 0) AS totalAmount
    ${BASE_FROM}
    ${where}
    GROUP BY e.courseId, c.name
    HAVING SUM(CASE WHEN r.status = 'COMPLETED' THEN CAST(r.amount AS FLOAT) ELSE 0 END) > 0
    ORDER BY totalAmount DESC
  `);

  return rows.map((r) => ({ courseId: r.courseId, courseName: r.courseName ?? "Sem Curso", totalAmount: toNum(r.totalAmount) }));
}

// ── By Status (chart 5, donut) — all statuses, COUNT only. ─────────────────
export async function getRefundByStatus(filters: WhereFilters): Promise<RefundByStatusPoint[]> {
  const db = await getDb();
  const where = buildWhere(filters);

  const rows = await db.$queryRaw<{ status: string; count: number | bigint }[]>(Prisma.sql`
    SELECT r.status, COUNT(*) AS count
    ${BASE_FROM}
    ${where}
    GROUP BY r.status
    ORDER BY count DESC
  `);

  return rows.map((r) => ({ status: r.status, count: Number(r.count) }));
}

// ── Processing Time Trend (chart 6) — COMPLETED only, bucketed by
// completedAt month (see type-file comment on date bases). ─────────────────
export async function getRefundProcessingTimeTrend(filters: WhereFilters): Promise<RefundProcessingTimeTrendPoint[]> {
  const db = await getDb();
  const clauses = buildWhereClauses(filters);
  clauses.push(Prisma.sql`r.status = 'COMPLETED'`);

  const rows = await db.$queryRaw<{ month: string; averageDays: number | null }[]>(Prisma.sql`
    SELECT
      CONVERT(VARCHAR(7), r.completedAt, 120) AS month,
      AVG(CAST(DATEDIFF(day, r.createdAt, r.completedAt) AS FLOAT)) AS averageDays
    ${BASE_FROM}
    WHERE ${Prisma.join(clauses, " AND ")}
    GROUP BY CONVERT(VARCHAR(7), r.completedAt, 120)
    ORDER BY month ASC
  `);

  return rows.map((r) => ({ month: r.month, averageDays: toNum(r.averageDays) }));
}

// ── Sort whitelist (table is rooted at Refund) ──────────────────────────────
const SORT_EXPRESSIONS: Record<string, string> = {
  amount: "CAST(r.amount AS FLOAT)",
  createdAt: "r.createdAt",
  completedAt: "r.completedAt",
  processingDays: "DATEDIFF(day, r.createdAt, r.completedAt)",
  studentName: "st.firstName",
  status: "r.status",
};

function resolveOrderBy(sortBy?: string, sortDir?: string): Prisma.Sql {
  if (!sortBy || !SORT_EXPRESSIONS[sortBy]) {
    return Prisma.raw("CAST(r.amount AS FLOAT) DESC");
  }
  const dir = sortDir === "asc" ? "ASC" : "DESC";
  return Prisma.raw(`${SORT_EXPRESSIONS[sortBy]} ${dir}`);
}

interface RawRefundRow {
  id: string;
  refundNumber: string;
  studentId: string | null;
  firstName: string | null;
  lastName: string | null;
  branchId: string | null;
  branchName: string | null;
  courseId: string | null;
  courseName: string | null;
  status: string;
  amount: number;
  createdAt: Date;
  approvedAt: Date | null;
  completedAt: Date | null;
  processingDays: number | null;
  paymentId: string;
  paymentNumber: string | null;
}

// ── Paginated row list — pagination and sorting both happen in SQL. ────────
export async function listRefundAnalysisRows(
  filters: RefundAnalysisFilters
): Promise<{ rows: RefundAnalysisRow[]; total: number }> {
  const db = await getDb();
  const { page, pageSize } = filters;
  const skip = (page - 1) * pageSize;
  const where = buildWhere(filters);
  const orderByExpr = resolveOrderBy(filters.sortBy, filters.sortDir);

  const [rawRows, countResult] = await Promise.all([
    db.$queryRaw<RawRefundRow[]>(Prisma.sql`
      SELECT
        r.id, r.refundNumber, r.studentId, st.firstName, st.lastName,
        COALESCE(r.branchId, p.branchId, i.branchId) AS branchId, b.name AS branchName,
        e.courseId, c.name AS courseName,
        r.status, CAST(r.amount AS FLOAT) AS amount,
        r.createdAt, r.approvedAt, r.completedAt,
        CASE WHEN r.status = 'COMPLETED' THEN DATEDIFF(day, r.createdAt, r.completedAt) ELSE NULL END AS processingDays,
        r.paymentId, p.paymentNumber
      ${BASE_FROM}
      ${where}
      ORDER BY ${orderByExpr}
      OFFSET ${skip} ROWS FETCH NEXT ${pageSize} ROWS ONLY
    `),
    db.$queryRaw<[{ total: bigint }]>(Prisma.sql`
      SELECT COUNT(*) AS total
      ${BASE_FROM}
      ${where}
    `),
  ]);

  const total = Number(countResult[0]?.total ?? 0);

  const rows: RefundAnalysisRow[] = rawRows.map((r) => ({
    refundId: r.id,
    refundNumber: r.refundNumber,
    studentId: r.studentId,
    studentName: r.firstName ? `${r.firstName} ${r.lastName ?? ""}`.trim() : null,
    branchId: r.branchId,
    branchName: r.branchName ?? null,
    courseId: r.courseId,
    courseName: r.courseName ?? null,
    status: r.status,
    amount: toNum(r.amount),
    createdAt: r.createdAt,
    approvedAt: r.approvedAt,
    completedAt: r.completedAt,
    processingDays: r.processingDays != null ? Number(r.processingDays) : null,
    paymentId: r.paymentId,
    paymentNumber: r.paymentNumber,
  }));

  return { rows, total };
}

// ── Watchlist severity — pure function, directly unit-testable. Only
// REQUESTED/APPROVED refunds can ever be "risky" in an actionable sense
// (REJECTED/COMPLETED need no action) — see type-file comment. No
// open-ended LOW tier is surfaced (same precedent as the Discount Report's
// watchlist): every tier here has an explicit numeric threshold, and
// surfacing everything below MEDIUM would defeat the purpose of a "top
// risky refunds" list. ──────────────────────────────────────────────────
export function computeRefundWatchlistSeverity(
  amount: number,
  status: string,
  ageDays: number
): ReconciliationSeverity | null {
  if (status !== "REQUESTED" && status !== "APPROVED") return null;

  if (
    amount >= CRITICAL_AMOUNT ||
    (status === "APPROVED" && ageDays > CRITICAL_APPROVED_DAYS) ||
    (status === "REQUESTED" && ageDays > CRITICAL_PENDING_DAYS)
  ) {
    return "CRITICAL";
  }
  if (amount >= HIGH_AMOUNT || (status === "REQUESTED" && ageDays > HIGH_PENDING_DAYS)) {
    return "HIGH";
  }
  if (amount >= MEDIUM_AMOUNT || (status === "REQUESTED" && ageDays > MEDIUM_PENDING_DAYS)) {
    return "MEDIUM";
  }
  return null;
}

interface RawWatchlistRow {
  id: string;
  refundNumber: string;
  status: string;
  amount: number;
  studentId: string | null;
  firstName: string | null;
  lastName: string | null;
  branchName: string | null;
  courseName: string | null;
  paymentId: string;
  ageDays: number;
}

export async function getRefundWatchlist(filters: WhereFilters): Promise<RefundWatchlistItem[]> {
  const db = await getDb();
  const clauses = buildWhereClauses(filters);
  clauses.push(Prisma.sql`r.status IN ('REQUESTED', 'APPROVED')`);
  // Admits exactly the rows computeRefundWatchlistSeverity would not return
  // null for — the lowest amount/age threshold of every tier, ORed together.
  clauses.push(Prisma.sql`(
    CAST(r.amount AS FLOAT) >= ${MEDIUM_AMOUNT}
    OR (r.status = 'REQUESTED' AND DATEDIFF(day, r.createdAt, GETDATE()) > ${MEDIUM_PENDING_DAYS})
    OR (r.status = 'APPROVED' AND DATEDIFF(day, r.approvedAt, GETDATE()) > ${CRITICAL_APPROVED_DAYS})
  )`);

  const rows = await db.$queryRaw<RawWatchlistRow[]>(Prisma.sql`
    SELECT TOP (${WATCHLIST_LIMIT})
      r.id, r.refundNumber, r.status, CAST(r.amount AS FLOAT) AS amount,
      r.studentId, st.firstName, st.lastName,
      ISNULL(b.name, 'Sem Filial') AS branchName,
      ISNULL(c.name, 'Sem Curso') AS courseName,
      r.paymentId,
      CASE WHEN r.status = 'APPROVED' THEN DATEDIFF(day, r.approvedAt, GETDATE()) ELSE DATEDIFF(day, r.createdAt, GETDATE()) END AS ageDays
    ${BASE_FROM}
    WHERE ${Prisma.join(clauses, " AND ")}
    ORDER BY
      CASE
        WHEN CAST(r.amount AS FLOAT) >= ${CRITICAL_AMOUNT}
          OR (r.status = 'APPROVED' AND DATEDIFF(day, r.approvedAt, GETDATE()) > ${CRITICAL_APPROVED_DAYS})
          OR (r.status = 'REQUESTED' AND DATEDIFF(day, r.createdAt, GETDATE()) > ${CRITICAL_PENDING_DAYS}) THEN 0
        WHEN CAST(r.amount AS FLOAT) >= ${HIGH_AMOUNT}
          OR (r.status = 'REQUESTED' AND DATEDIFF(day, r.createdAt, GETDATE()) > ${HIGH_PENDING_DAYS}) THEN 1
        ELSE 2
      END,
      CAST(r.amount AS FLOAT) DESC
  `);

  return rows.map((r) => {
    const amount = toNum(r.amount);
    const ageDays = Number(r.ageDays);
    const severity = computeRefundWatchlistSeverity(amount, r.status, ageDays) ?? "MEDIUM";
    const recommendedAction: RefundWatchlistAction = r.status === "APPROVED" ? "COMPLETE_REFUND" : "REVIEW_REQUEST";
    const issue =
      r.status === "APPROVED"
        ? `Aprovado há ${ageDays} dia(s) sem conclusão — valor de ${amount.toFixed(2)} MZN`
        : `Pendente há ${ageDays} dia(s) — valor de ${amount.toFixed(2)} MZN`;

    return {
      severity,
      refundId: r.id,
      refundNumber: r.refundNumber,
      studentId: r.studentId,
      studentName: r.firstName ? `${r.firstName} ${r.lastName ?? ""}`.trim() : "—",
      branchName: r.branchName ?? "Sem Filial",
      courseName: r.courseName ?? "Sem Curso",
      amount,
      status: r.status,
      ageDays,
      issue,
      recommendedAction,
      paymentId: r.paymentId,
      link: `/reports/finance/refunds?search=${encodeURIComponent(r.refundNumber)}`,
    };
  });
}

// ── Integrity awareness — refunds, payments, and ledger mismatches are all
// in scope per the spec, so this checks across all three relevant
// categories (unlike most other reports here, which reuse a single one). ──
export async function hasCriticalRefundIntegrityIssue(organizationId: string): Promise<boolean> {
  const db = await getDb();
  const [{ count }] = await db.$queryRaw<[{ count: number | bigint }]>(Prisma.sql`
    SELECT COUNT(*) AS count
    FROM financial_integrity_issues
    WHERE organizationId = ${organizationId}
      AND status = 'OPEN'
      AND severity = 'CRITICAL'
      AND category IN ('REFUND_TOTAL', 'PAYMENT_ALLOCATION', 'LEDGER_CONSISTENCY')
  `);
  return Number(count) > 0;
}
