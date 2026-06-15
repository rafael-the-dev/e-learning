/**
 * integrity-checks.service.test.ts
 *
 * Unit tests for all 8 integrity check categories.
 * The database is fully mocked — tests exercise the detection logic only,
 * not persistence or the job orchestration layer.
 *
 * Pattern:
 *  - Happy path: clean data → empty issues array
 *  - Issue path: data violating the invariant → correct DetectedIssue fields
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Mock } from "vitest";

// ---------------------------------------------------------------------------
// Module mocks — must be hoisted before imports
// ---------------------------------------------------------------------------

vi.mock("@/server/db", () => ({
  getDb: vi.fn(),
}));

import {
  checkInvoiceBalances,
  checkInstallmentBalances,
  checkPaymentAllocations,
  checkWalletBalances,
  checkRefundTotals,
  checkReceiptIntegrity,
  checkOrphanRecords,
  checkLedgerConsistency,
  ALL_CHECKS,
} from "../services/integrity-checks.service";
import { getDb } from "@/server/db";
import { IntegrityIssueSeverity, IntegrityIssueCategory } from "@/shared/types/common";

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

const ORG = "org-1";

/** Creates a mock db with a typed $queryRaw that returns the provided rows. */
function makeDb(queryRawReturn: unknown = []) {
  return {
    $queryRaw: vi.fn().mockResolvedValue(queryRawReturn),
  } as unknown as Awaited<ReturnType<typeof getDb>>;
}

/** Builds a db whose $queryRaw returns different values per successive call. */
function makeDbMulti(...returnValues: unknown[]) {
  const mock = vi.fn();
  for (const v of returnValues) {
    mock.mockResolvedValueOnce(v);
  }
  return { $queryRaw: mock } as unknown as Awaited<ReturnType<typeof getDb>>;
}

beforeEach(() => vi.clearAllMocks());

// ===========================================================================
// 1. INVOICE_BALANCE
// ===========================================================================

describe("checkInvoiceBalances", () => {
  it("returns no issues when all invoice balances are correct", async () => {
    const db = makeDb([
      {
        id: "inv-1",
        invoiceNumber: "FAT-000001",
        subtotal: 500,
        discountAmount: 0,
        taxAmount: 0,
        totalAmount: 500,
        paidAmount: 500,
        balanceAmount: 0,
        status: "PAID",
      },
    ]);
    const issues = await checkInvoiceBalances(db, ORG);
    expect(issues).toHaveLength(0);
  });

  it("detects CRITICAL balance_amounts when paidAmount + balanceAmount ≠ totalAmount", async () => {
    const db = makeDb([
      {
        id: "inv-1",
        invoiceNumber: "FAT-000001",
        subtotal: 500,
        discountAmount: 0,
        taxAmount: 0,
        totalAmount: 500,
        paidAmount: 300,
        balanceAmount: 150, // 300 + 150 = 450 ≠ 500
        status: "PARTIALLY_PAID",
      },
    ]);
    const issues = await checkInvoiceBalances(db, ORG);
    const issue = issues.find((i) => i.checkName === "invoice.balance_amounts");
    expect(issue).toBeDefined();
    expect(issue!.severity).toBe(IntegrityIssueSeverity.CRITICAL);
    expect(issue!.category).toBe(IntegrityIssueCategory.INVOICE_BALANCE);
    expect(issue!.entityId).toBe("inv-1");
    expect(issue!.expectedValue).toBe("500.00");
    expect(issue!.actualValue).toBe("450.00");
  });

  it("detects HIGH total_formula when totalAmount ≠ subtotal − discount + tax", async () => {
    const db = makeDb([
      {
        id: "inv-2",
        invoiceNumber: "FAT-000002",
        subtotal: 600,
        discountAmount: 50,
        taxAmount: 0,
        totalAmount: 500, // correct would be 550
        paidAmount: 500,
        balanceAmount: 0,
        status: "PAID",
      },
    ]);
    const issues = await checkInvoiceBalances(db, ORG);
    const issue = issues.find((i) => i.checkName === "invoice.total_formula");
    expect(issue).toBeDefined();
    expect(issue!.severity).toBe(IntegrityIssueSeverity.HIGH);
    expect(issue!.expectedValue).toBe("550.00");
    expect(issue!.actualValue).toBe("500.00");
  });

  it("detects HIGH status_paid_but_balance for PAID invoice with positive balance", async () => {
    const db = makeDb([
      {
        id: "inv-3",
        invoiceNumber: "FAT-000003",
        subtotal: 200,
        discountAmount: 0,
        taxAmount: 0,
        totalAmount: 200,
        paidAmount: 150,
        balanceAmount: 50,
        status: "PAID", // should not be PAID
      },
    ]);
    const issues = await checkInvoiceBalances(db, ORG);
    const issue = issues.find((i) => i.checkName === "invoice.status_paid_but_balance");
    expect(issue).toBeDefined();
    expect(issue!.severity).toBe(IntegrityIssueSeverity.HIGH);
  });

  it("detects MEDIUM status_should_be_paid when balance=0 but status≠PAID", async () => {
    const db = makeDb([
      {
        id: "inv-4",
        invoiceNumber: "FAT-000004",
        subtotal: 100,
        discountAmount: 0,
        taxAmount: 0,
        totalAmount: 100,
        paidAmount: 100,
        balanceAmount: 0,
        status: "PARTIALLY_PAID", // wrong
      },
    ]);
    const issues = await checkInvoiceBalances(db, ORG);
    const issue = issues.find((i) => i.checkName === "invoice.status_should_be_paid");
    expect(issue).toBeDefined();
    expect(issue!.severity).toBe(IntegrityIssueSeverity.MEDIUM);
    expect(issue!.expectedValue).toBe("PAID");
    expect(issue!.actualValue).toBe("PARTIALLY_PAID");
  });

  it("skips status checks for CANCELLED invoices", async () => {
    const db = makeDb([
      {
        id: "inv-5",
        invoiceNumber: "FAT-000005",
        subtotal: 100,
        discountAmount: 0,
        taxAmount: 0,
        totalAmount: 100,
        paidAmount: 0,
        balanceAmount: 0, // 0+0 ≠ 100 → triggers balance_amounts but NOT status checks
        status: "CANCELLED",
      },
    ]);
    const issues = await checkInvoiceBalances(db, ORG);
    const statusIssues = issues.filter(
      (i) =>
        i.checkName === "invoice.status_paid_but_balance" ||
        i.checkName === "invoice.status_should_be_paid"
    );
    expect(statusIssues).toHaveLength(0);
  });
});

// ===========================================================================
// 2. INSTALLMENT_BALANCE
// ===========================================================================

describe("checkInstallmentBalances", () => {
  it("returns no issues for correct installment data", async () => {
    const db = makeDbMulti(
      [], // plan sum check: no mismatches
      []  // individual balance check: no mismatches
    );
    const issues = await checkInstallmentBalances(db, ORG);
    expect(issues).toHaveLength(0);
  });

  it("detects HIGH payment_plan.installment_sum when sum ≠ plan total", async () => {
    const db = makeDbMulti(
      [{ planId: "pp-1", planTotal: 1200, installmentSum: 1100 }],
      []
    );
    const issues = await checkInstallmentBalances(db, ORG);
    const issue = issues.find((i) => i.checkName === "payment_plan.installment_sum");
    expect(issue).toBeDefined();
    expect(issue!.severity).toBe(IntegrityIssueSeverity.HIGH);
    expect(issue!.entityType).toBe("PaymentPlan");
    expect(issue!.entityId).toBe("pp-1");
    expect(issue!.expectedValue).toBe("1200.00");
    expect(issue!.actualValue).toBe("1100.00");
  });

  it("detects CRITICAL installment.balance_amounts when paid + balance ≠ amount", async () => {
    const db = makeDbMulti(
      [],
      [{ id: "inst-1", installmentNumber: 2, amount: 400, paidAmount: 100, balanceAmount: 200 }]
    );
    const issues = await checkInstallmentBalances(db, ORG);
    const issue = issues.find((i) => i.checkName === "installment.balance_amounts");
    expect(issue).toBeDefined();
    expect(issue!.severity).toBe(IntegrityIssueSeverity.CRITICAL);
    expect(issue!.entityType).toBe("Installment");
    expect(issue!.entityId).toBe("inst-1");
    expect(issue!.expectedValue).toBe("400.00");
    expect(issue!.actualValue).toBe("300.00");
  });
});

// ===========================================================================
// 3. PAYMENT_ALLOCATION
// ===========================================================================

describe("checkPaymentAllocations", () => {
  it("returns no issues for correct payment data", async () => {
    const db = makeDbMulti([], [], []);
    const issues = await checkPaymentAllocations(db, ORG);
    expect(issues).toHaveLength(0);
  });

  it("detects CRITICAL payment.split_sum when splits don't add up to totalAmount", async () => {
    const db = makeDbMulti(
      [{ paymentId: "pay-1", paymentNumber: "PAG-000001", total: 500, splitSum: 450 }],
      [],
      []
    );
    const issues = await checkPaymentAllocations(db, ORG);
    const issue = issues.find((i) => i.checkName === "payment.split_sum");
    expect(issue).toBeDefined();
    expect(issue!.severity).toBe(IntegrityIssueSeverity.CRITICAL);
    expect(issue!.entityId).toBe("pay-1");
    expect(issue!.expectedValue).toBe("500.00");
    expect(issue!.actualValue).toBe("450.00");
  });

  it("detects HIGH payment.allocation_sum when allocations don't add up", async () => {
    const db = makeDbMulti(
      [],
      [{ paymentId: "pay-2", paymentNumber: "PAG-000002", total: 300, allocSum: 280 }],
      []
    );
    const issues = await checkPaymentAllocations(db, ORG);
    const issue = issues.find((i) => i.checkName === "payment.allocation_sum");
    expect(issue).toBeDefined();
    expect(issue!.severity).toBe(IntegrityIssueSeverity.HIGH);
    expect(issue!.entityId).toBe("pay-2");
  });

  it("detects MEDIUM payment_allocation.cancelled_invoice for orphan allocation", async () => {
    const db = makeDbMulti(
      [],
      [],
      [{ id: "pa-1", invoiceId: "inv-cancelled" }]
    );
    const issues = await checkPaymentAllocations(db, ORG);
    const issue = issues.find((i) => i.checkName === "payment_allocation.cancelled_invoice");
    expect(issue).toBeDefined();
    expect(issue!.severity).toBe(IntegrityIssueSeverity.MEDIUM);
    expect(issue!.entityType).toBe("PaymentAllocation");
    expect(issue!.entityId).toBe("pa-1");
  });
});

// ===========================================================================
// 4. WALLET_BALANCE
// ===========================================================================

describe("checkWalletBalances", () => {
  it("returns no issues when wallet balance is non-negative", async () => {
    const db = makeDbMulti([], []);
    const issues = await checkWalletBalances(db, ORG);
    expect(issues).toHaveLength(0);
  });

  it("detects CRITICAL wallet.negative_balance when SUM(transactions) < 0", async () => {
    const db = makeDbMulti(
      [{ walletId: "sw-1", studentId: "stu-1", computedBalance: -50.5 }],
      []
    );
    const issues = await checkWalletBalances(db, ORG);
    const issue = issues.find((i) => i.checkName === "wallet.negative_balance");
    expect(issue).toBeDefined();
    expect(issue!.severity).toBe(IntegrityIssueSeverity.CRITICAL);
    expect(issue!.entityType).toBe("StudentWallet");
    expect(issue!.entityId).toBe("sw-1");
    expect(issue!.actualValue).toBe("-50.50");
    expect(issue!.expectedValue).toBe("≥ 0.00");
  });

  it("detects HIGH credit_application.allocation_mismatch", async () => {
    const db = makeDbMulti(
      [],
      [{ caId: "ca-1", caAmount: 100, allocSum: 80 }]
    );
    const issues = await checkWalletBalances(db, ORG);
    const issue = issues.find((i) => i.checkName === "credit_application.allocation_mismatch");
    expect(issue).toBeDefined();
    expect(issue!.severity).toBe(IntegrityIssueSeverity.HIGH);
    expect(issue!.entityType).toBe("CreditApplication");
    expect(issue!.expectedValue).toBe("100.00");
    expect(issue!.actualValue).toBe("80.00");
  });
});

// ===========================================================================
// 5. REFUND_TOTAL
// ===========================================================================

describe("checkRefundTotals", () => {
  it("returns no issues when refunds are within payment total", async () => {
    const db = makeDbMulti([], []);
    const issues = await checkRefundTotals(db, ORG);
    expect(issues).toHaveLength(0);
  });

  it("detects CRITICAL refund.exceeds_payment when total refund > payment", async () => {
    const db = makeDbMulti(
      [{ paymentId: "pay-1", paymentNumber: "PAG-000001", total: 300, refundSum: 350 }],
      []
    );
    const issues = await checkRefundTotals(db, ORG);
    const issue = issues.find((i) => i.checkName === "refund.exceeds_payment");
    expect(issue).toBeDefined();
    expect(issue!.severity).toBe(IntegrityIssueSeverity.CRITICAL);
    expect(issue!.entityType).toBe("Payment");
    expect(issue!.entityId).toBe("pay-1");
    expect(issue!.expectedValue).toBe("≤ 300.00");
    expect(issue!.actualValue).toBe("350.00");
  });

  it("detects HIGH receipt.refunded_amount_mismatch", async () => {
    const db = makeDbMulti(
      [],
      [{ receiptId: "rec-1", receiptNumber: "REC-000001", receiptRefunded: 100, actualRefundSum: 200 }]
    );
    const issues = await checkRefundTotals(db, ORG);
    const issue = issues.find((i) => i.checkName === "receipt.refunded_amount_mismatch");
    expect(issue).toBeDefined();
    expect(issue!.severity).toBe(IntegrityIssueSeverity.HIGH);
    expect(issue!.entityType).toBe("Receipt");
    expect(issue!.expectedValue).toBe("200.00");
    expect(issue!.actualValue).toBe("100.00");
  });
});

// ===========================================================================
// 6. RECEIPT_INTEGRITY
// ===========================================================================

describe("checkReceiptIntegrity", () => {
  it("returns no issues for correct receipts", async () => {
    const db = makeDbMulti([], []);
    const issues = await checkReceiptIntegrity(db, ORG);
    expect(issues).toHaveLength(0);
  });

  it("detects HIGH receipt.amount_mismatch when receipt amount ≠ payment total", async () => {
    const db = makeDbMulti(
      [{ receiptId: "rec-1", receiptNumber: "REC-000001", receiptAmount: 300, paymentTotal: 350 }],
      []
    );
    const issues = await checkReceiptIntegrity(db, ORG);
    const issue = issues.find((i) => i.checkName === "receipt.amount_mismatch");
    expect(issue).toBeDefined();
    expect(issue!.severity).toBe(IntegrityIssueSeverity.HIGH);
    expect(issue!.expectedValue).toBe("350.00");
    expect(issue!.actualValue).toBe("300.00");
  });

  it("detects HIGH receipt.status_should_be_cancelled when fully refunded but status≠CANCELLED", async () => {
    const db = makeDbMulti(
      [],
      [{ receiptId: "rec-2", receiptNumber: "REC-000002", amount: 200, refundedAmount: 200, status: "ISSUED" }]
    );
    const issues = await checkReceiptIntegrity(db, ORG);
    const issue = issues.find((i) => i.checkName === "receipt.status_should_be_cancelled");
    expect(issue).toBeDefined();
    expect(issue!.severity).toBe(IntegrityIssueSeverity.HIGH);
    expect(issue!.expectedValue).toBe("CANCELLED");
    expect(issue!.actualValue).toBe("ISSUED");
  });

  it("detects MEDIUM receipt.status_should_be_partially_refunded when partial refund but status=ISSUED", async () => {
    const db = makeDbMulti(
      [],
      [{ receiptId: "rec-3", receiptNumber: "REC-000003", amount: 400, refundedAmount: 100, status: "ISSUED" }]
    );
    const issues = await checkReceiptIntegrity(db, ORG);
    const issue = issues.find((i) => i.checkName === "receipt.status_should_be_partially_refunded");
    expect(issue).toBeDefined();
    expect(issue!.severity).toBe(IntegrityIssueSeverity.MEDIUM);
    expect(issue!.expectedValue).toBe("PARTIALLY_REFUNDED");
    expect(issue!.actualValue).toBe("ISSUED");
  });

  it("does not flag PARTIALLY_REFUNDED status when partially refunded", async () => {
    const db = makeDbMulti(
      [],
      [{ receiptId: "rec-4", receiptNumber: "REC-000004", amount: 400, refundedAmount: 100, status: "PARTIALLY_REFUNDED" }]
    );
    const issues = await checkReceiptIntegrity(db, ORG);
    expect(issues.filter((i) => i.entityId === "rec-4")).toHaveLength(0);
  });
});

// ===========================================================================
// 7. ORPHAN_RECORD
// ===========================================================================

describe("checkOrphanRecords", () => {
  it("returns no issues when all records have valid parents", async () => {
    const db = makeDbMulti([], [], []);
    const issues = await checkOrphanRecords(db, ORG);
    expect(issues).toHaveLength(0);
  });

  it("detects HIGH refund.cancelled_payment for refund on cancelled payment", async () => {
    const db = makeDbMulti(
      [{ id: "ref-1", refundNumber: "REF-000001", paymentId: "pay-cancelled" }],
      [],
      []
    );
    const issues = await checkOrphanRecords(db, ORG);
    const issue = issues.find((i) => i.checkName === "refund.cancelled_payment");
    expect(issue).toBeDefined();
    expect(issue!.severity).toBe(IntegrityIssueSeverity.HIGH);
    expect(issue!.entityType).toBe("Refund");
    expect(issue!.entityId).toBe("ref-1");
  });

  it("detects MEDIUM credit_application.cancelled_invoice for credit on cancelled invoice", async () => {
    const db = makeDbMulti(
      [],
      [{ id: "ca-1", invoiceId: "inv-cancelled" }],
      []
    );
    const issues = await checkOrphanRecords(db, ORG);
    const issue = issues.find((i) => i.checkName === "credit_application.cancelled_invoice");
    expect(issue).toBeDefined();
    expect(issue!.severity).toBe(IntegrityIssueSeverity.MEDIUM);
    expect(issue!.entityType).toBe("CreditApplication");
  });

  it("detects CRITICAL wallet_transaction.missing_wallet for orphan transactions", async () => {
    const db = makeDbMulti(
      [],
      [],
      [{ id: "wt-orphan" }]
    );
    const issues = await checkOrphanRecords(db, ORG);
    const issue = issues.find((i) => i.checkName === "wallet_transaction.missing_wallet");
    expect(issue).toBeDefined();
    expect(issue!.severity).toBe(IntegrityIssueSeverity.CRITICAL);
    expect(issue!.entityType).toBe("StudentWalletTransaction");
  });
});

// ===========================================================================
// 8. LEDGER_CONSISTENCY
// ===========================================================================

describe("checkLedgerConsistency", () => {
  it("returns no issues for a clean ledger", async () => {
    const db = makeDbMulti(
      [], // no duplicates
      [   // direction rows — all correct
        { id: "txn-1", transactionNumber: "TXN-000001", transactionType: "INVOICE_CREATED",  direction: "CREDIT" },
        { id: "txn-2", transactionNumber: "TXN-000002", transactionType: "PAYMENT_RECEIVED", direction: "CREDIT" },
        { id: "txn-3", transactionNumber: "TXN-000003", transactionType: "REFUND_DISBURSED", direction: "DEBIT"  },
      ],
      []  // no zero/negative amounts
    );
    const issues = await checkLedgerConsistency(db, ORG);
    expect(issues).toHaveLength(0);
  });

  it("detects HIGH ledger.duplicate_entry when same source+type appears twice", async () => {
    const db = makeDbMulti(
      [{ sourceType: "Invoice", sourceId: "inv-1", transactionType: "INVOICE_CREATED", cnt: 2 }],
      [],
      []
    );
    const issues = await checkLedgerConsistency(db, ORG);
    const issue = issues.find((i) => i.checkName === "ledger.duplicate_entry");
    expect(issue).toBeDefined();
    expect(issue!.severity).toBe(IntegrityIssueSeverity.HIGH);
    expect(issue!.category).toBe(IntegrityIssueCategory.LEDGER_CONSISTENCY);
    expect(issue!.expectedValue).toBe("1");
    expect(issue!.actualValue).toBe("2");
  });

  it("detects CRITICAL ledger.wrong_direction when direction contradicts expected", async () => {
    const db = makeDbMulti(
      [],
      [
        // PAYMENT_RECEIVED should be CREDIT but is DEBIT
        { id: "txn-bad", transactionNumber: "TXN-000099", transactionType: "PAYMENT_RECEIVED", direction: "DEBIT" },
      ],
      []
    );
    const issues = await checkLedgerConsistency(db, ORG);
    const issue = issues.find((i) => i.checkName === "ledger.wrong_direction");
    expect(issue).toBeDefined();
    expect(issue!.severity).toBe(IntegrityIssueSeverity.CRITICAL);
    expect(issue!.expectedValue).toBe("CREDIT");
    expect(issue!.actualValue).toBe("DEBIT");
  });

  it("detects CRITICAL ledger.non_positive_amount for zero-amount entries", async () => {
    const db = makeDbMulti(
      [],
      [],
      [{ id: "txn-zero", transactionNumber: "TXN-000098", amount: 0 }]
    );
    const issues = await checkLedgerConsistency(db, ORG);
    const issue = issues.find((i) => i.checkName === "ledger.non_positive_amount");
    expect(issue).toBeDefined();
    expect(issue!.severity).toBe(IntegrityIssueSeverity.CRITICAL);
    expect(issue!.expectedValue).toBe("> 0");
    expect(issue!.actualValue).toBe("0.00");
  });

  it("detects CRITICAL ledger.non_positive_amount for negative-amount entries", async () => {
    const db = makeDbMulti(
      [],
      [],
      [{ id: "txn-neg", transactionNumber: "TXN-000097", amount: -100 }]
    );
    const issues = await checkLedgerConsistency(db, ORG);
    const issue = issues.find((i) => i.checkName === "ledger.non_positive_amount");
    expect(issue).toBeDefined();
    expect(issue!.actualValue).toBe("-100.00");
  });

  it("handles bigint cnt from SQL Server COUNT(*)", async () => {
    const db = makeDbMulti(
      [{ sourceType: "Payment", sourceId: "pay-1", transactionType: "PAYMENT_RECEIVED", cnt: BigInt(3) }],
      [],
      []
    );
    const issues = await checkLedgerConsistency(db, ORG);
    const issue = issues.find((i) => i.checkName === "ledger.duplicate_entry");
    expect(issue).toBeDefined();
    expect(issue!.actualValue).toBe("3");
  });

  it("ignores unknown transactionType in direction check", async () => {
    const db = makeDbMulti(
      [],
      [{ id: "txn-unk", transactionNumber: "TXN-999", transactionType: "UNKNOWN_TYPE", direction: "CREDIT" }],
      []
    );
    const issues = await checkLedgerConsistency(db, ORG);
    expect(issues.filter((i) => i.checkName === "ledger.wrong_direction")).toHaveLength(0);
  });
});

// ===========================================================================
// ALL_CHECKS registry
// ===========================================================================

describe("ALL_CHECKS registry", () => {
  it("exports exactly 8 check entries", () => {
    expect(ALL_CHECKS).toHaveLength(8);
  });

  it("covers all IntegrityIssueCategory values", () => {
    const covered = new Set(ALL_CHECKS.map((c) => c.category));
    const all = Object.values(IntegrityIssueCategory);
    expect(covered.size).toBe(all.length);
    for (const cat of all) {
      expect(covered.has(cat as never)).toBe(true);
    }
  });

  it("each entry has a callable run function", () => {
    for (const entry of ALL_CHECKS) {
      expect(typeof entry.run).toBe("function");
    }
  });
});

// ===========================================================================
// Cross-cutting: epsilon tolerance
// ===========================================================================

describe("Epsilon tolerance", () => {
  it("does not flag invoice balance with difference < 0.01", async () => {
    const db = makeDb([
      {
        id: "inv-eps",
        invoiceNumber: "FAT-EPS",
        subtotal: 100,
        discountAmount: 0,
        taxAmount: 0,
        totalAmount: 100,
        paidAmount: 99.999, // difference = 0.001 < epsilon
        balanceAmount: 0,
        status: "PAID",
      },
    ]);
    const issues = await checkInvoiceBalances(db, ORG);
    const balIssue = issues.find((i) => i.checkName === "invoice.balance_amounts");
    expect(balIssue).toBeUndefined();
  });
});
