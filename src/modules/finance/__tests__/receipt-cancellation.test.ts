import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  cancelReceiptForPayment,
  type ReceiptCancellationResult,
} from "../services/receipt-cancellation.service";

// =============================================================================
// Helpers
// =============================================================================

type ReceiptRow = { id: string; receiptNumber: string; status: string } | null;

function makeTx(row: ReceiptRow = null, updateShouldThrow?: Error) {
  return {
    receipt: {
      findFirst: vi.fn().mockResolvedValue(row),
      update: updateShouldThrow
        ? vi.fn().mockRejectedValue(updateShouldThrow)
        : vi.fn().mockResolvedValue({}),
    },
  };
}

const ISSUED_RECEIPT: ReceiptRow = {
  id: "rec-1",
  receiptNumber: "REC-000001",
  status: "ISSUED",
};

// =============================================================================
// Test 1 — Cancel payment with issued receipt
// =============================================================================

describe("cancelReceiptForPayment — receipt found", () => {
  it("returns a ReceiptCancellationResult with correct identifiers", async () => {
    const tx = makeTx(ISSUED_RECEIPT);

    const result = await cancelReceiptForPayment(tx as any, "pay-1", "org-1", "user-1");

    expect(result).not.toBeNull();
    expect(result!.receiptId).toBe("rec-1");
    expect(result!.receiptNumber).toBe("REC-000001");
    expect(result!.previousStatus).toBe("ISSUED");
    expect(result!.cancelledAt).toBeInstanceOf(Date);
  });

  it("sets status CANCELLED on the receipt row", async () => {
    const tx = makeTx(ISSUED_RECEIPT);

    await cancelReceiptForPayment(tx as any, "pay-1", "org-1", "user-1");

    const updateCall = (tx.receipt.update as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(updateCall.data.status).toBe("CANCELLED");
  });

  it("persists cancelledAt, cancelledBy from the caller", async () => {
    const before = new Date();
    const tx = makeTx(ISSUED_RECEIPT);

    const result = await cancelReceiptForPayment(tx as any, "pay-1", "org-1", "user-42");

    const updateCall = (tx.receipt.update as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(updateCall.data.cancelledBy).toBe("user-42");
    expect(updateCall.data.cancelledAt).toBeInstanceOf(Date);
    expect(updateCall.data.cancelledAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
    expect(result!.cancelledAt).toEqual(updateCall.data.cancelledAt);
  });

  it("stores cancellationReason when provided", async () => {
    const tx = makeTx(ISSUED_RECEIPT);

    await cancelReceiptForPayment(tx as any, "pay-1", "org-1", "user-1", "Duplicado");

    const updateCall = (tx.receipt.update as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(updateCall.data.cancellationReason).toBe("Duplicado");
  });

  it("stores null cancellationReason when reason is not provided", async () => {
    const tx = makeTx(ISSUED_RECEIPT);

    await cancelReceiptForPayment(tx as any, "pay-1", "org-1", "user-1");

    const updateCall = (tx.receipt.update as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(updateCall.data.cancellationReason).toBeNull();
  });

  it("stores null cancellationReason when reason is explicitly null", async () => {
    const tx = makeTx(ISSUED_RECEIPT);

    await cancelReceiptForPayment(tx as any, "pay-1", "org-1", "user-1", null);

    const updateCall = (tx.receipt.update as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(updateCall.data.cancellationReason).toBeNull();
  });
});

// =============================================================================
// Test 2 — Cancel payment without receipt
// =============================================================================

describe("cancelReceiptForPayment — no receipt", () => {
  it("returns null when no receipt exists for the payment", async () => {
    const tx = makeTx(null);

    const result = await cancelReceiptForPayment(tx as any, "pay-1", "org-1", "user-1");

    expect(result).toBeNull();
  });

  it("does not call receipt.update when no receipt is found", async () => {
    const tx = makeTx(null);

    await cancelReceiptForPayment(tx as any, "pay-1", "org-1", "user-1");

    expect(tx.receipt.update).not.toHaveBeenCalled();
  });
});

// =============================================================================
// Test 3 — Already cancelled receipt (idempotent)
// =============================================================================

describe("cancelReceiptForPayment — already cancelled receipt", () => {
  it("returns null (no double-cancel) when the receipt status is already CANCELLED", async () => {
    // findFirst with status: "ISSUED" returns null — already-cancelled receipt doesn't match
    const tx = makeTx(null);

    const result = await cancelReceiptForPayment(tx as any, "pay-1", "org-1", "user-1");

    expect(result).toBeNull();
    expect(tx.receipt.update).not.toHaveBeenCalled();
  });

  it("findFirst is called with status ISSUED so already-cancelled receipts are skipped", async () => {
    const tx = makeTx(null);

    await cancelReceiptForPayment(tx as any, "pay-1", "org-1", "user-1");

    const findFirstCall = (tx.receipt.findFirst as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(findFirstCall.where.status).toBe("ISSUED");
  });
});

// =============================================================================
// Test 4 — Transaction rollback propagation
// =============================================================================

describe("cancelReceiptForPayment — error propagation", () => {
  it("propagates the error when receipt.update throws (causes tx rollback)", async () => {
    const dbError = new Error("deadlock detected");
    const tx = makeTx(ISSUED_RECEIPT, dbError);

    await expect(
      cancelReceiptForPayment(tx as any, "pay-1", "org-1", "user-1")
    ).rejects.toThrow("deadlock detected");
  });

  it("does not swallow constraint violation errors", async () => {
    const constraintError = new Error("unique constraint violation");
    const tx = makeTx(ISSUED_RECEIPT, constraintError);

    await expect(
      cancelReceiptForPayment(tx as any, "pay-1", "org-1", "user-1")
    ).rejects.toThrow("unique constraint violation");
  });
});

// =============================================================================
// Test 5 — Tenant isolation
// =============================================================================

describe("cancelReceiptForPayment — tenant isolation", () => {
  it("scopes findFirst by organizationId", async () => {
    const tx = makeTx(ISSUED_RECEIPT);

    await cancelReceiptForPayment(tx as any, "pay-1", "org-abc", "user-1");

    const findFirstCall = (tx.receipt.findFirst as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(findFirstCall.where.organizationId).toBe("org-abc");
    expect(findFirstCall.where.paymentId).toBe("pay-1");
  });

  it("scopes receipt.update by organizationId to prevent cross-tenant updates", async () => {
    const tx = makeTx(ISSUED_RECEIPT);

    await cancelReceiptForPayment(tx as any, "pay-1", "org-abc", "user-1");

    const updateCall = (tx.receipt.update as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(updateCall.where.organizationId).toBe("org-abc");
    expect(updateCall.where.id).toBe("rec-1");
  });

  it("returns null for a payment that belongs to a different organization", async () => {
    // findFirst returns null because WHERE clause includes wrong org — simulated by returning null
    const tx = makeTx(null);

    const result = await cancelReceiptForPayment(tx as any, "pay-from-org-a", "org-b", "user-1");

    expect(result).toBeNull();
  });
});

// =============================================================================
// Return value completeness
// =============================================================================

describe("cancelReceiptForPayment — result completeness", () => {
  it("all required fields are present in the returned result", async () => {
    const tx = makeTx(ISSUED_RECEIPT);

    const result = await cancelReceiptForPayment(tx as any, "pay-1", "org-1", "user-1") as ReceiptCancellationResult;

    expect(result).toHaveProperty("receiptId");
    expect(result).toHaveProperty("receiptNumber");
    expect(result).toHaveProperty("previousStatus");
    expect(result).toHaveProperty("cancelledAt");
  });

  it("previousStatus captures the receipt status before cancellation", async () => {
    const tx = makeTx(ISSUED_RECEIPT);

    const result = await cancelReceiptForPayment(tx as any, "pay-1", "org-1", "user-1");

    expect(result!.previousStatus).toBe("ISSUED");
  });
});
