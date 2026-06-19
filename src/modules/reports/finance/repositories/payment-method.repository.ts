import { Prisma } from "@prisma/client";
import { getDb } from "@/server/db";
import type {
  PaymentMethodMixFilters,
  PaymentMethodMixKPIs,
  PaymentMethodMixRow,
  PaymentMethodMixMonthlyPoint,
  PaymentMethodMixByBranchPoint,
} from "../types";

type DecimalLike = { toNumber(): number };

function toNum(v: DecimalLike | number | null | undefined): number {
  if (v == null) return 0;
  return typeof v === "object" && "toNumber" in v ? v.toNumber() : (v as number);
}

// Gross-received statuses — PENDING and CANCELLED never represent received
// money and are never selectable, even via the paymentStatus filter.
const ALLOWED_PAYMENT_STATUSES = new Set(["CONFIRMED", "PARTIALLY_REFUNDED", "REFUNDED"]);

const CASH_METHODS = new Set(["CASH"]);
const DIGITAL_METHODS = new Set(["MPESA", "EMOLA", "CARD", "POS"]);
const BANK_METHODS = new Set(["BANK_TRANSFER", "CHEQUE"]);

// Rooted at payment_splits — the source of truth for every method-based
// aggregate in this report. payments is joined 1:1 (each split belongs to
// exactly one payment) so this join never multiplies split rows.
const BASE_FROM = Prisma.sql`
  FROM payment_splits ps
  JOIN payments p ON p.id = ps.paymentId
  LEFT JOIN invoices i ON i.id = p.invoiceId
  LEFT JOIN enrollments e ON e.id = i.enrollmentId AND e.deletedAt IS NULL
  LEFT JOIN courses c ON c.id = e.courseId
  LEFT JOIN branches b ON b.id = COALESCE(p.branchId, i.branchId)
  LEFT JOIN students st ON st.id = p.studentId AND st.deletedAt IS NULL
`;

function buildWhere(
  filters: Pick<
    PaymentMethodMixFilters,
    | "organizationId" | "branchId" | "courseId" | "studentId" | "academicYearId" | "academicTermId"
    | "dateFrom" | "dateTo" | "paymentMethod" | "paymentStatus"
  >
): Prisma.Sql {
  const clauses: Prisma.Sql[] = [Prisma.sql`ps.organizationId = ${filters.organizationId}`];

  if (filters.paymentStatus && ALLOWED_PAYMENT_STATUSES.has(filters.paymentStatus)) {
    clauses.push(Prisma.sql`p.status = ${filters.paymentStatus}`);
  } else {
    clauses.push(Prisma.sql`p.status IN ('CONFIRMED', 'PARTIALLY_REFUNDED', 'REFUNDED')`);
  }

  if (filters.branchId) clauses.push(Prisma.sql`COALESCE(p.branchId, i.branchId) = ${filters.branchId}`);
  if (filters.courseId) clauses.push(Prisma.sql`e.courseId = ${filters.courseId}`);
  if (filters.studentId) clauses.push(Prisma.sql`p.studentId = ${filters.studentId}`);
  if (filters.academicYearId) clauses.push(Prisma.sql`e.academicYearId = ${filters.academicYearId}`);
  if (filters.academicTermId) clauses.push(Prisma.sql`e.academicTermId = ${filters.academicTermId}`);
  if (filters.dateFrom) clauses.push(Prisma.sql`p.paymentDate >= ${new Date(filters.dateFrom)}`);
  if (filters.dateTo) clauses.push(Prisma.sql`p.paymentDate <= ${new Date(filters.dateTo)}`);
  if (filters.paymentMethod) clauses.push(Prisma.sql`ps.method = ${filters.paymentMethod}`);

  return Prisma.sql`WHERE ${Prisma.join(clauses, " AND ")}`;
}

type WhereFilters = Pick<
  PaymentMethodMixFilters,
  | "organizationId" | "branchId" | "courseId" | "studentId" | "academicYearId" | "academicTermId"
  | "dateFrom" | "dateTo" | "paymentMethod" | "paymentStatus"
>;

// ── Method breakdown — doubles as the report's "table", the basis for every
// KPI, and the basis for the "Average Split Amount by Method" chart. ───────
export async function getPaymentMethodRows(filters: WhereFilters): Promise<PaymentMethodMixRow[]> {
  const db = await getDb();
  const whereFragment = buildWhere(filters);

  // Refunds are rooted at Payment, not PaymentSplit (see type-file comment),
  // so they are pre-aggregated per payment in this CTE *before* joining —
  // a GROUP BY paymentId join is one-to-one and can never multiply split rows.
  const rows = await db.$queryRaw<
    { method: string; totalAmount: number; splitCount: number | bigint; paymentCount: number | bigint; refundEstimate: number }[]
  >(Prisma.sql`
    WITH PaymentRefunds AS (
      SELECT paymentId, SUM(CAST(amount AS FLOAT)) AS refundedAmount
      FROM refunds
      WHERE organizationId = ${filters.organizationId} AND status = 'COMPLETED'
      GROUP BY paymentId
    )
    SELECT
      ps.method,
      SUM(CAST(ps.amount AS FLOAT)) AS totalAmount,
      COUNT(*) AS splitCount,
      COUNT(DISTINCT ps.paymentId) AS paymentCount,
      ISNULL(SUM(
        CAST(ps.amount AS FLOAT) * ISNULL(pr.refundedAmount, 0)
        / CASE WHEN CAST(p.totalAmount AS FLOAT) <> 0 THEN CAST(p.totalAmount AS FLOAT) ELSE 1 END
      ), 0) AS refundEstimate
    ${BASE_FROM}
    LEFT JOIN PaymentRefunds pr ON pr.paymentId = p.id
    ${whereFragment}
    GROUP BY ps.method
    ORDER BY totalAmount DESC
  `);

  const grandTotal = rows.reduce((s, r) => s + toNum(r.totalAmount), 0);

  return rows.map((r) => {
    const totalAmount = toNum(r.totalAmount);
    const splitCount = Number(r.splitCount);
    return {
      method: r.method,
      totalAmount,
      splitCount,
      paymentCount: Number(r.paymentCount),
      averageAmount: splitCount > 0 ? totalAmount / splitCount : 0,
      sharePct: grandTotal > 0 ? (totalAmount / grandTotal) * 100 : 0,
      refundAdjustedNet: totalAmount - toNum(r.refundEstimate),
    };
  });
}

// Pure derivation over the (max 8-row) method breakdown — not a second pass
// over raw splits, so this stays well within the "SQL aggregation only" rule.
export function computePaymentMethodKPIs(rows: PaymentMethodMixRow[]): PaymentMethodMixKPIs {
  const totalReceived = rows.reduce((s, r) => s + r.totalAmount, 0);
  const totalSplitCount = rows.reduce((s, r) => s + r.splitCount, 0);
  const cashReceived = rows.filter((r) => CASH_METHODS.has(r.method)).reduce((s, r) => s + r.totalAmount, 0);
  const digitalReceived = rows.filter((r) => DIGITAL_METHODS.has(r.method)).reduce((s, r) => s + r.totalAmount, 0);
  const bankReceived = rows.filter((r) => BANK_METHODS.has(r.method)).reduce((s, r) => s + r.totalAmount, 0);

  const mostUsedMethod = rows.reduce<PaymentMethodMixRow | null>(
    (best, r) => (best === null || r.splitCount > best.splitCount ? r : best),
    null
  )?.method ?? null;

  const highestValueMethod = rows.reduce<PaymentMethodMixRow | null>(
    (best, r) => (best === null || r.totalAmount > best.totalAmount ? r : best),
    null
  )?.method ?? null;

  return {
    totalReceived,
    cashReceived,
    digitalReceived,
    bankReceived,
    mostUsedMethod,
    highestValueMethod,
    averagePaymentSplit: totalSplitCount > 0 ? totalReceived / totalSplitCount : 0,
    cashDependencyRate: totalReceived > 0 ? (cashReceived / totalReceived) * 100 : 0,
  };
}

// ── Monthly trend — Payment.paymentDate, grouped by month + method in SQL. ──
export async function getPaymentMethodMonthlyTrend(filters: WhereFilters): Promise<PaymentMethodMixMonthlyPoint[]> {
  const db = await getDb();
  const whereFragment = buildWhere(filters);

  const rows = await db.$queryRaw<{ month: string; method: string; totalAmount: number }[]>(Prisma.sql`
    SELECT
      CONVERT(VARCHAR(7), p.paymentDate, 120) AS month,
      ps.method,
      SUM(CAST(ps.amount AS FLOAT)) AS totalAmount
    ${BASE_FROM}
    ${whereFragment}
    GROUP BY CONVERT(VARCHAR(7), p.paymentDate, 120), ps.method
    ORDER BY month ASC
  `);

  return rows.map((r) => ({ month: r.month, method: r.method, totalAmount: toNum(r.totalAmount) }));
}

// ── By branch — COALESCE(Payment.branchId, Invoice.branchId), grouped by
// branch + method in SQL. Identifies cash-heavy branches. ──────────────────
export async function getPaymentMethodByBranch(filters: WhereFilters): Promise<PaymentMethodMixByBranchPoint[]> {
  const db = await getDb();
  const whereFragment = buildWhere(filters);

  const rows = await db.$queryRaw<
    { branchId: string | null; branchName: string | null; method: string; totalAmount: number }[]
  >(Prisma.sql`
    SELECT
      COALESCE(p.branchId, i.branchId) AS branchId,
      ISNULL(b.name, 'Sem Filial') AS branchName,
      ps.method,
      SUM(CAST(ps.amount AS FLOAT)) AS totalAmount
    ${BASE_FROM}
    ${whereFragment}
    GROUP BY COALESCE(p.branchId, i.branchId), b.name, ps.method
    ORDER BY totalAmount DESC
  `);

  return rows.map((r) => ({
    branchId: r.branchId,
    branchName: r.branchName ?? "Sem Filial",
    method: r.method,
    totalAmount: toNum(r.totalAmount),
  }));
}

// ── Integrity awareness ─────────────────────────────────────────────────────
// payment.split_sum (category PAYMENT_ALLOCATION) verifies
// SUM(PaymentSplit.amount) = Payment.totalAmount for CONFIRMED /
// PARTIALLY_REFUNDED / REFUNDED payments — a critical mismatch there would
// directly corrupt every KPI, chart, and table row in this report.
export async function hasCriticalPaymentMethodIntegrityIssue(organizationId: string): Promise<boolean> {
  const db = await getDb();
  const [{ count }] = await db.$queryRaw<[{ count: number | bigint }]>(Prisma.sql`
    SELECT COUNT(*) AS count
    FROM financial_integrity_issues
    WHERE organizationId = ${organizationId}
      AND status = 'OPEN'
      AND severity = 'CRITICAL'
      AND category = 'PAYMENT_ALLOCATION'
  `);
  return Number(count) > 0;
}
