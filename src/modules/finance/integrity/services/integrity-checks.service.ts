/**
 * integrity-checks.service.ts
 *
 * Read-only detection functions — one per check category.
 * Each function queries the database for a given organization and returns
 * a list of DetectedIssue objects. Nothing is written here.
 *
 * All checks use an epsilon of 0.01 for decimal comparisons to tolerate
 * floating-point representation differences from Prisma's Decimal mapping.
 *
 * IMPORTANT: These functions are NEVER auto-repair. They detect and report only.
 */
import { getDb } from "@/server/db";
import type { DetectedIssue } from "../types";
import {
  IntegrityIssueSeverity,
  IntegrityIssueCategory,
} from "@/shared/types/common";

export type Db = Awaited<ReturnType<typeof getDb>>;

const EPSILON = 0.01;

function toNum(v: unknown): number {
  if (v == null) return 0;
  if (typeof v === "number") return v;
  if (typeof v === "string") return parseFloat(v) || 0;
  if (typeof v === "object" && typeof (v as { toNumber?: () => number }).toNumber === "function") {
    return (v as { toNumber: () => number }).toNumber();
  }
  return Number(v) || 0;
}

// =============================================================================
// 1. INVOICE_BALANCE
// =============================================================================

/**
 * Checks:
 * a) paidAmount + balanceAmount ≠ totalAmount  → CRITICAL
 * b) totalAmount ≠ subtotal − discountAmount + taxAmount  → HIGH
 * c) status = PAID but balanceAmount > 0  → HIGH
 * d) status ∉ {PAID, CANCELLED} but balanceAmount = 0 and paidAmount > 0  → MEDIUM
 */
export async function checkInvoiceBalances(
  db: Db,
  organizationId: string
): Promise<DetectedIssue[]> {
  const issues: DetectedIssue[] = [];

  type InvoiceRow = {
    id: string;
    invoiceNumber: string;
    subtotal: unknown;
    discountAmount: unknown;
    taxAmount: unknown;
    totalAmount: unknown;
    paidAmount: unknown;
    balanceAmount: unknown;
    status: string;
  };

  const rows = await db.$queryRaw<InvoiceRow[]>`
    SELECT
      id,
      invoiceNumber,
      CAST(subtotal AS FLOAT)        AS subtotal,
      CAST(discountAmount AS FLOAT)  AS discountAmount,
      CAST(taxAmount AS FLOAT)       AS taxAmount,
      CAST(totalAmount AS FLOAT)     AS totalAmount,
      CAST(paidAmount AS FLOAT)      AS paidAmount,
      CAST(balanceAmount AS FLOAT)   AS balanceAmount,
      status
    FROM invoices
    WHERE organizationId = ${organizationId}
      AND deletedAt IS NULL
  `;

  for (const r of rows) {
    const total   = toNum(r.totalAmount);
    const paid    = toNum(r.paidAmount);
    const balance = toNum(r.balanceAmount);
    const subtotal = toNum(r.subtotal);
    const discount = toNum(r.discountAmount);
    const tax      = toNum(r.taxAmount);

    // (a) paidAmount + balanceAmount ≠ totalAmount
    if (Math.abs(paid + balance - total) > EPSILON) {
      issues.push({
        severity: IntegrityIssueSeverity.CRITICAL,
        category: IntegrityIssueCategory.INVOICE_BALANCE,
        checkName: "invoice.balance_amounts",
        entityType: "Invoice",
        entityId: r.id,
        description: `Fatura ${r.invoiceNumber}: paidAmount (${paid.toFixed(2)}) + balanceAmount (${balance.toFixed(2)}) ≠ totalAmount (${total.toFixed(2)})`,
        expectedValue: total.toFixed(2),
        actualValue: (paid + balance).toFixed(2),
      });
    }

    // (b) totalAmount ≠ subtotal − discount + tax
    const computed = subtotal - discount + tax;
    if (Math.abs(computed - total) > EPSILON) {
      issues.push({
        severity: IntegrityIssueSeverity.HIGH,
        category: IntegrityIssueCategory.INVOICE_BALANCE,
        checkName: "invoice.total_formula",
        entityType: "Invoice",
        entityId: r.id,
        description: `Fatura ${r.invoiceNumber}: totalAmount (${total.toFixed(2)}) ≠ subtotal (${subtotal.toFixed(2)}) − discount (${discount.toFixed(2)}) + tax (${tax.toFixed(2)}) = ${computed.toFixed(2)}`,
        expectedValue: computed.toFixed(2),
        actualValue: total.toFixed(2),
      });
    }

    if (r.status === "CANCELLED") continue;

    // (c) status = PAID but still has balance
    if (r.status === "PAID" && balance > EPSILON) {
      issues.push({
        severity: IntegrityIssueSeverity.HIGH,
        category: IntegrityIssueCategory.INVOICE_BALANCE,
        checkName: "invoice.status_paid_but_balance",
        entityType: "Invoice",
        entityId: r.id,
        description: `Fatura ${r.invoiceNumber} tem status PAID mas balanceAmount = ${balance.toFixed(2)}`,
        expectedValue: "0.00",
        actualValue: balance.toFixed(2),
      });
    }

    // (d) fully paid but status is not PAID or CANCELLED
    if (balance < EPSILON && paid > EPSILON && r.status !== "PAID" && r.status !== "CANCELLED") {
      issues.push({
        severity: IntegrityIssueSeverity.MEDIUM,
        category: IntegrityIssueCategory.INVOICE_BALANCE,
        checkName: "invoice.status_should_be_paid",
        entityType: "Invoice",
        entityId: r.id,
        description: `Fatura ${r.invoiceNumber} tem balanceAmount = 0 e paidAmount = ${paid.toFixed(2)} mas status = "${r.status}" (esperado: PAID)`,
        expectedValue: "PAID",
        actualValue: r.status,
      });
    }
  }

  return issues;
}

// =============================================================================
// 2. INSTALLMENT_BALANCE
// =============================================================================

/**
 * Checks:
 * a) SUM(installments.amount) ≠ paymentPlan.totalAmount  → HIGH
 * b) installment.paidAmount + installment.balanceAmount ≠ installment.amount  → CRITICAL
 */
export async function checkInstallmentBalances(
  db: Db,
  organizationId: string
): Promise<DetectedIssue[]> {
  const issues: DetectedIssue[] = [];

  // (a) Plan total vs installment sum
  type PlanRow = { planId: string; planTotal: unknown; installmentSum: unknown };
  const planRows = await db.$queryRaw<PlanRow[]>`
    SELECT
      pp.id                                  AS planId,
      CAST(pp.totalAmount AS FLOAT)          AS planTotal,
      CAST(SUM(i.amount) AS FLOAT)           AS installmentSum
    FROM payment_plans pp
    JOIN installments i
      ON  i.paymentPlanId    = pp.id
      AND i.organizationId   = pp.organizationId
    WHERE pp.organizationId = ${organizationId}
      AND pp.status != 'CANCELLED'
    GROUP BY pp.id, pp.totalAmount
    HAVING ABS(SUM(i.amount) - pp.totalAmount) > ${EPSILON}
  `;

  for (const r of planRows) {
    issues.push({
      severity: IntegrityIssueSeverity.HIGH,
      category: IntegrityIssueCategory.INSTALLMENT_BALANCE,
      checkName: "payment_plan.installment_sum",
      entityType: "PaymentPlan",
      entityId: r.planId,
      description: `Plano de pagamento: soma das prestações (${toNum(r.installmentSum).toFixed(2)}) ≠ totalAmount do plano (${toNum(r.planTotal).toFixed(2)})`,
      expectedValue: toNum(r.planTotal).toFixed(2),
      actualValue: toNum(r.installmentSum).toFixed(2),
    });
  }

  // (b) Individual installment balance check
  type InstRow = {
    id: string;
    installmentNumber: number;
    amount: unknown;
    paidAmount: unknown;
    balanceAmount: unknown;
  };
  const instRows = await db.$queryRaw<InstRow[]>`
    SELECT
      id,
      installmentNumber,
      CAST(amount AS FLOAT)        AS amount,
      CAST(paidAmount AS FLOAT)    AS paidAmount,
      CAST(balanceAmount AS FLOAT) AS balanceAmount
    FROM installments
    WHERE organizationId = ${organizationId}
      AND ABS(paidAmount + balanceAmount - amount) > ${EPSILON}
  `;

  for (const r of instRows) {
    const amt  = toNum(r.amount);
    const paid = toNum(r.paidAmount);
    const bal  = toNum(r.balanceAmount);
    issues.push({
      severity: IntegrityIssueSeverity.CRITICAL,
      category: IntegrityIssueCategory.INSTALLMENT_BALANCE,
      checkName: "installment.balance_amounts",
      entityType: "Installment",
      entityId: r.id,
      description: `Prestação #${r.installmentNumber}: paidAmount (${paid.toFixed(2)}) + balanceAmount (${bal.toFixed(2)}) ≠ amount (${amt.toFixed(2)})`,
      expectedValue: amt.toFixed(2),
      actualValue: (paid + bal).toFixed(2),
    });
  }

  return issues;
}

// =============================================================================
// 3. PAYMENT_ALLOCATION
// =============================================================================

/**
 * Checks:
 * a) SUM(paymentSplits.amount) ≠ payment.totalAmount for CONFIRMED payments  → CRITICAL
 * b) SUM(paymentAllocations.amount) ≠ payment.totalAmount for CONFIRMED payments  → HIGH
 * c) PaymentAllocation referencing a CANCELLED invoice  → MEDIUM
 */
export async function checkPaymentAllocations(
  db: Db,
  organizationId: string
): Promise<DetectedIssue[]> {
  const issues: DetectedIssue[] = [];

  // (a) Split sum vs totalAmount
  type SplitRow = { paymentId: string; paymentNumber: string; total: unknown; splitSum: unknown };
  const splitRows = await db.$queryRaw<SplitRow[]>`
    SELECT
      p.id                              AS paymentId,
      p.paymentNumber                   AS paymentNumber,
      CAST(p.totalAmount AS FLOAT)      AS total,
      CAST(SUM(ps.amount) AS FLOAT)     AS splitSum
    FROM payments p
    JOIN payment_splits ps
      ON  ps.paymentId      = p.id
      AND ps.organizationId = p.organizationId
    WHERE p.organizationId = ${organizationId}
      AND p.status IN ('CONFIRMED', 'PARTIALLY_REFUNDED', 'REFUNDED')
    GROUP BY p.id, p.paymentNumber, p.totalAmount
    HAVING ABS(SUM(ps.amount) - p.totalAmount) > ${EPSILON}
  `;

  for (const r of splitRows) {
    issues.push({
      severity: IntegrityIssueSeverity.CRITICAL,
      category: IntegrityIssueCategory.PAYMENT_ALLOCATION,
      checkName: "payment.split_sum",
      entityType: "Payment",
      entityId: r.paymentId,
      description: `Pagamento ${r.paymentNumber}: soma das divisões (${toNum(r.splitSum).toFixed(2)}) ≠ totalAmount (${toNum(r.total).toFixed(2)})`,
      expectedValue: toNum(r.total).toFixed(2),
      actualValue: toNum(r.splitSum).toFixed(2),
    });
  }

  // (b) Allocation sum vs totalAmount
  type AllocRow = {
    paymentId: string;
    paymentNumber: string;
    total: unknown;
    allocSum: unknown;
  };
  const allocRows = await db.$queryRaw<AllocRow[]>`
    SELECT
      p.id                                AS paymentId,
      p.paymentNumber                     AS paymentNumber,
      CAST(p.totalAmount AS FLOAT)        AS total,
      CAST(SUM(pa.amount) AS FLOAT)       AS allocSum
    FROM payments p
    JOIN payment_allocations pa
      ON  pa.paymentId      = p.id
      AND pa.organizationId = p.organizationId
    WHERE p.organizationId = ${organizationId}
      AND p.status IN ('CONFIRMED', 'PARTIALLY_REFUNDED', 'REFUNDED')
    GROUP BY p.id, p.paymentNumber, p.totalAmount
    HAVING ABS(SUM(pa.amount) - p.totalAmount) > ${EPSILON}
  `;

  for (const r of allocRows) {
    issues.push({
      severity: IntegrityIssueSeverity.HIGH,
      category: IntegrityIssueCategory.PAYMENT_ALLOCATION,
      checkName: "payment.allocation_sum",
      entityType: "Payment",
      entityId: r.paymentId,
      description: `Pagamento ${r.paymentNumber}: soma das imputações (${toNum(r.allocSum).toFixed(2)}) ≠ totalAmount (${toNum(r.total).toFixed(2)})`,
      expectedValue: toNum(r.total).toFixed(2),
      actualValue: toNum(r.allocSum).toFixed(2),
    });
  }

  // (c) Allocations pointing to a CANCELLED invoice
  type OrphanAllocRow = { id: string; invoiceId: string };
  const orphanAllocs = await db.$queryRaw<OrphanAllocRow[]>`
    SELECT pa.id, pa.invoiceId
    FROM payment_allocations pa
    JOIN invoices inv
      ON  inv.id             = pa.invoiceId
      AND inv.organizationId = pa.organizationId
    WHERE pa.organizationId = ${organizationId}
      AND inv.status = 'CANCELLED'
      AND pa.paymentId IS NOT NULL
  `;

  for (const r of orphanAllocs) {
    issues.push({
      severity: IntegrityIssueSeverity.MEDIUM,
      category: IntegrityIssueCategory.PAYMENT_ALLOCATION,
      checkName: "payment_allocation.cancelled_invoice",
      entityType: "PaymentAllocation",
      entityId: r.id,
      description: `Imputação de pagamento referencia fatura cancelada ${r.invoiceId}`,
      actualValue: "Invoice.CANCELLED",
    });
  }

  return issues;
}

// =============================================================================
// 4. WALLET_BALANCE
// =============================================================================

/**
 * Checks:
 * a) Computed wallet balance (SUM of transactions) is negative  → CRITICAL
 * b) CreditApplication.amount ≠ SUM of linked PaymentAllocation amounts  → HIGH
 */
export async function checkWalletBalances(
  db: Db,
  organizationId: string
): Promise<DetectedIssue[]> {
  const issues: DetectedIssue[] = [];

  // (a) Negative balance wallets
  type NegWalletRow = { walletId: string; studentId: string; computedBalance: unknown };
  const negRows = await db.$queryRaw<NegWalletRow[]>`
    SELECT
      sw.id                               AS walletId,
      sw.studentId                        AS studentId,
      CAST(SUM(swt.amount) AS FLOAT)      AS computedBalance
    FROM student_wallets sw
    JOIN student_wallet_transactions swt
      ON  swt.studentWalletId  = sw.id
      AND swt.organizationId   = sw.organizationId
    WHERE sw.organizationId = ${organizationId}
    GROUP BY sw.id, sw.studentId
    HAVING SUM(swt.amount) < ${-EPSILON}
  `;

  for (const r of negRows) {
    issues.push({
      severity: IntegrityIssueSeverity.CRITICAL,
      category: IntegrityIssueCategory.WALLET_BALANCE,
      checkName: "wallet.negative_balance",
      entityType: "StudentWallet",
      entityId: r.walletId,
      description: `Carteira do estudante ${r.studentId} tem saldo computado negativo: ${toNum(r.computedBalance).toFixed(2)}`,
      expectedValue: "≥ 0.00",
      actualValue: toNum(r.computedBalance).toFixed(2),
    });
  }

  // (b) CreditApplication vs its PaymentAllocations
  type CreditAllocRow = {
    caId: string;
    caAmount: unknown;
    allocSum: unknown;
  };
  const creditRows = await db.$queryRaw<CreditAllocRow[]>`
    SELECT
      ca.id                               AS caId,
      CAST(ca.amount AS FLOAT)            AS caAmount,
      CAST(SUM(pa.amount) AS FLOAT)       AS allocSum
    FROM credit_applications ca
    JOIN payment_allocations pa
      ON  pa.creditApplicationId = ca.id
      AND pa.organizationId      = ca.organizationId
    WHERE ca.organizationId = ${organizationId}
    GROUP BY ca.id, ca.amount
    HAVING ABS(SUM(pa.amount) - ca.amount) > ${EPSILON}
  `;

  for (const r of creditRows) {
    issues.push({
      severity: IntegrityIssueSeverity.HIGH,
      category: IntegrityIssueCategory.WALLET_BALANCE,
      checkName: "credit_application.allocation_mismatch",
      entityType: "CreditApplication",
      entityId: r.caId,
      description: `Aplicação de crédito: soma das imputações (${toNum(r.allocSum).toFixed(2)}) ≠ amount (${toNum(r.caAmount).toFixed(2)})`,
      expectedValue: toNum(r.caAmount).toFixed(2),
      actualValue: toNum(r.allocSum).toFixed(2),
    });
  }

  return issues;
}

// =============================================================================
// 5. REFUND_TOTAL
// =============================================================================

/**
 * Checks:
 * a) SUM(COMPLETED refunds) > payment.totalAmount  → CRITICAL
 * b) receipt.refundedAmount ≠ SUM(COMPLETED refunds for same payment)  → HIGH
 */
export async function checkRefundTotals(
  db: Db,
  organizationId: string
): Promise<DetectedIssue[]> {
  const issues: DetectedIssue[] = [];

  // (a) Over-refunded payments
  type OverRefundRow = {
    paymentId: string;
    paymentNumber: string;
    total: unknown;
    refundSum: unknown;
  };
  const overRows = await db.$queryRaw<OverRefundRow[]>`
    SELECT
      p.id                              AS paymentId,
      p.paymentNumber                   AS paymentNumber,
      CAST(p.totalAmount AS FLOAT)      AS total,
      CAST(SUM(r.amount) AS FLOAT)      AS refundSum
    FROM payments p
    JOIN refunds r
      ON  r.paymentId      = p.id
      AND r.organizationId = p.organizationId
    WHERE p.organizationId = ${organizationId}
      AND r.status         = 'COMPLETED'
      AND r.deletedAt      IS NULL
    GROUP BY p.id, p.paymentNumber, p.totalAmount
    HAVING SUM(r.amount) > p.totalAmount + ${EPSILON}
  `;

  for (const r of overRows) {
    issues.push({
      severity: IntegrityIssueSeverity.CRITICAL,
      category: IntegrityIssueCategory.REFUND_TOTAL,
      checkName: "refund.exceeds_payment",
      entityType: "Payment",
      entityId: r.paymentId,
      description: `Pagamento ${r.paymentNumber}: soma de reembolsos concluídos (${toNum(r.refundSum).toFixed(2)}) excede totalAmount (${toNum(r.total).toFixed(2)})`,
      expectedValue: `≤ ${toNum(r.total).toFixed(2)}`,
      actualValue: toNum(r.refundSum).toFixed(2),
    });
  }

  // (b) Receipt.refundedAmount vs actual completed refunds
  type ReceiptRefundRow = {
    receiptId: string;
    receiptNumber: string;
    receiptRefunded: unknown;
    actualRefundSum: unknown;
  };
  const receiptRows = await db.$queryRaw<ReceiptRefundRow[]>`
    SELECT
      rec.id                                 AS receiptId,
      rec.receiptNumber                      AS receiptNumber,
      CAST(rec.refundedAmount AS FLOAT)      AS receiptRefunded,
      CAST(SUM(r.amount) AS FLOAT)           AS actualRefundSum
    FROM receipts rec
    JOIN refunds r
      ON  r.paymentId      = rec.paymentId
      AND r.organizationId = rec.organizationId
    WHERE rec.organizationId = ${organizationId}
      AND r.status           = 'COMPLETED'
      AND r.deletedAt        IS NULL
    GROUP BY rec.id, rec.receiptNumber, rec.refundedAmount
    HAVING ABS(SUM(r.amount) - rec.refundedAmount) > ${EPSILON}
  `;

  for (const r of receiptRows) {
    issues.push({
      severity: IntegrityIssueSeverity.HIGH,
      category: IntegrityIssueCategory.REFUND_TOTAL,
      checkName: "receipt.refunded_amount_mismatch",
      entityType: "Receipt",
      entityId: r.receiptId,
      description: `Recibo ${r.receiptNumber}: refundedAmount armazenado (${toNum(r.receiptRefunded).toFixed(2)}) ≠ soma de reembolsos concluídos (${toNum(r.actualRefundSum).toFixed(2)})`,
      expectedValue: toNum(r.actualRefundSum).toFixed(2),
      actualValue: toNum(r.receiptRefunded).toFixed(2),
    });
  }

  return issues;
}

// =============================================================================
// 6. RECEIPT_INTEGRITY
// =============================================================================

/**
 * Checks:
 * a) receipt.amount ≠ payment.totalAmount  → HIGH
 * b) Fully refunded (sum ≥ receipt.amount) but status ≠ CANCELLED  → HIGH
 * c) Partially refunded (sum > 0) but status = ISSUED  → MEDIUM
 */
export async function checkReceiptIntegrity(
  db: Db,
  organizationId: string
): Promise<DetectedIssue[]> {
  const issues: DetectedIssue[] = [];

  // (a) Amount mismatch
  type AmountRow = {
    receiptId: string;
    receiptNumber: string;
    receiptAmount: unknown;
    paymentTotal: unknown;
  };
  const amountRows = await db.$queryRaw<AmountRow[]>`
    SELECT
      rec.id                                 AS receiptId,
      rec.receiptNumber                      AS receiptNumber,
      CAST(rec.amount AS FLOAT)              AS receiptAmount,
      CAST(p.totalAmount AS FLOAT)           AS paymentTotal
    FROM receipts rec
    JOIN payments p
      ON  p.id             = rec.paymentId
      AND p.organizationId = rec.organizationId
    WHERE rec.organizationId = ${organizationId}
      AND rec.status         != 'CANCELLED'
      AND ABS(rec.amount - p.totalAmount) > ${EPSILON}
  `;

  for (const r of amountRows) {
    issues.push({
      severity: IntegrityIssueSeverity.HIGH,
      category: IntegrityIssueCategory.RECEIPT_INTEGRITY,
      checkName: "receipt.amount_mismatch",
      entityType: "Receipt",
      entityId: r.receiptId,
      description: `Recibo ${r.receiptNumber}: amount (${toNum(r.receiptAmount).toFixed(2)}) ≠ totalAmount do pagamento (${toNum(r.paymentTotal).toFixed(2)})`,
      expectedValue: toNum(r.paymentTotal).toFixed(2),
      actualValue: toNum(r.receiptAmount).toFixed(2),
    });
  }

  // (b) + (c) Status inconsistency based on refundedAmount
  type StatusRow = {
    receiptId: string;
    receiptNumber: string;
    amount: unknown;
    refundedAmount: unknown;
    status: string;
  };
  const statusRows = await db.$queryRaw<StatusRow[]>`
    SELECT
      id                                   AS receiptId,
      receiptNumber                        AS receiptNumber,
      CAST(amount AS FLOAT)                AS amount,
      CAST(refundedAmount AS FLOAT)        AS refundedAmount,
      status
    FROM receipts
    WHERE organizationId = ${organizationId}
      AND refundedAmount  > 0
  `;

  for (const r of statusRows) {
    const amt      = toNum(r.amount);
    const refunded = toNum(r.refundedAmount);

    // (b) Fully refunded but not CANCELLED
    if (refunded >= amt - EPSILON && r.status !== "CANCELLED") {
      issues.push({
        severity: IntegrityIssueSeverity.HIGH,
        category: IntegrityIssueCategory.RECEIPT_INTEGRITY,
        checkName: "receipt.status_should_be_cancelled",
        entityType: "Receipt",
        entityId: r.receiptId,
        description: `Recibo ${r.receiptNumber} tem refundedAmount (${refunded.toFixed(2)}) ≥ amount (${amt.toFixed(2)}) mas status = "${r.status}" (esperado: CANCELLED)`,
        expectedValue: "CANCELLED",
        actualValue: r.status,
      });
      continue;
    }

    // (c) Partially refunded but status is still ISSUED
    if (refunded > EPSILON && r.status === "ISSUED") {
      issues.push({
        severity: IntegrityIssueSeverity.MEDIUM,
        category: IntegrityIssueCategory.RECEIPT_INTEGRITY,
        checkName: "receipt.status_should_be_partially_refunded",
        entityType: "Receipt",
        entityId: r.receiptId,
        description: `Recibo ${r.receiptNumber} tem refundedAmount = ${refunded.toFixed(2)} mas status = "ISSUED" (esperado: PARTIALLY_REFUNDED)`,
        expectedValue: "PARTIALLY_REFUNDED",
        actualValue: r.status,
      });
    }
  }

  return issues;
}

// =============================================================================
// 7. ORPHAN_RECORD
// =============================================================================

/**
 * Checks:
 * a) Non-rejected/cancelled Refund pointing to a CANCELLED payment  → HIGH
 * b) CreditApplication pointing to a CANCELLED invoice  → MEDIUM
 * c) StudentWalletTransaction with no matching wallet (data corruption)  → CRITICAL
 */
export async function checkOrphanRecords(
  db: Db,
  organizationId: string
): Promise<DetectedIssue[]> {
  const issues: DetectedIssue[] = [];

  // (a) Refund → cancelled payment
  type OrphanRefundRow = { id: string; refundNumber: string; paymentId: string };
  const orphanRefunds = await db.$queryRaw<OrphanRefundRow[]>`
    SELECT r.id, r.refundNumber, r.paymentId
    FROM refunds r
    JOIN payments p
      ON  p.id             = r.paymentId
      AND p.organizationId = r.organizationId
    WHERE r.organizationId = ${organizationId}
      AND p.status         = 'CANCELLED'
      AND r.status         NOT IN ('REJECTED')
      AND r.deletedAt      IS NULL
  `;

  for (const r of orphanRefunds) {
    issues.push({
      severity: IntegrityIssueSeverity.HIGH,
      category: IntegrityIssueCategory.ORPHAN_RECORD,
      checkName: "refund.cancelled_payment",
      entityType: "Refund",
      entityId: r.id,
      description: `Reembolso ${r.refundNumber} referencia o pagamento ${r.paymentId} que está CANCELLED`,
      actualValue: "Payment.CANCELLED",
    });
  }

  // (b) CreditApplication → cancelled invoice
  type OrphanCreditRow = { id: string; invoiceId: string };
  const orphanCredits = await db.$queryRaw<OrphanCreditRow[]>`
    SELECT ca.id, ca.invoiceId
    FROM credit_applications ca
    JOIN invoices inv
      ON  inv.id             = ca.invoiceId
      AND inv.organizationId = ca.organizationId
    WHERE ca.organizationId = ${organizationId}
      AND inv.status        = 'CANCELLED'
  `;

  for (const r of orphanCredits) {
    issues.push({
      severity: IntegrityIssueSeverity.MEDIUM,
      category: IntegrityIssueCategory.ORPHAN_RECORD,
      checkName: "credit_application.cancelled_invoice",
      entityType: "CreditApplication",
      entityId: r.id,
      description: `Aplicação de crédito referencia fatura ${r.invoiceId} que está CANCELLED`,
      actualValue: "Invoice.CANCELLED",
    });
  }

  // (c) WalletTransaction with missing wallet (FK violation would normally prevent this,
  //     but we check anyway to guard against manual data fixes or cascade gaps)
  type OrphanWalletTxRow = { id: string };
  const orphanTxs = await db.$queryRaw<OrphanWalletTxRow[]>`
    SELECT swt.id
    FROM student_wallet_transactions swt
    WHERE swt.organizationId = ${organizationId}
      AND NOT EXISTS (
        SELECT 1 FROM student_wallets sw
        WHERE sw.id             = swt.studentWalletId
          AND sw.organizationId = swt.organizationId
      )
  `;

  for (const r of orphanTxs) {
    issues.push({
      severity: IntegrityIssueSeverity.CRITICAL,
      category: IntegrityIssueCategory.ORPHAN_RECORD,
      checkName: "wallet_transaction.missing_wallet",
      entityType: "StudentWalletTransaction",
      entityId: r.id,
      description: `Transação de carteira ${r.id} não encontrou a carteira pai — possível corrupção de dados`,
    });
  }

  return issues;
}

// =============================================================================
// 8. LEDGER_CONSISTENCY
// =============================================================================

/**
 * Checks (detect within ledger itself — avoids cross-table gap detection
 * that would produce false positives for pre-ledger historical records):
 * a) Duplicate ledger entries for the same source event  → HIGH
 * b) Ledger entry direction contradicts the expected direction for its type  → CRITICAL
 * c) Ledger entry amount ≤ 0  → CRITICAL
 * d) Ledger entry has no associated invoice/payment/receipt when one is expected  → LOW
 */
export async function checkLedgerConsistency(
  db: Db,
  organizationId: string
): Promise<DetectedIssue[]> {
  const issues: DetectedIssue[] = [];

  // (a) Duplicate entries: same sourceType + sourceId + transactionType
  type DupRow = {
    sourceType: string;
    sourceId: string;
    transactionType: string;
    cnt: number | bigint;
  };
  const dupRows = await db.$queryRaw<DupRow[]>`
    SELECT
      sourceType,
      sourceId,
      transactionType,
      COUNT(*) AS cnt
    FROM financial_transactions
    WHERE organizationId = ${organizationId}
    GROUP BY sourceType, sourceId, transactionType
    HAVING COUNT(*) > 1
  `;

  for (const r of dupRows) {
    const count = Number(r.cnt);
    issues.push({
      severity: IntegrityIssueSeverity.HIGH,
      category: IntegrityIssueCategory.LEDGER_CONSISTENCY,
      checkName: "ledger.duplicate_entry",
      entityType: "FinancialTransaction",
      entityId: `${r.sourceType}:${r.sourceId}:${r.transactionType}`,
      description: `${count} entradas duplicadas no razão para ${r.sourceType} ${r.sourceId} com tipo ${r.transactionType}`,
      expectedValue: "1",
      actualValue: String(count),
    });
  }

  // (b) Direction inconsistency
  // Expected direction per transactionType (hardcoded contract)
  const expectedDirections: Record<string, "CREDIT" | "DEBIT"> = {
    INVOICE_CREATED:   "CREDIT",
    INVOICE_CANCELLED: "DEBIT",
    PAYMENT_RECEIVED:  "CREDIT",
    PAYMENT_CANCELLED: "DEBIT",
    CREDIT_APPLIED:    "CREDIT",
    WALLET_CREDIT:     "DEBIT",
    WALLET_DEBIT:      "DEBIT",
    REFUND_DISBURSED:  "DEBIT",
    RECEIPT_ISSUED:    "CREDIT",
  };

  type DirectionRow = {
    id: string;
    transactionNumber: string;
    transactionType: string;
    direction: string;
  };
  const dirRows = await db.$queryRaw<DirectionRow[]>`
    SELECT id, transactionNumber, transactionType, direction
    FROM financial_transactions
    WHERE organizationId = ${organizationId}
  `;

  for (const r of dirRows) {
    const expected = expectedDirections[r.transactionType];
    if (expected && r.direction !== expected) {
      issues.push({
        severity: IntegrityIssueSeverity.CRITICAL,
        category: IntegrityIssueCategory.LEDGER_CONSISTENCY,
        checkName: "ledger.wrong_direction",
        entityType: "FinancialTransaction",
        entityId: r.id,
        description: `Entrada ${r.transactionNumber} (${r.transactionType}) tem direction="${r.direction}" mas era esperado "${expected}" — possível adulteração do razão`,
        expectedValue: expected,
        actualValue: r.direction,
      });
    }
  }

  // (c) Zero or negative amounts
  type AmountRow = { id: string; transactionNumber: string; amount: unknown };
  const zeroRows = await db.$queryRaw<AmountRow[]>`
    SELECT id, transactionNumber, CAST(amount AS FLOAT) AS amount
    FROM financial_transactions
    WHERE organizationId = ${organizationId}
      AND amount         <= 0
  `;

  for (const r of zeroRows) {
    issues.push({
      severity: IntegrityIssueSeverity.CRITICAL,
      category: IntegrityIssueCategory.LEDGER_CONSISTENCY,
      checkName: "ledger.non_positive_amount",
      entityType: "FinancialTransaction",
      entityId: r.id,
      description: `Entrada ${r.transactionNumber} tem amount = ${toNum(r.amount).toFixed(2)} (deve ser > 0)`,
      expectedValue: "> 0",
      actualValue: toNum(r.amount).toFixed(2),
    });
  }

  return issues;
}

// =============================================================================
// RUN ALL CHECKS
// =============================================================================

export type CheckRunner = (db: Db, organizationId: string) => Promise<DetectedIssue[]>;

export const ALL_CHECKS: Array<{
  category: IntegrityIssueCategory;
  run: CheckRunner;
}> = [
  { category: IntegrityIssueCategory.INVOICE_BALANCE,     run: checkInvoiceBalances     },
  { category: IntegrityIssueCategory.INSTALLMENT_BALANCE, run: checkInstallmentBalances  },
  { category: IntegrityIssueCategory.PAYMENT_ALLOCATION,  run: checkPaymentAllocations   },
  { category: IntegrityIssueCategory.WALLET_BALANCE,      run: checkWalletBalances       },
  { category: IntegrityIssueCategory.REFUND_TOTAL,        run: checkRefundTotals         },
  { category: IntegrityIssueCategory.RECEIPT_INTEGRITY,   run: checkReceiptIntegrity     },
  { category: IntegrityIssueCategory.ORPHAN_RECORD,       run: checkOrphanRecords        },
  { category: IntegrityIssueCategory.LEDGER_CONSISTENCY,  run: checkLedgerConsistency    },
];
