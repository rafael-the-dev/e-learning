/**
 * financial-transaction.service.test.ts
 *
 * Verifies that each record* helper in FinancialTransactionService calls
 * appendLedgerEntry with the correct transactionType, direction, amount,
 * sourceType, sourceId, and cross-reference fields.
 *
 * The database is fully mocked — these are pure unit tests.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Mock } from "vitest";

// ---------------------------------------------------------------------------
// Module mocks — hoisted before imports
// ---------------------------------------------------------------------------

vi.mock("@/modules/finance/ledger/repositories/financial-transaction.repository", () => ({
  appendLedgerEntry: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/modules/finance/services/financial-sequence.service", () => ({
  getNextTransactionNumber: vi.fn().mockResolvedValue("TXN-000001"),
}));

import {
  recordInvoiceCreated,
  recordInvoiceCancelled,
  recordPaymentReceived,
  recordPaymentCancelled,
  recordCreditApplied,
  recordWalletCredit,
  recordWalletDebit,
  recordRefundDisbursed,
  recordReceiptIssued,
} from "@/modules/finance/ledger/services/financial-transaction.service";
import { appendLedgerEntry } from "@/modules/finance/ledger/repositories/financial-transaction.repository";
import { FinancialTransactionType, FinancialDirection } from "@/shared/types/common";

// ---------------------------------------------------------------------------
// Shared fixture
// ---------------------------------------------------------------------------

// A minimal TxClient stand-in — the service passes it straight through to
// appendLedgerEntry, so any object will do for these unit tests.
const TX = {} as Parameters<typeof recordInvoiceCreated>[0];
const ORG = "org-1";

beforeEach(() => vi.clearAllMocks());

// ---------------------------------------------------------------------------
// Invoice Created
// ---------------------------------------------------------------------------

describe("recordInvoiceCreated", () => {
  it("appends INVOICE_CREATED CREDIT entry with correct fields", async () => {
    await recordInvoiceCreated(TX, ORG, {
      invoiceId: "inv-1",
      invoiceNumber: "FAT-000001",
      amount: 500,
      studentId: "stu-1",
      enrollmentId: "enr-1",
      actorId: "user-1",
    });

    expect(appendLedgerEntry).toHaveBeenCalledWith(TX, ORG, expect.objectContaining({
      transactionType: FinancialTransactionType.INVOICE_CREATED,
      direction: FinancialDirection.CREDIT,
      amount: 500,
      sourceType: "Invoice",
      sourceId: "inv-1",
      invoiceId: "inv-1",
      studentId: "stu-1",
      enrollmentId: "enr-1",
      actorId: "user-1",
    }));
  });

  it("works with optional fields omitted", async () => {
    await recordInvoiceCreated(TX, ORG, {
      invoiceId: "inv-2",
      invoiceNumber: "FAT-000002",
      amount: 200,
    });

    expect(appendLedgerEntry).toHaveBeenCalledWith(TX, ORG, expect.objectContaining({
      transactionType: FinancialTransactionType.INVOICE_CREATED,
      direction: FinancialDirection.CREDIT,
      amount: 200,
      sourceId: "inv-2",
    }));
  });
});

// ---------------------------------------------------------------------------
// Invoice Cancelled
// ---------------------------------------------------------------------------

describe("recordInvoiceCancelled", () => {
  it("appends INVOICE_CANCELLED DEBIT entry", async () => {
    await recordInvoiceCancelled(TX, ORG, {
      invoiceId: "inv-1",
      invoiceNumber: "FAT-000001",
      amount: 500,
      studentId: "stu-1",
      actorId: "user-1",
    });

    expect(appendLedgerEntry).toHaveBeenCalledWith(TX, ORG, expect.objectContaining({
      transactionType: FinancialTransactionType.INVOICE_CANCELLED,
      direction: FinancialDirection.DEBIT,
      amount: 500,
      sourceType: "Invoice",
      sourceId: "inv-1",
    }));
  });
});

// ---------------------------------------------------------------------------
// Payment Received
// ---------------------------------------------------------------------------

describe("recordPaymentReceived", () => {
  it("appends PAYMENT_RECEIVED CREDIT entry with payment cross-reference", async () => {
    await recordPaymentReceived(TX, ORG, {
      paymentId: "pay-1",
      paymentNumber: "PAG-000001",
      amount: 300,
      invoiceId: "inv-1",
      studentId: "stu-1",
      enrollmentId: "enr-1",
      actorId: "user-1",
    });

    expect(appendLedgerEntry).toHaveBeenCalledWith(TX, ORG, expect.objectContaining({
      transactionType: FinancialTransactionType.PAYMENT_RECEIVED,
      direction: FinancialDirection.CREDIT,
      amount: 300,
      sourceType: "Payment",
      sourceId: "pay-1",
      invoiceId: "inv-1",
      paymentId: "pay-1",
      studentId: "stu-1",
    }));
  });

  it("description mentions the payment number", async () => {
    await recordPaymentReceived(TX, ORG, {
      paymentId: "pay-1",
      paymentNumber: "PAG-000001",
      amount: 300,
    });

    const call = (appendLedgerEntry as Mock).mock.calls[0][2];
    expect(call.description).toContain("PAG-000001");
  });
});

// ---------------------------------------------------------------------------
// Payment Cancelled
// ---------------------------------------------------------------------------

describe("recordPaymentCancelled", () => {
  it("appends PAYMENT_CANCELLED DEBIT entry", async () => {
    await recordPaymentCancelled(TX, ORG, {
      paymentId: "pay-1",
      paymentNumber: "PAG-000001",
      amount: 300,
      invoiceId: "inv-1",
      studentId: "stu-1",
      actorId: "user-1",
    });

    expect(appendLedgerEntry).toHaveBeenCalledWith(TX, ORG, expect.objectContaining({
      transactionType: FinancialTransactionType.PAYMENT_CANCELLED,
      direction: FinancialDirection.DEBIT,
      amount: 300,
      sourceType: "Payment",
      sourceId: "pay-1",
      paymentId: "pay-1",
    }));
  });
});

// ---------------------------------------------------------------------------
// Credit Applied
// ---------------------------------------------------------------------------

describe("recordCreditApplied", () => {
  it("appends CREDIT_APPLIED CREDIT entry sourced from CreditApplication", async () => {
    await recordCreditApplied(TX, ORG, {
      sourceId: "ca-1",
      amount: 80,
      invoiceId: "inv-1",
      paymentId: "pay-1",
      studentId: "stu-1",
      actorId: "user-1",
    });

    expect(appendLedgerEntry).toHaveBeenCalledWith(TX, ORG, expect.objectContaining({
      transactionType: FinancialTransactionType.CREDIT_APPLIED,
      direction: FinancialDirection.CREDIT,
      amount: 80,
      sourceType: "CreditApplication",
      sourceId: "ca-1",
      invoiceId: "inv-1",
      paymentId: "pay-1",
      studentId: "stu-1",
    }));
  });

  it("works without an associated paymentId (standalone credit application)", async () => {
    await recordCreditApplied(TX, ORG, {
      sourceId: "ca-2",
      amount: 50,
      invoiceId: "inv-2",
      studentId: "stu-1",
    });

    expect(appendLedgerEntry).toHaveBeenCalledWith(TX, ORG, expect.objectContaining({
      transactionType: FinancialTransactionType.CREDIT_APPLIED,
      direction: FinancialDirection.CREDIT,
      amount: 50,
      sourceId: "ca-2",
    }));
  });
});

// ---------------------------------------------------------------------------
// Wallet Credit
// ---------------------------------------------------------------------------

describe("recordWalletCredit", () => {
  it("appends WALLET_CREDIT DEBIT entry (org creates liability)", async () => {
    await recordWalletCredit(TX, ORG, {
      sourceId: "wt-1",
      amount: 120,
      studentId: "stu-1",
      paymentId: "pay-1",
      description: "Overpayment creditado",
      actorId: "user-1",
    });

    expect(appendLedgerEntry).toHaveBeenCalledWith(TX, ORG, expect.objectContaining({
      transactionType: FinancialTransactionType.WALLET_CREDIT,
      direction: FinancialDirection.DEBIT,
      amount: 120,
      sourceType: "WalletTransaction",
      sourceId: "wt-1",
      studentId: "stu-1",
      paymentId: "pay-1",
    }));
  });

  it("uses default description when none is provided", async () => {
    await recordWalletCredit(TX, ORG, { sourceId: "wt-2", amount: 50 });

    const call = (appendLedgerEntry as Mock).mock.calls[0][2];
    expect(typeof call.description).toBe("string");
    expect(call.description!.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Wallet Debit
// ---------------------------------------------------------------------------

describe("recordWalletDebit", () => {
  it("appends WALLET_DEBIT DEBIT entry (cash paid out from wallet)", async () => {
    await recordWalletDebit(TX, ORG, {
      sourceId: "wt-3",
      amount: 75,
      studentId: "stu-1",
      description: "Reembolso de saldo",
      actorId: "user-1",
    });

    expect(appendLedgerEntry).toHaveBeenCalledWith(TX, ORG, expect.objectContaining({
      transactionType: FinancialTransactionType.WALLET_DEBIT,
      direction: FinancialDirection.DEBIT,
      amount: 75,
      sourceType: "WalletTransaction",
      sourceId: "wt-3",
      studentId: "stu-1",
    }));
  });

  it("uses default description when none is provided", async () => {
    await recordWalletDebit(TX, ORG, { sourceId: "wt-4", amount: 30 });

    const call = (appendLedgerEntry as Mock).mock.calls[0][2];
    expect(typeof call.description).toBe("string");
    expect(call.description!.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Refund Disbursed — CASH_RETURN
// ---------------------------------------------------------------------------

describe("recordRefundDisbursed (CASH_RETURN)", () => {
  it("appends REFUND_DISBURSED DEBIT entry with refund cross-reference", async () => {
    await recordRefundDisbursed(TX, ORG, {
      refundId: "ref-1",
      refundNumber: "REF-000001",
      amount: 200,
      refundMethod: "CASH_RETURN",
      paymentId: "pay-1",
      studentId: "stu-1",
      actorId: "user-1",
    });

    expect(appendLedgerEntry).toHaveBeenCalledWith(TX, ORG, expect.objectContaining({
      transactionType: FinancialTransactionType.REFUND_DISBURSED,
      direction: FinancialDirection.DEBIT,
      amount: 200,
      sourceType: "Refund",
      sourceId: "ref-1",
      refundId: "ref-1",
      paymentId: "pay-1",
      studentId: "stu-1",
    }));
  });

  it("description mentions the refund number and cash return method", async () => {
    await recordRefundDisbursed(TX, ORG, {
      refundId: "ref-1",
      refundNumber: "REF-000001",
      amount: 200,
      refundMethod: "CASH_RETURN",
    });

    const call = (appendLedgerEntry as Mock).mock.calls[0][2];
    expect(call.description).toContain("REF-000001");
    expect(call.description).toContain("numerário");
  });
});

// ---------------------------------------------------------------------------
// Refund Disbursed — WALLET_CREDIT
// ---------------------------------------------------------------------------

describe("recordRefundDisbursed (WALLET_CREDIT)", () => {
  it("still uses DEBIT direction and mentions wallet in description", async () => {
    await recordRefundDisbursed(TX, ORG, {
      refundId: "ref-2",
      refundNumber: "REF-000002",
      amount: 150,
      refundMethod: "WALLET_CREDIT",
      paymentId: "pay-2",
      studentId: "stu-2",
      actorId: "user-1",
    });

    const call = (appendLedgerEntry as Mock).mock.calls[0][2];
    expect(call.transactionType).toBe(FinancialTransactionType.REFUND_DISBURSED);
    expect(call.direction).toBe(FinancialDirection.DEBIT);
    expect(call.description).toContain("carteira");
    expect(call.description).toContain("REF-000002");
  });
});

// ---------------------------------------------------------------------------
// Receipt Issued
// ---------------------------------------------------------------------------

describe("recordReceiptIssued", () => {
  it("appends RECEIPT_ISSUED CREDIT entry with receipt cross-reference", async () => {
    await recordReceiptIssued(TX, ORG, {
      receiptId: "rec-1",
      receiptNumber: "REC-000001",
      amount: 300,
      paymentId: "pay-1",
      invoiceId: "inv-1",
      studentId: "stu-1",
      actorId: "user-1",
    });

    expect(appendLedgerEntry).toHaveBeenCalledWith(TX, ORG, expect.objectContaining({
      transactionType: FinancialTransactionType.RECEIPT_ISSUED,
      direction: FinancialDirection.CREDIT,
      amount: 300,
      sourceType: "Receipt",
      sourceId: "rec-1",
      receiptId: "rec-1",
      paymentId: "pay-1",
      invoiceId: "inv-1",
      studentId: "stu-1",
    }));
  });

  it("description mentions the receipt number", async () => {
    await recordReceiptIssued(TX, ORG, {
      receiptId: "rec-1",
      receiptNumber: "REC-000001",
      amount: 300,
    });

    const call = (appendLedgerEntry as Mock).mock.calls[0][2];
    expect(call.description).toContain("REC-000001");
  });
});

// ---------------------------------------------------------------------------
// Direction contract: CREDIT vs DEBIT sanity
// ---------------------------------------------------------------------------

describe("Direction contract", () => {
  it("all INFLOW events use CREDIT direction", async () => {
    await recordInvoiceCreated(TX, ORG, { invoiceId: "i1", invoiceNumber: "FAT-1", amount: 1 });
    await recordPaymentReceived(TX, ORG, { paymentId: "p1", paymentNumber: "PAG-1", amount: 1 });
    await recordCreditApplied(TX, ORG, { sourceId: "ca1", amount: 1 });
    await recordReceiptIssued(TX, ORG, { receiptId: "r1", receiptNumber: "REC-1", amount: 1 });

    const calls = (appendLedgerEntry as Mock).mock.calls;
    for (const [, , entry] of calls) {
      expect(entry.direction).toBe(FinancialDirection.CREDIT);
    }
  });

  it("all OUTFLOW events use DEBIT direction", async () => {
    await recordInvoiceCancelled(TX, ORG, { invoiceId: "i1", invoiceNumber: "FAT-1", amount: 1 });
    await recordPaymentCancelled(TX, ORG, { paymentId: "p1", paymentNumber: "PAG-1", amount: 1 });
    await recordWalletCredit(TX, ORG, { sourceId: "wt1", amount: 1 });
    await recordWalletDebit(TX, ORG, { sourceId: "wt2", amount: 1 });
    await recordRefundDisbursed(TX, ORG, { refundId: "rf1", refundNumber: "REF-1", amount: 1, refundMethod: "CASH_RETURN" });

    const calls = (appendLedgerEntry as Mock).mock.calls;
    for (const [, , entry] of calls) {
      expect(entry.direction).toBe(FinancialDirection.DEBIT);
    }
  });
});

// ---------------------------------------------------------------------------
// appendLedgerEntry receives correct organizationId
// ---------------------------------------------------------------------------

describe("Tenant isolation", () => {
  it("passes organizationId verbatim to appendLedgerEntry", async () => {
    await recordPaymentReceived(TX, "org-xyz", {
      paymentId: "pay-1",
      paymentNumber: "PAG-1",
      amount: 100,
    });

    expect(appendLedgerEntry).toHaveBeenCalledWith(TX, "org-xyz", expect.anything());
  });
});

// ---------------------------------------------------------------------------
// Amount validation: always uses the exact amount provided
// ---------------------------------------------------------------------------

describe("Amount passthrough", () => {
  it("passes the exact amount to the ledger without rounding", async () => {
    await recordPaymentReceived(TX, ORG, {
      paymentId: "pay-1",
      paymentNumber: "PAG-1",
      amount: 123.45,
    });

    const call = (appendLedgerEntry as Mock).mock.calls[0][2];
    expect(call.amount).toBe(123.45);
  });
});
