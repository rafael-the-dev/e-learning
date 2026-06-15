/**
 * FinancialTransactionService
 *
 * Each public function records exactly ONE ledger entry inside the caller's
 * database transaction. The caller is responsible for calling these functions
 * from within a db.$transaction() block — this guarantees that if the
 * originating financial event rolls back, no orphan ledger entry is left behind.
 *
 * Direction convention (from the organization's perspective):
 *   CREDIT — value flowing IN  (payment received, invoice recognised, credit applied to invoice)
 *   DEBIT  — value flowing OUT (refund disbursed, cancellation, wallet liability created)
 */
import { appendLedgerEntry } from "@/modules/finance/ledger/repositories/financial-transaction.repository";
import { FinancialTransactionType, FinancialDirection } from "@/shared/types/common";
import type { TxClient } from "@/modules/finance/ledger/repositories/financial-transaction.repository";

// ---------------------------------------------------------------------------
// Invoice events
// ---------------------------------------------------------------------------

export async function recordInvoiceCreated(
  tx: TxClient,
  organizationId: string,
  args: {
    invoiceId: string;
    invoiceNumber: string;
    amount: number;
    studentId?: string | null;
    enrollmentId?: string | null;
    actorId?: string | null;
  }
): Promise<void> {
  await appendLedgerEntry(tx, organizationId, {
    transactionType: FinancialTransactionType.INVOICE_CREATED,
    direction: FinancialDirection.CREDIT,
    amount: args.amount,
    sourceType: "Invoice",
    sourceId: args.invoiceId,
    invoiceId: args.invoiceId,
    studentId: args.studentId,
    enrollmentId: args.enrollmentId,
    description: `Fatura ${args.invoiceNumber} emitida`,
    actorId: args.actorId,
  });
}

export async function recordInvoiceCancelled(
  tx: TxClient,
  organizationId: string,
  args: {
    invoiceId: string;
    invoiceNumber: string;
    amount: number;
    studentId?: string | null;
    enrollmentId?: string | null;
    actorId?: string | null;
  }
): Promise<void> {
  await appendLedgerEntry(tx, organizationId, {
    transactionType: FinancialTransactionType.INVOICE_CANCELLED,
    direction: FinancialDirection.DEBIT,
    amount: args.amount,
    sourceType: "Invoice",
    sourceId: args.invoiceId,
    invoiceId: args.invoiceId,
    studentId: args.studentId,
    enrollmentId: args.enrollmentId,
    description: `Fatura ${args.invoiceNumber} cancelada`,
    actorId: args.actorId,
  });
}

// ---------------------------------------------------------------------------
// Payment events
// ---------------------------------------------------------------------------

export async function recordPaymentReceived(
  tx: TxClient,
  organizationId: string,
  args: {
    paymentId: string;
    paymentNumber: string;
    amount: number;
    invoiceId?: string | null;
    studentId?: string | null;
    enrollmentId?: string | null;
    actorId?: string | null;
  }
): Promise<void> {
  await appendLedgerEntry(tx, organizationId, {
    transactionType: FinancialTransactionType.PAYMENT_RECEIVED,
    direction: FinancialDirection.CREDIT,
    amount: args.amount,
    sourceType: "Payment",
    sourceId: args.paymentId,
    invoiceId: args.invoiceId,
    paymentId: args.paymentId,
    studentId: args.studentId,
    enrollmentId: args.enrollmentId,
    description: `Pagamento ${args.paymentNumber} confirmado`,
    actorId: args.actorId,
  });
}

export async function recordPaymentCancelled(
  tx: TxClient,
  organizationId: string,
  args: {
    paymentId: string;
    paymentNumber: string;
    amount: number;
    invoiceId?: string | null;
    studentId?: string | null;
    enrollmentId?: string | null;
    actorId?: string | null;
  }
): Promise<void> {
  await appendLedgerEntry(tx, organizationId, {
    transactionType: FinancialTransactionType.PAYMENT_CANCELLED,
    direction: FinancialDirection.DEBIT,
    amount: args.amount,
    sourceType: "Payment",
    sourceId: args.paymentId,
    invoiceId: args.invoiceId,
    paymentId: args.paymentId,
    studentId: args.studentId,
    enrollmentId: args.enrollmentId,
    description: `Pagamento ${args.paymentNumber} cancelado`,
    actorId: args.actorId,
  });
}

// ---------------------------------------------------------------------------
// Wallet events
// ---------------------------------------------------------------------------

/**
 * Wallet credit: money flows INTO the student's wallet.
 * From the org's perspective this is a DEBIT — it creates a liability
 * (the org owes the student the wallet balance).
 * Sources: overpayment credited to wallet, manual deposit adjustment.
 */
export async function recordWalletCredit(
  tx: TxClient,
  organizationId: string,
  args: {
    sourceId: string;
    amount: number;
    studentId?: string | null;
    paymentId?: string | null;
    description?: string | null;
    actorId?: string | null;
  }
): Promise<void> {
  await appendLedgerEntry(tx, organizationId, {
    transactionType: FinancialTransactionType.WALLET_CREDIT,
    direction: FinancialDirection.DEBIT,
    amount: args.amount,
    sourceType: "WalletTransaction",
    sourceId: args.sourceId,
    paymentId: args.paymentId,
    studentId: args.studentId,
    description: args.description ?? "Crédito adicionado à carteira",
    actorId: args.actorId,
  });
}

/**
 * Wallet debit: money flows OUT of the student's wallet as a cash disbursement.
 * (i.e. the student withdraws their wallet balance.)
 * From the org's perspective this is a DEBIT — actual cash leaves.
 * Sources: RefundWalletCommand, negative wallet adjustment.
 */
export async function recordWalletDebit(
  tx: TxClient,
  organizationId: string,
  args: {
    sourceId: string;
    amount: number;
    studentId?: string | null;
    description?: string | null;
    actorId?: string | null;
  }
): Promise<void> {
  await appendLedgerEntry(tx, organizationId, {
    transactionType: FinancialTransactionType.WALLET_DEBIT,
    direction: FinancialDirection.DEBIT,
    amount: args.amount,
    sourceType: "WalletTransaction",
    sourceId: args.sourceId,
    studentId: args.studentId,
    description: args.description ?? "Débito da carteira",
    actorId: args.actorId,
  });
}

/**
 * Credit applied: wallet balance is debited to settle an invoice.
 * From the org's perspective this is CREDIT — the receivable is resolved,
 * equivalent to receiving a payment from the student's pre-paid balance.
 * Sources: ApplyWalletCreditCommand, ConfirmPaymentCommand with walletCredit.
 */
export async function recordCreditApplied(
  tx: TxClient,
  organizationId: string,
  args: {
    sourceId: string;
    amount: number;
    invoiceId?: string | null;
    paymentId?: string | null;
    studentId?: string | null;
    description?: string | null;
    actorId?: string | null;
  }
): Promise<void> {
  await appendLedgerEntry(tx, organizationId, {
    transactionType: FinancialTransactionType.CREDIT_APPLIED,
    direction: FinancialDirection.CREDIT,
    amount: args.amount,
    sourceType: "CreditApplication",
    sourceId: args.sourceId,
    invoiceId: args.invoiceId,
    paymentId: args.paymentId,
    studentId: args.studentId,
    description: args.description ?? "Crédito de carteira aplicado à fatura",
    actorId: args.actorId,
  });
}

// ---------------------------------------------------------------------------
// Refund events
// ---------------------------------------------------------------------------

/**
 * Refund disbursed: an approved refund was completed — cash returned to student
 * (CASH_RETURN) or credited back to their wallet (WALLET_CREDIT method).
 * Either way, from the org's perspective this is a DEBIT — value goes out.
 */
export async function recordRefundDisbursed(
  tx: TxClient,
  organizationId: string,
  args: {
    refundId: string;
    refundNumber: string;
    amount: number;
    refundMethod: string;
    paymentId?: string | null;
    studentId?: string | null;
    actorId?: string | null;
  }
): Promise<void> {
  const methodLabel = args.refundMethod === "WALLET_CREDIT"
    ? "crédito na carteira"
    : "devolução em numerário";

  await appendLedgerEntry(tx, organizationId, {
    transactionType: FinancialTransactionType.REFUND_DISBURSED,
    direction: FinancialDirection.DEBIT,
    amount: args.amount,
    sourceType: "Refund",
    sourceId: args.refundId,
    paymentId: args.paymentId,
    refundId: args.refundId,
    studentId: args.studentId,
    description: `Reembolso ${args.refundNumber} concluído via ${methodLabel}`,
    actorId: args.actorId,
  });
}

// ---------------------------------------------------------------------------
// Receipt events
// ---------------------------------------------------------------------------

export async function recordReceiptIssued(
  tx: TxClient,
  organizationId: string,
  args: {
    receiptId: string;
    receiptNumber: string;
    amount: number;
    paymentId?: string | null;
    invoiceId?: string | null;
    studentId?: string | null;
    actorId?: string | null;
  }
): Promise<void> {
  await appendLedgerEntry(tx, organizationId, {
    transactionType: FinancialTransactionType.RECEIPT_ISSUED,
    direction: FinancialDirection.CREDIT,
    amount: args.amount,
    sourceType: "Receipt",
    sourceId: args.receiptId,
    receiptId: args.receiptId,
    paymentId: args.paymentId,
    invoiceId: args.invoiceId,
    studentId: args.studentId,
    description: `Recibo ${args.receiptNumber} emitido`,
    actorId: args.actorId,
  });
}
