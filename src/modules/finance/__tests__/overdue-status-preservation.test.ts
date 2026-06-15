import { describe, it, expect } from "vitest";
import {
  computeNewInvoiceStatus,
  computeNewInstallmentStatus,
  computeInvoiceStatusOnReversal,
} from "../utils/status-computation";

// =============================================================================
// computeNewInvoiceStatus — used by ConfirmPaymentCommand
// =============================================================================

describe("computeNewInvoiceStatus — full payment", () => {
  it("returns PAID when newBalance = 0 regardless of current status (test 13)", () => {
    expect(computeNewInvoiceStatus("OVERDUE", 0, 100)).toBe("PAID");
    expect(computeNewInvoiceStatus("PENDING", 0, 100)).toBe("PAID");
    expect(computeNewInvoiceStatus("PARTIALLY_PAID", 0, 100)).toBe("PAID");
  });

  it("returns PAID when newBalance is negative (overpayment edge case)", () => {
    expect(computeNewInvoiceStatus("OVERDUE", -5, 205)).toBe("PAID");
  });
});

describe("computeNewInvoiceStatus — partial payment preserves OVERDUE (test 12)", () => {
  it("preserves OVERDUE when balance remains after partial payment", () => {
    expect(computeNewInvoiceStatus("OVERDUE", 50, 50)).toBe("OVERDUE");
  });

  it("preserves OVERDUE for any remaining balance amount", () => {
    expect(computeNewInvoiceStatus("OVERDUE", 0.01, 99.99)).toBe("OVERDUE");
  });
});

describe("computeNewInvoiceStatus — non-overdue invoice", () => {
  it("returns PARTIALLY_PAID when paid > 0 and balance > 0", () => {
    expect(computeNewInvoiceStatus("PENDING", 50, 50)).toBe("PARTIALLY_PAID");
    expect(computeNewInvoiceStatus("PARTIALLY_PAID", 25, 75)).toBe("PARTIALLY_PAID");
  });

  it("returns PENDING when paid = 0 and balance > 0", () => {
    expect(computeNewInvoiceStatus("PENDING", 100, 0)).toBe("PENDING");
  });
});

// =============================================================================
// computeNewInstallmentStatus — used by ConfirmPaymentCommand
// =============================================================================

describe("computeNewInstallmentStatus — full payment", () => {
  it("returns PAID when newBalance = 0 regardless of current status (test 13)", () => {
    expect(computeNewInstallmentStatus("OVERDUE", 0)).toBe("PAID");
    expect(computeNewInstallmentStatus("PENDING", 0)).toBe("PAID");
    expect(computeNewInstallmentStatus("PARTIALLY_PAID", 0)).toBe("PAID");
  });
});

describe("computeNewInstallmentStatus — partial payment preserves OVERDUE (test 12)", () => {
  it("preserves OVERDUE when balance remains", () => {
    expect(computeNewInstallmentStatus("OVERDUE", 50)).toBe("OVERDUE");
  });

  it("preserves OVERDUE even with tiny balance", () => {
    expect(computeNewInstallmentStatus("OVERDUE", 0.01)).toBe("OVERDUE");
  });
});

describe("computeNewInstallmentStatus — non-overdue installment", () => {
  it("returns PARTIALLY_PAID for PENDING installment with remaining balance", () => {
    expect(computeNewInstallmentStatus("PENDING", 50)).toBe("PARTIALLY_PAID");
  });

  it("returns PARTIALLY_PAID for PARTIALLY_PAID installment with remaining balance", () => {
    expect(computeNewInstallmentStatus("PARTIALLY_PAID", 25)).toBe("PARTIALLY_PAID");
  });
});

// =============================================================================
// computeInvoiceStatusOnReversal — used by CancelPaymentCommand
//
// CancelPaymentCommand reads the current invoice status and dueDate inside the
// DB transaction and passes them here. The function must never silently demote
// an invoice that is legitimately past its due date.
// =============================================================================

const PAST_DATE = new Date(Date.now() - 24 * 60 * 60 * 1000); // yesterday
const FUTURE_DATE = new Date(Date.now() + 24 * 60 * 60 * 1000); // tomorrow

describe("computeInvoiceStatusOnReversal — full reversal (balance becomes 0)", () => {
  it("returns PAID when newBalance = 0 regardless of current status or dueDate", () => {
    expect(computeInvoiceStatusOnReversal("OVERDUE", 0, 200, PAST_DATE)).toBe("PAID");
    expect(computeInvoiceStatusOnReversal("PENDING", 0, 100, null)).toBe("PAID");
    expect(computeInvoiceStatusOnReversal("PARTIALLY_PAID", 0, 50, FUTURE_DATE)).toBe("PAID");
  });

  it("returns PAID for negative balance (overpayment edge case)", () => {
    expect(computeInvoiceStatusOnReversal("OVERDUE", -1, 201, PAST_DATE)).toBe("PAID");
  });
});

describe("computeInvoiceStatusOnReversal — OVERDUE preservation (H1 fix)", () => {
  it("preserves OVERDUE when current status is OVERDUE and balance remains (priority 2)", () => {
    // The invoice was already OVERDUE when the payment was made.
    // Confirm preserved OVERDUE. Now cancel reverses: must stay OVERDUE.
    expect(computeInvoiceStatusOnReversal("OVERDUE", 50, 50, FUTURE_DATE)).toBe("OVERDUE");
    expect(computeInvoiceStatusOnReversal("OVERDUE", 0.01, 99.99, null)).toBe("OVERDUE");
  });

  it("re-derives OVERDUE from dueDate when invoice was not yet OVERDUE but dueDate is past (priority 3)", () => {
    // Scenario: invoice was PENDING → job had not yet run → payment made →
    // payment cancelled → dueDate is now in the past → must be OVERDUE.
    expect(computeInvoiceStatusOnReversal("PARTIALLY_PAID", 50, 50, PAST_DATE)).toBe("OVERDUE");
    expect(computeInvoiceStatusOnReversal("PENDING", 100, 0, PAST_DATE)).toBe("OVERDUE");
  });

  it("does NOT return OVERDUE when dueDate is in the future", () => {
    expect(computeInvoiceStatusOnReversal("PARTIALLY_PAID", 50, 50, FUTURE_DATE)).toBe(
      "PARTIALLY_PAID"
    );
    expect(computeInvoiceStatusOnReversal("PENDING", 100, 0, FUTURE_DATE)).toBe("PENDING");
  });

  it("does NOT return OVERDUE when dueDate is null", () => {
    expect(computeInvoiceStatusOnReversal("PARTIALLY_PAID", 50, 50, null)).toBe("PARTIALLY_PAID");
    expect(computeInvoiceStatusOnReversal("PENDING", 100, 0, null)).toBe("PENDING");
  });
});

describe("computeInvoiceStatusOnReversal — non-overdue paths", () => {
  it("returns PARTIALLY_PAID when paid > 0, balance > 0, and dueDate is in the future", () => {
    expect(computeInvoiceStatusOnReversal("PARTIALLY_PAID", 30, 70, FUTURE_DATE)).toBe(
      "PARTIALLY_PAID"
    );
  });

  it("returns PENDING when paid = 0 and dueDate is in the future", () => {
    expect(computeInvoiceStatusOnReversal("PENDING", 100, 0, FUTURE_DATE)).toBe("PENDING");
  });

  it("returns PENDING when paid = 0 and dueDate is null", () => {
    expect(computeInvoiceStatusOnReversal("PENDING", 100, 0, null)).toBe("PENDING");
  });
});

// =============================================================================
// Spec test coverage cross-reference
// =============================================================================

describe("Spec test coverage", () => {
  it("test 3 — Paid invoice past due remains PAID (filter excludes PAID before job runs)", () => {
    // PAID invoices are excluded by the job's status filter before updateMany.
    // If somehow called, computeNewInvoiceStatus correctly returns PAID when balance=0.
    expect(computeNewInvoiceStatus("PAID", 0, 200)).toBe("PAID");
  });

  it("test 7 — Paid installment past due remains PAID", () => {
    expect(computeNewInstallmentStatus("PAID", 0)).toBe("PAID");
  });

  it("H1 fix — CancelPayment on OVERDUE invoice returns OVERDUE (not PARTIALLY_PAID)", () => {
    // Before H1 fix: status was hardcoded to PARTIALLY_PAID.
    // After fix: computeInvoiceStatusOnReversal is used → OVERDUE is preserved.
    expect(computeInvoiceStatusOnReversal("OVERDUE", 50, 50, FUTURE_DATE)).toBe("OVERDUE");
    expect(computeInvoiceStatusOnReversal("OVERDUE", 50, 50, PAST_DATE)).toBe("OVERDUE");
    expect(computeInvoiceStatusOnReversal("OVERDUE", 50, 50, null)).toBe("OVERDUE");
  });
});
