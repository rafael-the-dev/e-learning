import { Prisma } from "@prisma/client";
import { getDb } from "@/server/db";
import { getAccountsReceivableKPIs } from "./accounts-receivable.repository";
import { getCashFlowMonthlyTrend } from "./cash-flow.repository";
import { getReconciliationKPIs, listReconciliationIssues } from "./reconciliation.repository";
import { RECONCILIATION_ISSUE_LABELS } from "../types";
import type {
  ClosingFilters,
  ClosingWatchlistCategory,
  ClosingWatchlistItem,
  FinancialControlSummary,
  NetCashTrendPoint,
  ReconciliationSeverity,
  ReconciliationSummary,
} from "../types";

type Db = Awaited<ReturnType<typeof getDb>>;

function num(v: { toNumber(): number } | number | bigint | null | undefined): number {
  if (v == null) return 0;
  if (typeof v === "bigint") return Number(v);
  return typeof v === "object" ? v.toNumber() : v;
}

// Watchlist tuning — see docs/financial-reports.md "Closing Watchlist" for rationale.
const WATCHLIST_CATEGORY_LIMIT = 5;
const WATCHLIST_TOTAL_LIMIT = 20;
const WALLET_LIABILITY_WATCHLIST_THRESHOLD = 5000;
const REFUND_EXPOSURE_WATCHLIST_THRESHOLD = 5000;
const OVERDUE_RECEIVABLE_WATCHLIST_THRESHOLD = 10000;

const SEVERITY_RANK: Record<ReconciliationSeverity, number> = {
  CRITICAL: 0,
  HIGH: 1,
  MEDIUM: 2,
  LOW: 3,
};

function dateRangeClauses(column: string, filters: Pick<ClosingFilters, "dateFrom" | "dateTo">): Prisma.Sql[] {
  const clauses: Prisma.Sql[] = [];
  if (filters.dateFrom) clauses.push(Prisma.sql`${Prisma.raw(column)} >= ${new Date(filters.dateFrom)}`);
  if (filters.dateTo) {
    const end = new Date(filters.dateTo);
    end.setHours(23, 59, 59, 999);
    clauses.push(Prisma.sql`${Prisma.raw(column)} <= ${end}`);
  }
  return clauses;
}

function academicScopeClauses(
  enrollmentColumn: string,
  filters: Pick<ClosingFilters, "academicYearId" | "academicTermId">
): Prisma.Sql[] {
  const clauses: Prisma.Sql[] = [];
  if (filters.academicYearId) {
    clauses.push(Prisma.sql`EXISTS (
      SELECT 1 FROM enrollments e
      WHERE e.id = ${Prisma.raw(enrollmentColumn)} AND e.academicYearId = ${filters.academicYearId} AND e.deletedAt IS NULL
    )`);
  }
  if (filters.academicTermId) {
    clauses.push(Prisma.sql`EXISTS (
      SELECT 1 FROM enrollments e
      WHERE e.id = ${Prisma.raw(enrollmentColumn)} AND e.academicTermId = ${filters.academicTermId} AND e.deletedAt IS NULL
    )`);
  }
  return clauses;
}

// =============================================================================
// KPI 1 — GROSS INVOICED
// SUM(Invoice.totalAmount) excluding CANCELLED. Matches the index prefix
// (organizationId, status, issueDate) / (organizationId, branchId, status, issueDate).
// =============================================================================

export async function getGrossInvoiced(filters: ClosingFilters): Promise<number> {
  const db = await getDb();
  const clauses: Prisma.Sql[] = [
    Prisma.sql`i.organizationId = ${filters.organizationId}`,
    Prisma.sql`i.deletedAt IS NULL`,
    Prisma.sql`i.status <> 'CANCELLED'`,
    ...(filters.branchId ? [Prisma.sql`i.branchId = ${filters.branchId}`] : []),
    ...dateRangeClauses("i.issueDate", filters),
    ...academicScopeClauses("i.enrollmentId", filters),
  ];
  const [row] = await db.$queryRaw<[{ total: number }]>(Prisma.sql`
    SELECT ISNULL(SUM(CAST(i.totalAmount AS FLOAT)), 0) AS total
    FROM invoices i
    WHERE ${Prisma.join(clauses, " AND ")}
  `);
  return num(row?.total);
}

// =============================================================================
// KPI 2 — GROSS COLLECTED
// SUM(Payment.totalAmount) WHERE status = CONFIRMED — the "gross" basis already
// documented for the Payments Report (docs/financial-reports.md). Computed as a
// single SQL aggregate here (not via getPaymentsReportKPIs, which hydrates every
// matching payment row in JS for its method breakdown — too costly for a single
// executive KPI at 100k-payment scale).
// =============================================================================

export async function getGrossCollected(filters: ClosingFilters): Promise<number> {
  const db = await getDb();
  const clauses: Prisma.Sql[] = [
    Prisma.sql`p.organizationId = ${filters.organizationId}`,
    Prisma.sql`p.status = 'CONFIRMED'`,
    ...(filters.branchId ? [Prisma.sql`p.branchId = ${filters.branchId}`] : []),
    ...dateRangeClauses("p.paymentDate", filters),
    ...academicScopeClauses("p.enrollmentId", filters),
  ];
  const [row] = await db.$queryRaw<[{ total: number }]>(Prisma.sql`
    SELECT ISNULL(SUM(CAST(p.totalAmount AS FLOAT)), 0) AS total
    FROM payments p
    WHERE ${Prisma.join(clauses, " AND ")}
  `);
  return num(row?.total);
}

// =============================================================================
// KPI 3 — NET CASH POSITION / NET CASH TREND
// Reuses the Cash Flow Report's own SQL-aggregated monthly trend (one GROUP BY
// query, never raw transaction rows) and sums it for the point-in-time KPI —
// avoids running the aggregation twice. branchId is a documented no-op:
// FinancialTransaction has no branchId column.
// =============================================================================

export async function getNetCashTrend(filters: ClosingFilters): Promise<NetCashTrendPoint[]> {
  return getCashFlowMonthlyTrend({
    organizationId: filters.organizationId,
    dateFrom: filters.dateFrom,
    dateTo: filters.dateTo,
  });
}

// =============================================================================
// KPI 4 & 5 — OUTSTANDING / OVERDUE RECEIVABLES (+ Due Soon for the control summary)
// Reuses the Accounts Receivable Report's existing SQL-aggregated KPI query.
// =============================================================================

export async function getReceivablesSnapshot(
  filters: ClosingFilters
): Promise<{ outstanding: number; overdue: number; dueSoon: number }> {
  const kpis = await getAccountsReceivableKPIs({
    organizationId: filters.organizationId,
    branchId: filters.branchId,
    academicYearId: filters.academicYearId,
    academicTermId: filters.academicTermId,
    dateFrom: filters.dateFrom,
    dateTo: filters.dateTo,
  });
  return {
    outstanding: kpis.totalReceivable,
    overdue: kpis.overdueReceivable,
    dueSoon: kpis.dueSoon,
  };
}

// =============================================================================
// KPI 6 — WALLET LIABILITY
// Liability = SUM of positive wallet balances only (negative balances are a
// data-integrity concern flagged by the Integrity engine, not a liability to
// the organisation). One small aggregated result row regardless of wallet
// count — mirrors the existing per-wallet groupBy already used by the Wallet
// Activity Report's KPIs.
// =============================================================================

function walletBalanceCte(filters: Pick<ClosingFilters, "organizationId" | "branchId">): Prisma.Sql {
  const branchClause = filters.branchId ? Prisma.sql`AND s.branchId = ${filters.branchId}` : Prisma.sql``;
  return Prisma.sql`
    SELECT w.id AS walletId, w.studentId AS studentId, s.firstName AS firstName, s.lastName AS lastName,
           ISNULL(SUM(CAST(t.amount AS FLOAT)), 0) AS balance
    FROM student_wallets w
    LEFT JOIN students s ON s.id = w.studentId
    LEFT JOIN student_wallet_transactions t ON t.studentWalletId = w.id
    WHERE w.organizationId = ${filters.organizationId} ${branchClause}
    GROUP BY w.id, w.studentId, s.firstName, s.lastName
  `;
}

export async function getWalletLiabilitySummary(
  filters: ClosingFilters
): Promise<{ totalLiability: number; studentsWithCredit: number; largestBalance: number }> {
  const db = await getDb();
  const cte = walletBalanceCte(filters);
  const [row] = await db.$queryRaw<[{ totalLiability: number; studentsWithCredit: number | bigint; largestBalance: number | null }]>(
    Prisma.sql`
      WITH wb AS (${cte})
      SELECT
        ISNULL(SUM(CASE WHEN balance > 0 THEN balance ELSE 0 END), 0) AS totalLiability,
        COUNT(CASE WHEN balance > 0 THEN 1 END)                       AS studentsWithCredit,
        ISNULL(MAX(CASE WHEN balance > 0 THEN balance END), 0)        AS largestBalance
      FROM wb
    `
  );
  return {
    totalLiability: num(row?.totalLiability),
    studentsWithCredit: Number(row?.studentsWithCredit ?? 0),
    largestBalance: num(row?.largestBalance),
  };
}

async function getWalletLiabilityWatchlist(
  db: Db,
  filters: ClosingFilters,
  threshold: number,
  limit: number
): Promise<ClosingWatchlistItem[]> {
  const cte = walletBalanceCte(filters);
  const rows = await db.$queryRaw<
    Array<{ walletId: string; studentId: string; firstName: string | null; lastName: string | null; balance: number }>
  >(Prisma.sql`
    WITH wb AS (${cte})
    SELECT TOP (${limit}) walletId, studentId, firstName, lastName, balance
    FROM wb
    WHERE balance > ${threshold}
    ORDER BY balance DESC
  `);
  const now = new Date();
  return rows.map((r) => {
    const studentName = `${r.firstName ?? ""} ${r.lastName ?? ""}`.trim();
    return {
      severity: "MEDIUM" as ReconciliationSeverity,
      category: "WALLET_LIABILITY" as const,
      entityType: "StudentWallet",
      entityReference: studentName || r.studentId,
      amount: num(r.balance),
      description: `Saldo de carteira de ${num(r.balance).toFixed(2)} MZN acima do limiar de vigilância`,
      recommendedAction: "VIEW_WALLET" as const,
      link: `/reports/finance/wallets?studentId=${r.studentId}`,
      detectedAt: now,
    };
  });
}

// =============================================================================
// KPI 7 — REFUND EXPOSURE
// SUM(Refund.amount) WHERE status IN (REQUESTED, APPROVED) — a current liability
// snapshot, not a period flow, so the dashboard date filter does not apply here
// (see docs/financial-reports.md). "Completed this period" (control summary)
// IS date-filtered, by completedAt.
// =============================================================================

export async function getRefundExposureSummary(
  filters: ClosingFilters
): Promise<{ pendingAmount: number; requestedCount: number; approvedCount: number }> {
  const db = await getDb();
  const branchClause = filters.branchId ? Prisma.sql`AND branchId = ${filters.branchId}` : Prisma.sql``;
  const rows = await db.$queryRaw<Array<{ status: string; cnt: number | bigint; amt: number }>>(Prisma.sql`
    SELECT status, COUNT(*) AS cnt, ISNULL(SUM(CAST(amount AS FLOAT)), 0) AS amt
    FROM refunds
    WHERE organizationId = ${filters.organizationId}
      AND deletedAt IS NULL
      AND status IN ('REQUESTED', 'APPROVED')
      ${branchClause}
    GROUP BY status
  `);

  let pendingAmount = 0;
  let requestedCount = 0;
  let approvedCount = 0;
  for (const r of rows) {
    pendingAmount += num(r.amt);
    if (r.status === "REQUESTED") requestedCount = Number(r.cnt);
    if (r.status === "APPROVED") approvedCount = Number(r.cnt);
  }
  return { pendingAmount, requestedCount, approvedCount };
}

export async function getCompletedRefundsThisPeriod(
  filters: ClosingFilters
): Promise<{ count: number; amount: number }> {
  const db = await getDb();
  const clauses: Prisma.Sql[] = [
    Prisma.sql`organizationId = ${filters.organizationId}`,
    Prisma.sql`deletedAt IS NULL`,
    Prisma.sql`status = 'COMPLETED'`,
    ...(filters.branchId ? [Prisma.sql`branchId = ${filters.branchId}`] : []),
    ...dateRangeClauses("completedAt", filters),
  ];
  const [row] = await db.$queryRaw<[{ cnt: number | bigint; amt: number }]>(Prisma.sql`
    SELECT COUNT(*) AS cnt, ISNULL(SUM(CAST(amount AS FLOAT)), 0) AS amt
    FROM refunds
    WHERE ${Prisma.join(clauses, " AND ")}
  `);
  return { count: Number(row?.cnt ?? 0), amount: num(row?.amt) };
}

async function getRefundWatchlist(
  db: Db,
  filters: ClosingFilters,
  threshold: number,
  limit: number
): Promise<ClosingWatchlistItem[]> {
  const branchClause = filters.branchId ? Prisma.sql`AND r.branchId = ${filters.branchId}` : Prisma.sql``;
  const rows = await db.$queryRaw<
    Array<{ id: string; refundNumber: string; amount: number; status: string; studentId: string | null }>
  >(Prisma.sql`
    SELECT TOP (${limit}) r.id, r.refundNumber, CAST(r.amount AS FLOAT) AS amount, r.status, r.studentId
    FROM refunds r
    WHERE r.organizationId = ${filters.organizationId}
      AND r.deletedAt IS NULL
      AND r.status IN ('REQUESTED', 'APPROVED')
      AND CAST(r.amount AS FLOAT) > ${threshold}
      ${branchClause}
    ORDER BY CAST(r.amount AS FLOAT) DESC
  `);
  const now = new Date();
  return rows.map((r) => ({
    severity: (r.status === "APPROVED" ? "HIGH" : "MEDIUM") as ReconciliationSeverity,
    category: "REFUND_EXPOSURE" as const,
    entityType: "Refund",
    entityReference: r.refundNumber,
    amount: num(r.amount),
    description: `Reembolso pendente (${r.status === "APPROVED" ? "aprovado" : "solicitado"}) de ${num(r.amount).toFixed(2)} MZN`,
    recommendedAction: "VIEW_REFUND" as const,
    link: `/reports/finance/refunds?search=${encodeURIComponent(r.refundNumber)}`,
    detectedAt: now,
  }));
}

// =============================================================================
// KPI 8 — CRITICAL FINANCIAL ISSUES (+ Integrity Status panel)
// FinancialIntegrityIssue has no branchId column — branch filter is a documented
// no-op here. "Unresolved" = status = 'OPEN', matching the existing Integrity
// Report KPI and the report-hub warning banner's definition.
// =============================================================================

export async function getIntegrityCounts(
  filters: ClosingFilters
): Promise<{ openCritical: number; openHigh: number; openMedium: number; openLow: number; walletMismatchCount: number }> {
  const db = await getDb();
  const clauses: Prisma.Sql[] = [
    Prisma.sql`organizationId = ${filters.organizationId}`,
    Prisma.sql`status = 'OPEN'`,
    ...dateRangeClauses("detectedAt", filters),
  ];
  const whereFragment = Prisma.join(clauses, " AND ");

  const [bySeverity, walletMismatch] = await Promise.all([
    db.$queryRaw<Array<{ severity: string; cnt: number | bigint }>>(Prisma.sql`
      SELECT severity, COUNT(*) AS cnt
      FROM financial_integrity_issues
      WHERE ${whereFragment}
      GROUP BY severity
    `),
    db.$queryRaw<[{ cnt: number | bigint }]>(Prisma.sql`
      SELECT COUNT(*) AS cnt
      FROM financial_integrity_issues
      WHERE ${whereFragment} AND category = 'WALLET_BALANCE'
    `),
  ]);

  const counts: Record<string, number> = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 };
  for (const row of bySeverity) counts[row.severity] = Number(row.cnt);

  return {
    openCritical: counts.CRITICAL,
    openHigh: counts.HIGH,
    openMedium: counts.MEDIUM,
    openLow: counts.LOW,
    walletMismatchCount: Number(walletMismatch[0]?.cnt ?? 0),
  };
}

export async function getIntegrityWatchlist(
  db: Db,
  filters: ClosingFilters,
  severity: "CRITICAL" | "HIGH",
  limit: number
): Promise<ClosingWatchlistItem[]> {
  const clauses: Prisma.Sql[] = [
    Prisma.sql`organizationId = ${filters.organizationId}`,
    Prisma.sql`status = 'OPEN'`,
    Prisma.sql`severity = ${severity}`,
    ...dateRangeClauses("detectedAt", filters),
  ];
  const rows = await db.$queryRaw<
    Array<{ id: string; entityType: string; entityId: string; description: string; detectedAt: Date }>
  >(Prisma.sql`
    SELECT TOP (${limit}) id, entityType, entityId, description, detectedAt
    FROM financial_integrity_issues
    WHERE ${Prisma.join(clauses, " AND ")}
    ORDER BY detectedAt DESC
  `);
  return rows.map((r) => ({
    severity: severity as ReconciliationSeverity,
    category: (severity === "CRITICAL" ? "INTEGRITY_CRITICAL" : "INTEGRITY_HIGH") as ClosingWatchlistCategory,
    entityType: r.entityType,
    entityReference: r.entityId,
    amount: null,
    description: r.description,
    recommendedAction: "VIEW_INTEGRITY" as const,
    link: `/reports/finance/integrity?entityType=${encodeURIComponent(r.entityType)}`,
    detectedAt: r.detectedAt,
  }));
}

// =============================================================================
// OVERDUE RECEIVABLES WATCHLIST (large balances only — see threshold above)
// =============================================================================

async function getOverdueReceivablesWatchlist(
  db: Db,
  filters: ClosingFilters,
  threshold: number,
  limit: number
): Promise<ClosingWatchlistItem[]> {
  const branchClause = filters.branchId ? Prisma.sql`AND i.branchId = ${filters.branchId}` : Prisma.sql``;
  const rows = await db.$queryRaw<
    Array<{
      id: string;
      invoiceNumber: string;
      balanceAmount: number;
      studentId: string | null;
      firstName: string | null;
      lastName: string | null;
      daysOverdue: number;
    }>
  >(Prisma.sql`
    SELECT TOP (${limit})
      i.id, i.invoiceNumber, CAST(i.balanceAmount AS FLOAT) AS balanceAmount, i.studentId,
      s.firstName, s.lastName,
      DATEDIFF(day, i.dueDate, GETDATE()) AS daysOverdue
    FROM invoices i
    LEFT JOIN students s ON s.id = i.studentId
    WHERE i.organizationId = ${filters.organizationId}
      AND i.deletedAt IS NULL
      AND i.status NOT IN ('CANCELLED', 'PAID')
      AND i.dueDate IS NOT NULL
      AND i.dueDate < GETDATE()
      AND CAST(i.balanceAmount AS FLOAT) > ${threshold}
      ${branchClause}
    ORDER BY CAST(i.balanceAmount AS FLOAT) DESC
  `);
  const now = new Date();
  return rows.map((r) => {
    const studentName = `${r.firstName ?? ""} ${r.lastName ?? ""}`.trim();
    return {
      severity: (r.daysOverdue > 60 ? "HIGH" : "MEDIUM") as ReconciliationSeverity,
      category: "OVERDUE_RECEIVABLE" as const,
      entityType: "Invoice",
      entityReference: r.invoiceNumber,
      amount: num(r.balanceAmount),
      description: `Fatura${studentName ? ` de ${studentName}` : ""} vencida há ${r.daysOverdue} dias — saldo de ${num(r.balanceAmount).toFixed(2)} MZN`,
      recommendedAction: "VIEW_STUDENT_DEBT" as const,
      link: studentName
        ? `/reports/finance/student-debt?search=${encodeURIComponent(studentName)}`
        : "/reports/finance/student-debt",
      detectedAt: now,
    };
  });
}

// =============================================================================
// RECONCILIATION SUMMARY — composes the existing Reconciliation Repository.
// =============================================================================

export async function getReconciliationSummaryData(filters: ClosingFilters): Promise<ReconciliationSummary> {
  const recFilters = {
    organizationId: filters.organizationId,
    branchId: filters.branchId,
    dateFrom: filters.dateFrom,
    dateTo: filters.dateTo,
  };

  const [kpis, invoiceMismatch, receiptMismatch] = await Promise.all([
    getReconciliationKPIs(recFilters),
    listReconciliationIssues({ ...recFilters, issueType: "INVOICE_PAID_AMOUNT_MISMATCH", page: 1, pageSize: 1 }),
    listReconciliationIssues({ ...recFilters, issueType: "RECEIPT_AMOUNT_MISMATCH", page: 1, pageSize: 1 }),
  ]);

  return {
    missingLedgerEntries: kpis.missingLedgerEntries,
    duplicateLedgerEntries: kpis.duplicateLedgerEntries,
    orphanLedgerEntries: kpis.orphanLedgerEntries,
    invoiceAllocationMismatches: invoiceMismatch.total,
    receiptAmountMismatches: receiptMismatch.total,
    reconciledItems: kpis.reconciledItems,
    mismatchedItems: kpis.mismatchedItems,
    criticalIssues: kpis.criticalIssues,
  };
}

export async function getReconciliationWatchlist(filters: ClosingFilters, limit: number): Promise<ClosingWatchlistItem[]> {
  const { rows } = await listReconciliationIssues({
    organizationId: filters.organizationId,
    branchId: filters.branchId,
    dateFrom: filters.dateFrom,
    dateTo: filters.dateTo,
    severity: "CRITICAL",
    page: 1,
    pageSize: limit,
  });
  return rows.map((r) => ({
    severity: r.severity,
    category: "RECONCILIATION_MISMATCH" as const,
    entityType: r.entityType,
    entityReference: r.entityReference,
    amount: r.difference,
    description: RECONCILIATION_ISSUE_LABELS[r.issueType],
    recommendedAction: "VIEW_RECONCILIATION" as const,
    link: `/reports/finance/reconciliation?issueType=${r.issueType}`,
    detectedAt: r.detectedAt,
  }));
}

async function getLedgerAnomalyWatchlist(
  filters: ClosingFilters,
  issueType: "DUPLICATE_LEDGER_ENTRY" | "ORPHAN_LEDGER_ENTRY",
  limit: number
): Promise<ClosingWatchlistItem[]> {
  // Ledger-only checks — branchId intentionally omitted: FinancialTransaction
  // has no branchId column (documented no-op, same as the Reconciliation Report).
  const { rows } = await listReconciliationIssues({
    organizationId: filters.organizationId,
    dateFrom: filters.dateFrom,
    dateTo: filters.dateTo,
    issueType,
    page: 1,
    pageSize: limit,
  });
  return rows.map((r) => ({
    severity: r.severity,
    category: (issueType === "DUPLICATE_LEDGER_ENTRY" ? "DUPLICATE_LEDGER" : "ORPHAN_LEDGER") as ClosingWatchlistCategory,
    entityType: r.entityType,
    entityReference: r.entityReference,
    amount: r.difference,
    description: RECONCILIATION_ISSUE_LABELS[r.issueType],
    recommendedAction: "VIEW_RECONCILIATION" as const,
    link: `/reports/finance/reconciliation?issueType=${r.issueType}`,
    detectedAt: r.detectedAt,
  }));
}

// =============================================================================
// CLOSING WATCHLIST — combines all sources, ranks by severity, caps the total.
// =============================================================================

export async function getClosingWatchlist(filters: ClosingFilters): Promise<ClosingWatchlistItem[]> {
  const db = await getDb();

  const [
    criticalIntegrity,
    highIntegrity,
    reconciliationCritical,
    duplicateLedger,
    orphanLedger,
    walletWatchlist,
    refundWatchlist,
    overdueWatchlist,
  ] = await Promise.all([
    getIntegrityWatchlist(db, filters, "CRITICAL", WATCHLIST_CATEGORY_LIMIT),
    getIntegrityWatchlist(db, filters, "HIGH", WATCHLIST_CATEGORY_LIMIT),
    getReconciliationWatchlist(filters, WATCHLIST_CATEGORY_LIMIT),
    getLedgerAnomalyWatchlist(filters, "DUPLICATE_LEDGER_ENTRY", WATCHLIST_CATEGORY_LIMIT),
    getLedgerAnomalyWatchlist(filters, "ORPHAN_LEDGER_ENTRY", WATCHLIST_CATEGORY_LIMIT),
    getWalletLiabilityWatchlist(db, filters, WALLET_LIABILITY_WATCHLIST_THRESHOLD, WATCHLIST_CATEGORY_LIMIT),
    getRefundWatchlist(db, filters, REFUND_EXPOSURE_WATCHLIST_THRESHOLD, WATCHLIST_CATEGORY_LIMIT),
    getOverdueReceivablesWatchlist(db, filters, OVERDUE_RECEIVABLE_WATCHLIST_THRESHOLD, WATCHLIST_CATEGORY_LIMIT),
  ]);

  return [
    ...criticalIntegrity,
    ...highIntegrity,
    ...reconciliationCritical,
    ...duplicateLedger,
    ...orphanLedger,
    ...walletWatchlist,
    ...refundWatchlist,
    ...overdueWatchlist,
  ]
    .sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] || b.detectedAt.getTime() - a.detectedAt.getTime())
    .slice(0, WATCHLIST_TOTAL_LIMIT);
}

// =============================================================================
// CONTROL SUMMARY — assembled by the service from the granular reads above;
// exported here too so the service has a single import surface per concern.
// =============================================================================

export function buildControlSummary(parts: {
  integrity: { openCritical: number; openHigh: number; openMedium: number; openLow: number };
  reconciliation: ReconciliationSummary;
  receivables: { outstanding: number; overdue: number; dueSoon: number };
  refundExposure: { requestedCount: number; approvedCount: number };
  completedRefunds: { count: number; amount: number };
  wallet: { totalLiability: number; studentsWithCredit: number; largestBalance: number };
}): FinancialControlSummary {
  return {
    integrity: parts.integrity,
    reconciliation: {
      reconciled: parts.reconciliation.reconciledItems,
      unreconciled: parts.reconciliation.mismatchedItems,
    },
    receivables: parts.receivables,
    refunds: {
      requestedCount: parts.refundExposure.requestedCount,
      approvedCount: parts.refundExposure.approvedCount,
      completedThisPeriodCount: parts.completedRefunds.count,
      completedThisPeriodAmount: parts.completedRefunds.amount,
    },
    wallet: parts.wallet,
  };
}
