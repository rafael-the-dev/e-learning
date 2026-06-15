import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  calculateInstallmentStatus,
  recalculateInstallmentAfterPaymentCancellation,
} from "../services/installment-recalculation.service";

// =============================================================================
// Helpers
// =============================================================================

const PAST = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000); // 7 days ago
const FUTURE = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days from now

type InstallmentRow = {
  amount: number;
  paidAmount: number;
  balanceAmount: number;
  status: string;
  dueDate: Date;
};

function d(n: number) {
  return { toNumber: () => n };
}

function makeTx(row: InstallmentRow | null = null) {
  return {
    installment: {
      findFirst: vi.fn().mockResolvedValue(
        row
          ? {
              amount: d(row.amount),
              paidAmount: d(row.paidAmount),
              balanceAmount: d(row.balanceAmount),
              status: row.status,
              dueDate: row.dueDate,
            }
          : null
      ),
      update: vi.fn().mockResolvedValue({}),
    },
  };
}

// =============================================================================
// calculateInstallmentStatus
// =============================================================================

describe("calculateInstallmentStatus", () => {
  it("returns PAID when balance is zero", () => {
    expect(calculateInstallmentStatus(500, 500, FUTURE)).toBe("PAID");
  });

  it("returns PAID when paidAmount exceeds amount (guard against float drift)", () => {
    expect(calculateInstallmentStatus(500, 500.01, FUTURE)).toBe("PAID");
  });

  it("returns PARTIALLY_PAID when some balance remains and some was paid", () => {
    expect(calculateInstallmentStatus(500, 200, FUTURE)).toBe("PARTIALLY_PAID");
  });

  it("returns PARTIALLY_PAID even when dueDate is past", () => {
    expect(calculateInstallmentStatus(500, 200, PAST)).toBe("PARTIALLY_PAID");
  });

  it("returns OVERDUE when nothing paid and dueDate is past", () => {
    expect(calculateInstallmentStatus(500, 0, PAST)).toBe("OVERDUE");
  });

  it("returns PENDING when nothing paid and dueDate is in the future", () => {
    expect(calculateInstallmentStatus(500, 0, FUTURE)).toBe("PENDING");
  });
});

// =============================================================================
// recalculateInstallmentAfterPaymentCancellation
// =============================================================================

describe("recalculateInstallmentAfterPaymentCancellation", () => {
  // ── Test 1: Full installment payment cancellation ───────────────────────────

  it("fully cancels a fully-paid installment: paidAmount → 0, status PENDING", async () => {
    const tx = makeTx({ amount: 500, paidAmount: 500, balanceAmount: 0, status: "PAID", dueDate: FUTURE });

    const result = await recalculateInstallmentAfterPaymentCancellation(
      tx as any,
      "inst-1",
      "org-1",
      500 // PAYMENT-type allocs sum = full payment
    );

    expect(result).not.toBeNull();
    expect(result!.newPaidAmount).toBe(0);
    expect(result!.newBalanceAmount).toBe(500);
    expect(result!.newStatus).toBe("PENDING");
    expect(tx.installment.update).toHaveBeenCalledWith({
      where: { id: "inst-1" },
      data: { paidAmount: 0, balanceAmount: 500, status: "PENDING" },
    });
  });

  // ── Test 2: Partial installment payment cancellation ────────────────────────

  it("cancels a partial payment: restores installment to unpaid state", async () => {
    const tx = makeTx({ amount: 500, paidAmount: 200, balanceAmount: 300, status: "PARTIALLY_PAID", dueDate: FUTURE });

    const result = await recalculateInstallmentAfterPaymentCancellation(tx as any, "inst-1", "org-1", 200);

    expect(result!.newPaidAmount).toBe(0);
    expect(result!.newBalanceAmount).toBe(500);
    expect(result!.newStatus).toBe("PENDING");
  });

  // ── Test 3: Multiple payments — cancel one, other remains ───────────────────

  it("cancelling one payment leaves the other payment's contribution intact", async () => {
    // installment.paidAmount = 500 (300 from payment A + 200 from payment B)
    // Cancelling payment A (reversalAmount = 300)
    const tx = makeTx({ amount: 500, paidAmount: 500, balanceAmount: 0, status: "PAID", dueDate: FUTURE });

    const result = await recalculateInstallmentAfterPaymentCancellation(tx as any, "inst-1", "org-1", 300);

    expect(result!.newPaidAmount).toBe(200); // payment B's contribution remains
    expect(result!.newBalanceAmount).toBe(300);
    expect(result!.newStatus).toBe("PARTIALLY_PAID");
  });

  // ── Test 4: Overpayment — installment reversal uses only new-money amount ───

  it("only reverses new-money portion, not overpayment credited to wallet", async () => {
    // Payment total = 700, installment amount = 500, overpayment = 200 (→ wallet)
    // ConfirmPaymentCommand credits installment.paidAmount with totalNewMoneyApplied = 500
    // PAYMENT-type allocs sum = 500 (not 700)
    const tx = makeTx({ amount: 500, paidAmount: 500, balanceAmount: 0, status: "PAID", dueDate: FUTURE });

    const result = await recalculateInstallmentAfterPaymentCancellation(
      tx as any,
      "inst-1",
      "org-1",
      500 // only the 500 applied to the invoice, not the 200 overpayment
    );

    expect(result!.newPaidAmount).toBe(0);
    expect(result!.newBalanceAmount).toBe(500);
    expect(result!.newStatus).toBe("PENDING");
  });

  // ── Test 5: Cancel payment on overdue installment ───────────────────────────

  it("restores status to OVERDUE when dueDate is past and balance remains", async () => {
    const tx = makeTx({ amount: 500, paidAmount: 500, balanceAmount: 0, status: "PAID", dueDate: PAST });

    const result = await recalculateInstallmentAfterPaymentCancellation(tx as any, "inst-1", "org-1", 500);

    expect(result!.newPaidAmount).toBe(0);
    expect(result!.newBalanceAmount).toBe(500);
    expect(result!.newStatus).toBe("OVERDUE");
  });

  it("restores status to OVERDUE even for partial payment on overdue installment", async () => {
    const tx = makeTx({ amount: 500, paidAmount: 200, balanceAmount: 300, status: "PARTIALLY_PAID", dueDate: PAST });

    const result = await recalculateInstallmentAfterPaymentCancellation(tx as any, "inst-1", "org-1", 200);

    expect(result!.newStatus).toBe("OVERDUE");
  });

  // ── Test 6: Tenant isolation ────────────────────────────────────────────────

  it("throws when installment is not found in the organisation", async () => {
    const tx = makeTx(null); // findFirst returns null → not found / wrong org

    await expect(
      recalculateInstallmentAfterPaymentCancellation(tx as any, "inst-99", "org-other", 500)
    ).rejects.toThrow("inst-99");
  });

  it("passes organizationId to findFirst for tenant isolation", async () => {
    const tx = makeTx({ amount: 500, paidAmount: 500, balanceAmount: 0, status: "PAID", dueDate: FUTURE });

    await recalculateInstallmentAfterPaymentCancellation(tx as any, "inst-1", "org-abc", 500);

    const findFirstCall = (tx.installment.findFirst as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(findFirstCall.where.organizationId).toBe("org-abc");
    expect(findFirstCall.where.id).toBe("inst-1");
  });

  // ── CANCELLED terminal state ────────────────────────────────────────────────

  it("leaves a CANCELLED installment untouched and returns null", async () => {
    const tx = makeTx({ amount: 500, paidAmount: 0, balanceAmount: 500, status: "CANCELLED", dueDate: FUTURE });

    const result = await recalculateInstallmentAfterPaymentCancellation(tx as any, "inst-1", "org-1", 500);

    expect(result).toBeNull();
    expect(tx.installment.update).not.toHaveBeenCalled();
  });

  // ── Captures old values for audit ───────────────────────────────────────────

  it("returns old values for audit log alongside new values", async () => {
    const tx = makeTx({ amount: 500, paidAmount: 300, balanceAmount: 200, status: "PARTIALLY_PAID", dueDate: FUTURE });

    const result = await recalculateInstallmentAfterPaymentCancellation(tx as any, "inst-1", "org-1", 300);

    expect(result!.oldPaidAmount).toBe(300);
    expect(result!.oldBalanceAmount).toBe(200);
    expect(result!.oldStatus).toBe("PARTIALLY_PAID");
    expect(result!.newPaidAmount).toBe(0);
    expect(result!.newBalanceAmount).toBe(500);
  });

  // ── Guard: paidAmount never goes negative ────────────────────────────────────

  it("clamps newPaidAmount to 0 if reversalAmount exceeds recorded paidAmount", async () => {
    // Defensive: reversal > stored paidAmount shouldn't create negative paidAmount
    const tx = makeTx({ amount: 500, paidAmount: 200, balanceAmount: 300, status: "PARTIALLY_PAID", dueDate: FUTURE });

    const result = await recalculateInstallmentAfterPaymentCancellation(
      tx as any,
      "inst-1",
      "org-1",
      300 // reversal > paidAmount
    );

    expect(result!.newPaidAmount).toBe(0);
    expect(result!.newBalanceAmount).toBe(500);
  });
});
