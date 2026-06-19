import { Prisma } from "@prisma/client";
import { getDb } from "@/server/db";
import type {
  ReconciliationFilters,
  ReconciliationKPIs,
  ReconciliationRow,
  ReconciliationIssueType,
  ReconciliationSeverity,
} from "../types";
import { RECONCILIATION_ISSUE_META } from "../types";

type Db = Awaited<ReturnType<typeof getDb>>;

const EPSILON = 0.01;

// =============================================================================
// SHARED FILTER CLAUSE HELPERS
// =============================================================================

function eqClause(column: string, value: string | undefined): Prisma.Sql[] {
  return value ? [Prisma.sql`${Prisma.raw(column)} = ${value}`] : [];
}

function dateRangeClauses(
  column: string,
  filters: Pick<ReconciliationFilters, "dateFrom" | "dateTo">
): Prisma.Sql[] {
  const clauses: Prisma.Sql[] = [];
  if (filters.dateFrom) clauses.push(Prisma.sql`${Prisma.raw(column)} >= ${new Date(filters.dateFrom)}`);
  if (filters.dateTo) {
    const end = new Date(filters.dateTo);
    end.setHours(23, 59, 59, 999);
    clauses.push(Prisma.sql`${Prisma.raw(column)} <= ${end}`);
  }
  return clauses;
}

// =============================================================================
// PER-CHECK SQL BUILDERS
// Each returns a SELECT with the unified column shape so they can be combined
// with UNION ALL:
//   issueType, severity, entityType, entityId, entityReference,
//   expectedAmount, actualAmount, difference, occurredAt
// All comparison/aggregation happens in SQL — only mismatched rows are ever
// returned, never the full source or ledger tables.
// =============================================================================

// FinancialTransaction has no branchId column, so branch filtering is a no-op
// for the two ledger-only checks (orphan / duplicate). Documented here once.
function ledgerBranchNote(): Prisma.Sql[] {
  return [];
}

function buildMissingPaymentReceived(filters: ReconciliationFilters): Prisma.Sql {
  const clauses: Prisma.Sql[] = [
    Prisma.sql`p.organizationId = ${filters.organizationId}`,
    Prisma.sql`p.status = 'CONFIRMED'`,
    ...eqClause("p.branchId", filters.branchId),
    ...eqClause("p.studentId", filters.studentId),
    ...dateRangeClauses("p.paymentDate", filters),
  ];
  return Prisma.sql`
    SELECT
      N'MISSING_PAYMENT_RECEIVED'  AS issueType,
      N'HIGH'                      AS severity,
      N'Payment'                   AS entityType,
      p.id                         AS entityId,
      p.paymentNumber              AS entityReference,
      CAST(p.totalAmount AS FLOAT) AS expectedAmount,
      CAST(0 AS FLOAT)             AS actualAmount,
      CAST(p.totalAmount AS FLOAT) AS difference,
      p.paymentDate                AS occurredAt
    FROM payments p
    WHERE ${Prisma.join(clauses, " AND ")}
      AND NOT EXISTS (
        SELECT 1 FROM financial_transactions ft
        WHERE ft.organizationId = p.organizationId
          AND ft.sourceType = 'Payment'
          AND ft.sourceId = p.id
          AND ft.transactionType = 'PAYMENT_RECEIVED'
      )
  `;
}

function buildMissingRefundDisbursed(filters: ReconciliationFilters): Prisma.Sql {
  const clauses: Prisma.Sql[] = [
    Prisma.sql`r.organizationId = ${filters.organizationId}`,
    Prisma.sql`r.status = 'COMPLETED'`,
    Prisma.sql`r.deletedAt IS NULL`,
    ...eqClause("r.branchId", filters.branchId),
    ...eqClause("r.studentId", filters.studentId),
    ...dateRangeClauses("r.completedAt", filters),
  ];
  return Prisma.sql`
    SELECT
      N'MISSING_REFUND_DISBURSED' AS issueType,
      N'HIGH'                     AS severity,
      N'Refund'                   AS entityType,
      r.id                        AS entityId,
      r.refundNumber              AS entityReference,
      CAST(r.amount AS FLOAT)     AS expectedAmount,
      CAST(0 AS FLOAT)            AS actualAmount,
      CAST(r.amount AS FLOAT)     AS difference,
      r.completedAt                AS occurredAt
    FROM refunds r
    WHERE ${Prisma.join(clauses, " AND ")}
      AND NOT EXISTS (
        SELECT 1 FROM financial_transactions ft
        WHERE ft.organizationId = r.organizationId
          AND ft.sourceType = 'Refund'
          AND ft.sourceId = r.id
          AND ft.transactionType = 'REFUND_DISBURSED'
      )
  `;
}

function buildMissingReceiptIssued(filters: ReconciliationFilters): Prisma.Sql {
  const clauses: Prisma.Sql[] = [
    Prisma.sql`rec.organizationId = ${filters.organizationId}`,
    Prisma.sql`rec.status <> 'CANCELLED'`,
    ...eqClause("rec.branchId", filters.branchId),
    ...eqClause("rec.studentId", filters.studentId),
    ...dateRangeClauses("rec.issueDate", filters),
  ];
  return Prisma.sql`
    SELECT
      N'MISSING_RECEIPT_ISSUED'  AS issueType,
      N'MEDIUM'                  AS severity,
      N'Receipt'                 AS entityType,
      rec.id                     AS entityId,
      rec.receiptNumber          AS entityReference,
      CAST(rec.amount AS FLOAT)  AS expectedAmount,
      CAST(0 AS FLOAT)           AS actualAmount,
      CAST(rec.amount AS FLOAT)  AS difference,
      rec.issueDate              AS occurredAt
    FROM receipts rec
    WHERE ${Prisma.join(clauses, " AND ")}
      AND NOT EXISTS (
        SELECT 1 FROM financial_transactions ft
        WHERE ft.organizationId = rec.organizationId
          AND ft.sourceType = 'Receipt'
          AND ft.sourceId = rec.id
          AND ft.transactionType = 'RECEIPT_ISSUED'
      )
  `;
}

function buildInvoicePaidAmountMismatch(filters: ReconciliationFilters): Prisma.Sql {
  const clauses: Prisma.Sql[] = [
    Prisma.sql`i.organizationId = ${filters.organizationId}`,
    Prisma.sql`i.deletedAt IS NULL`,
    ...eqClause("i.branchId", filters.branchId),
    ...eqClause("i.studentId", filters.studentId),
    ...dateRangeClauses("i.issueDate", filters),
  ];
  return Prisma.sql`
    SELECT
      N'INVOICE_PAID_AMOUNT_MISMATCH'                                               AS issueType,
      N'CRITICAL'                                                                   AS severity,
      N'Invoice'                                                                    AS entityType,
      i.id                                                                          AS entityId,
      i.invoiceNumber                                                               AS entityReference,
      CAST(i.paidAmount AS FLOAT)                                                   AS expectedAmount,
      ISNULL(SUM(CAST(pa.amount AS FLOAT)), 0)                                      AS actualAmount,
      ABS(CAST(i.paidAmount AS FLOAT) - ISNULL(SUM(CAST(pa.amount AS FLOAT)), 0))    AS difference,
      i.issueDate                                                                   AS occurredAt
    FROM invoices i
    LEFT JOIN payment_allocations pa ON pa.invoiceId = i.id AND pa.organizationId = i.organizationId
    WHERE ${Prisma.join(clauses, " AND ")}
    GROUP BY i.id, i.invoiceNumber, i.paidAmount, i.issueDate
    HAVING ABS(CAST(i.paidAmount AS FLOAT) - ISNULL(SUM(CAST(pa.amount AS FLOAT)), 0)) > ${EPSILON}
  `;
}

function buildReceiptAmountMismatch(filters: ReconciliationFilters): Prisma.Sql {
  const clauses: Prisma.Sql[] = [
    Prisma.sql`rec.organizationId = ${filters.organizationId}`,
    Prisma.sql`rec.status <> 'CANCELLED'`,
    ...eqClause("rec.branchId", filters.branchId),
    ...eqClause("rec.studentId", filters.studentId),
    ...dateRangeClauses("rec.issueDate", filters),
  ];
  return Prisma.sql`
    SELECT
      N'RECEIPT_AMOUNT_MISMATCH'                                          AS issueType,
      N'HIGH'                                                             AS severity,
      N'Receipt'                                                          AS entityType,
      rec.id                                                              AS entityId,
      rec.receiptNumber                                                   AS entityReference,
      CAST(p.totalAmount AS FLOAT)                                        AS expectedAmount,
      CAST(rec.amount AS FLOAT)                                           AS actualAmount,
      ABS(CAST(p.totalAmount AS FLOAT) - CAST(rec.amount AS FLOAT))       AS difference,
      rec.issueDate                                                       AS occurredAt
    FROM receipts rec
    JOIN payments p ON p.id = rec.paymentId AND p.organizationId = rec.organizationId
    WHERE ${Prisma.join(clauses, " AND ")}
      AND ABS(CAST(p.totalAmount AS FLOAT) - CAST(rec.amount AS FLOAT)) > ${EPSILON}
  `;
}

function buildOrphanLedgerEntry(filters: ReconciliationFilters): Prisma.Sql {
  const clauses: Prisma.Sql[] = [
    Prisma.sql`ft.organizationId = ${filters.organizationId}`,
    ...ledgerBranchNote(),
    ...eqClause("ft.studentId", filters.studentId),
    ...dateRangeClauses("ft.occurredAt", filters),
  ];
  return Prisma.sql`
    SELECT
      N'ORPHAN_LEDGER_ENTRY'    AS issueType,
      N'CRITICAL'               AS severity,
      N'FinancialTransaction'   AS entityType,
      ft.id                     AS entityId,
      ft.transactionNumber      AS entityReference,
      CAST(ft.amount AS FLOAT)  AS expectedAmount,
      CAST(0 AS FLOAT)          AS actualAmount,
      CAST(ft.amount AS FLOAT)  AS difference,
      ft.occurredAt             AS occurredAt
    FROM financial_transactions ft
    WHERE ${Prisma.join(clauses, " AND ")}
      AND (
        (ft.sourceType = 'Payment'  AND NOT EXISTS (SELECT 1 FROM payments p WHERE p.id = ft.sourceId AND p.organizationId = ft.organizationId))
        OR (ft.sourceType = 'Refund'   AND NOT EXISTS (SELECT 1 FROM refunds r WHERE r.id = ft.sourceId AND r.organizationId = ft.organizationId))
        OR (ft.sourceType = 'Receipt'  AND NOT EXISTS (SELECT 1 FROM receipts rec WHERE rec.id = ft.sourceId AND rec.organizationId = ft.organizationId))
        OR (ft.sourceType = 'Invoice'  AND NOT EXISTS (SELECT 1 FROM invoices i WHERE i.id = ft.sourceId AND i.organizationId = ft.organizationId))
        OR (ft.sourceType = 'CreditApplication' AND NOT EXISTS (SELECT 1 FROM credit_applications ca WHERE ca.id = ft.sourceId AND ca.organizationId = ft.organizationId))
        OR (ft.sourceType = 'WalletTransaction' AND NOT EXISTS (SELECT 1 FROM student_wallet_transactions swt WHERE swt.id = ft.sourceId AND swt.organizationId = ft.organizationId))
      )
  `;
}

function buildDuplicateLedgerEntry(filters: ReconciliationFilters): Prisma.Sql {
  const clauses: Prisma.Sql[] = [
    Prisma.sql`ft.organizationId = ${filters.organizationId}`,
    ...ledgerBranchNote(),
    ...eqClause("ft.studentId", filters.studentId),
    ...dateRangeClauses("ft.occurredAt", filters),
  ];
  return Prisma.sql`
    SELECT
      N'DUPLICATE_LEDGER_ENTRY'                                AS issueType,
      N'HIGH'                                                  AS severity,
      N'FinancialTransaction'                                  AS entityType,
      ft.sourceType + N':' + ft.sourceId + N':' + ft.transactionType AS entityId,
      ft.sourceType + N' ' + ft.sourceId                       AS entityReference,
      CAST(1 AS FLOAT)                                         AS expectedAmount,
      CAST(COUNT(*) AS FLOAT)                                  AS actualAmount,
      CAST(COUNT(*) AS FLOAT) - 1                              AS difference,
      MAX(ft.occurredAt)                                       AS occurredAt
    FROM financial_transactions ft
    WHERE ${Prisma.join(clauses, " AND ")}
    GROUP BY ft.sourceType, ft.sourceId, ft.transactionType
    HAVING COUNT(*) > 1
  `;
}

const CHECK_BUILDERS: Record<ReconciliationIssueType, (filters: ReconciliationFilters) => Prisma.Sql> = {
  MISSING_PAYMENT_RECEIVED: buildMissingPaymentReceived,
  MISSING_REFUND_DISBURSED: buildMissingRefundDisbursed,
  MISSING_RECEIPT_ISSUED: buildMissingReceiptIssued,
  INVOICE_PAID_AMOUNT_MISMATCH: buildInvoicePaidAmountMismatch,
  RECEIPT_AMOUNT_MISMATCH: buildReceiptAmountMismatch,
  ORPHAN_LEDGER_ENTRY: buildOrphanLedgerEntry,
  DUPLICATE_LEDGER_ENTRY: buildDuplicateLedgerEntry,
};

const CHECK_ORDER: ReconciliationIssueType[] = [
  "MISSING_PAYMENT_RECEIVED",
  "MISSING_REFUND_DISBURSED",
  "MISSING_RECEIPT_ISSUED",
  "INVOICE_PAID_AMOUNT_MISMATCH",
  "RECEIPT_AMOUNT_MISMATCH",
  "ORPHAN_LEDGER_ENTRY",
  "DUPLICATE_LEDGER_ENTRY",
];

// =============================================================================
// ACTIVE CHECK SELECTION
// entityType / issueType(s) / severity(ies) filters are resolved by skipping
// whole checks up-front (cheap — each check's severity/entityType is a fixed
// literal), rather than filtering rows after the fact.
// =============================================================================

function buildActiveChecks(
  filters: ReconciliationFilters
): Array<{ type: ReconciliationIssueType; sql: Prisma.Sql }> {
  const allowedTypes = filters.issueTypes?.length
    ? new Set(filters.issueTypes)
    : filters.issueType
      ? new Set([filters.issueType])
      : null;

  const allowedSeverities = filters.severities?.length
    ? new Set(filters.severities)
    : filters.severity
      ? new Set([filters.severity])
      : null;

  return CHECK_ORDER.filter((type) => {
    const meta = RECONCILIATION_ISSUE_META[type];
    if (allowedTypes && !allowedTypes.has(type)) return false;
    if (allowedSeverities && !allowedSeverities.has(meta.severity)) return false;
    if (filters.entityType && filters.entityType !== meta.entityType) return false;
    return true;
  }).map((type) => ({ type, sql: CHECK_BUILDERS[type](filters) }));
}

// =============================================================================
// INTEGRITY ISSUE ENRICHMENT
// "Use existing FinancialIntegrityIssue if available" — only checkNames that
// have a real equivalent in the integrity-checks job are looked up; the rest
// fall back to the request timestamp (this is a freshly calculated view).
// =============================================================================

const CHECK_NAME_BY_ISSUE_TYPE: Partial<Record<ReconciliationIssueType, string>> = {
  RECEIPT_AMOUNT_MISMATCH: "receipt.amount_mismatch",
  DUPLICATE_LEDGER_ENTRY: "ledger.duplicate_entry",
};

interface RawReconciliationRow {
  issueType: string;
  severity: string;
  entityType: string;
  entityId: string;
  entityReference: string;
  expectedAmount: number;
  actualAmount: number;
  difference: number;
  occurredAt: Date;
}

async function enrichWithIntegrityIssues(
  db: Db,
  organizationId: string,
  rows: RawReconciliationRow[]
): Promise<ReconciliationRow[]> {
  const now = new Date();
  const matchable = rows.filter((r) => CHECK_NAME_BY_ISSUE_TYPE[r.issueType as ReconciliationIssueType]);

  const issueMap = new Map<string, { detectedAt: Date; status: string; id: string }>();
  if (matchable.length > 0) {
    const found = await db.financialIntegrityIssue.findMany({
      where: {
        organizationId,
        OR: matchable.map((r) => ({
          entityType: r.entityType,
          entityId: r.entityId,
          checkName: CHECK_NAME_BY_ISSUE_TYPE[r.issueType as ReconciliationIssueType]!,
        })),
      },
      select: { entityType: true, entityId: true, detectedAt: true, status: true, id: true },
    });
    for (const issue of found) {
      issueMap.set(`${issue.entityType}:${issue.entityId}`, issue);
    }
  }

  return rows.map((r) => {
    const matched = issueMap.get(`${r.entityType}:${r.entityId}`);
    return {
      issueType: r.issueType as ReconciliationIssueType,
      severity: r.severity as ReconciliationSeverity,
      entityType: r.entityType,
      entityId: r.entityId,
      entityReference: r.entityReference,
      expectedAmount: r.expectedAmount,
      actualAmount: r.actualAmount,
      difference: r.difference,
      occurredAt: r.occurredAt,
      detectedAt: matched?.detectedAt ?? now,
      integrityIssueId: matched?.id ?? null,
      integrityIssueStatus: matched?.status ?? null,
    };
  });
}

// =============================================================================
// PAGINATED LISTING — "Ledger vs Source Table" + drill-down sections
// =============================================================================

export async function listReconciliationIssues(
  filters: ReconciliationFilters
): Promise<{ rows: ReconciliationRow[]; total: number }> {
  const db = await getDb();
  const active = buildActiveChecks(filters);
  if (active.length === 0) return { rows: [], total: 0 };

  const union = Prisma.join(active.map((c) => c.sql), " UNION ALL ");
  const skip = (filters.page - 1) * filters.pageSize;

  const [rawRows, countResult] = await Promise.all([
    db.$queryRaw<RawReconciliationRow[]>(Prisma.sql`
      SELECT * FROM (${union}) AS combined
      ORDER BY
        CASE severity WHEN 'CRITICAL' THEN 0 WHEN 'HIGH' THEN 1 WHEN 'MEDIUM' THEN 2 ELSE 3 END,
        occurredAt DESC
      OFFSET ${skip} ROWS FETCH NEXT ${filters.pageSize} ROWS ONLY
    `),
    db.$queryRaw<[{ total: bigint }]>(Prisma.sql`
      SELECT COUNT(*) AS total FROM (${union}) AS combined
    `),
  ]);

  const total = Number(countResult[0]?.total ?? 0);
  const rows = await enrichWithIntegrityIssues(db, filters.organizationId, rawRows);

  return { rows, total };
}

// =============================================================================
// KPIs
// =============================================================================

export type ReconciliationKpiFilters = Pick<
  ReconciliationFilters,
  "organizationId" | "branchId" | "studentId" | "dateFrom" | "dateTo"
>;

async function countRows(db: Db, table: string, clauses: Prisma.Sql[]): Promise<number> {
  const [row] = await db.$queryRaw<[{ cnt: number | bigint }]>(Prisma.sql`
    SELECT COUNT(*) AS cnt FROM ${Prisma.raw(table)} WHERE ${Prisma.join(clauses, " AND ")}
  `);
  return Number(row?.cnt ?? 0);
}

function countConfirmedPayments(db: Db, filters: ReconciliationKpiFilters): Promise<number> {
  return countRows(db, "payments", [
    Prisma.sql`organizationId = ${filters.organizationId}`,
    Prisma.sql`status = 'CONFIRMED'`,
    ...eqClause("branchId", filters.branchId),
    ...eqClause("studentId", filters.studentId),
    ...dateRangeClauses("paymentDate", filters),
  ]);
}

function countCompletedRefunds(db: Db, filters: ReconciliationKpiFilters): Promise<number> {
  return countRows(db, "refunds", [
    Prisma.sql`organizationId = ${filters.organizationId}`,
    Prisma.sql`status = 'COMPLETED'`,
    Prisma.sql`deletedAt IS NULL`,
    ...eqClause("branchId", filters.branchId),
    ...eqClause("studentId", filters.studentId),
    ...dateRangeClauses("completedAt", filters),
  ]);
}

function countIssuedReceipts(db: Db, filters: ReconciliationKpiFilters): Promise<number> {
  return countRows(db, "receipts", [
    Prisma.sql`organizationId = ${filters.organizationId}`,
    Prisma.sql`status <> 'CANCELLED'`,
    ...eqClause("branchId", filters.branchId),
    ...eqClause("studentId", filters.studentId),
    ...dateRangeClauses("issueDate", filters),
  ]);
}

function countInvoices(db: Db, filters: ReconciliationKpiFilters): Promise<number> {
  return countRows(db, "invoices", [
    Prisma.sql`organizationId = ${filters.organizationId}`,
    Prisma.sql`deletedAt IS NULL`,
    ...eqClause("branchId", filters.branchId),
    ...eqClause("studentId", filters.studentId),
    ...dateRangeClauses("issueDate", filters),
  ]);
}

export async function getReconciliationKPIs(filters: ReconciliationKpiFilters): Promise<ReconciliationKPIs> {
  const db = await getDb();
  const scoped: ReconciliationFilters = { ...filters, page: 1, pageSize: 1 };
  const checks = buildActiveChecks(scoped); // all 7 — no issueType/entityType/severity restriction passed in

  const [checkCounts, confirmedPayments, completedRefunds, issuedReceipts, invoicesTotal] = await Promise.all([
    Promise.all(
      checks.map(async (c) => {
        const [row] = await db.$queryRaw<[{ cnt: number | bigint }]>(Prisma.sql`
          SELECT COUNT(*) AS cnt FROM (${c.sql}) AS x
        `);
        return [c.type, Number(row?.cnt ?? 0)] as const;
      })
    ),
    countConfirmedPayments(db, filters),
    countCompletedRefunds(db, filters),
    countIssuedReceipts(db, filters),
    countInvoices(db, filters),
  ]);

  const byType = new Map(checkCounts);

  const missingPaymentReceived = byType.get("MISSING_PAYMENT_RECEIVED") ?? 0;
  const missingRefundDisbursed = byType.get("MISSING_REFUND_DISBURSED") ?? 0;
  const missingReceiptIssued = byType.get("MISSING_RECEIPT_ISSUED") ?? 0;
  const invoiceMismatch = byType.get("INVOICE_PAID_AMOUNT_MISMATCH") ?? 0;
  const receiptMismatch = byType.get("RECEIPT_AMOUNT_MISMATCH") ?? 0;
  const orphan = byType.get("ORPHAN_LEDGER_ENTRY") ?? 0;
  const duplicate = byType.get("DUPLICATE_LEDGER_ENTRY") ?? 0;

  const missingLedgerEntries = missingPaymentReceived + missingRefundDisbursed + missingReceiptIssued;
  const valueMismatches = invoiceMismatch + receiptMismatch;
  const mismatchedItems = missingLedgerEntries + valueMismatches + orphan + duplicate;

  let criticalIssues = 0;
  for (const [type, count] of byType) {
    if (RECONCILIATION_ISSUE_META[type].severity === "CRITICAL") criticalIssues += count;
  }

  const totalChecked = confirmedPayments + completedRefunds + issuedReceipts + invoicesTotal;
  // Reconciled = checked entities with no missing-ledger-entry or value-mismatch issue.
  // Orphan/duplicate are ledger-side issues, not tied 1:1 to a checked source entity,
  // so they are excluded from this denominator.
  const reconciledItems = Math.max(totalChecked - missingLedgerEntries - valueMismatches, 0);

  return {
    reconciledItems,
    mismatchedItems,
    missingLedgerEntries,
    duplicateLedgerEntries: duplicate,
    orphanLedgerEntries: orphan,
    criticalIssues,
  };
}
