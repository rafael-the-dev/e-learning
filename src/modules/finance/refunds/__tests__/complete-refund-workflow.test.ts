/**
 * complete-refund-workflow.test.ts
 *
 * Integration-level unit tests for the full C-4 refund disbursement flow.
 * Covers CASH_RETURN vs WALLET_CREDIT paths, partial vs full refunds,
 * validation errors, tenant isolation, and concurrent-refund guards.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Mock } from "vitest";

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock("@/server/db", () => ({ getDb: vi.fn() }));

vi.mock("@/server/auth/rbac", () => ({
  getUserPermissions: vi.fn().mockResolvedValue([]),
  createAbility: vi.fn().mockReturnValue({ can: vi.fn().mockReturnValue(true) }),
}));

vi.mock("@/modules/finance/refunds/repositories/refund.repository", () => ({
  findRefundById: vi.fn(),
  calculateAvailableToRequest: vi.fn(),
  calculateRefundableAmountInTx: vi.fn(),
  findRefundsByPayment: vi.fn(),
}));

vi.mock("@/modules/audit-logs/services/audit.service", () => ({
  auditService: { log: vi.fn().mockResolvedValue(undefined) },
}));

vi.mock("@/modules/finance/ledger/services/financial-transaction.service", () => ({
  recordRefundDisbursed: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/server/events/event-publisher", () => ({
  eventPublisher: { publish: vi.fn().mockResolvedValue(undefined) },
}));

import { getDb } from "@/server/db";
import {
  findRefundById,
  calculateRefundableAmountInTx,
} from "@/modules/finance/refunds/repositories/refund.repository";
import { auditService } from "@/modules/audit-logs/services/audit.service";
import { eventPublisher } from "@/server/events/event-publisher";
import { CompleteRefundCommand } from "../commands/complete-refund.command";
import { DomainEventType } from "@/server/events/event-types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const CTX = { userId: "user-1", organizationId: "org-1" };

function makeRefund(overrides: Partial<{
  id: string;
  status: string;
  paymentId: string;
  amount: number;
  refundMethod: string;
  studentId: string | null;
  refundNumber: string;
  completedBy: string | null;
}> = {}) {
  return {
    id: "ref-1",
    organizationId: "org-1",
    branchId: null,
    paymentId: "pay-1",
    receiptId: null,
    studentId: "stu-1",
    enrollmentId: null,
    invoiceId: "inv-1",
    refundNumber: "REF-000001",
    amount: 100,
    reason: "Reembolso",
    status: "APPROVED",
    refundMethod: "CASH_RETURN",
    notes: null,
    rejectionReason: null,
    requestedBy: "user-1",
    approvedBy: "user-1",
    rejectedBy: null,
    completedBy: null,
    approvedAt: new Date(),
    rejectedAt: null,
    completedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    ...overrides,
  };
}

interface DbOptions {
  paymentStatus?: string;
  paymentTotal?: number;
  receiptAmount?: number;
  receiptRefundedAmount?: number;
  receiptStatus?: string;
  hasReceipt?: boolean;
  walletExists?: boolean;
  refundFindFirstResult?: unknown;
  lockResult?: Array<{ id: string }>;
}

function makeDb(opts: DbOptions = {}) {
  const {
    paymentStatus = "CONFIRMED",
    paymentTotal = 200,
    receiptAmount = 200,
    receiptRefundedAmount = 0,
    receiptStatus = "ISSUED",
    hasReceipt = false,
    walletExists = false,
    lockResult,
  } = opts;

  // Use `in` for explicit control over refund.findFirst inside tx
  const refundFindFirstResult = "refundFindFirstResult" in opts
    ? opts.refundFindFirstResult
    : { id: "ref-1" };

  const db = {
    payment: {
      findFirst: vi.fn().mockResolvedValue({
        id: "pay-1",
        status: paymentStatus,
        totalAmount: { toNumber: () => paymentTotal },
      }),
      update: vi.fn().mockResolvedValue({}),
    },
    receipt: {
      findFirst: vi.fn().mockResolvedValue(
        hasReceipt
          ? {
              id: "rec-1",
              amount: { toNumber: () => receiptAmount },
              refundedAmount: { toNumber: () => receiptRefundedAmount },
              status: receiptStatus,
            }
          : null
      ),
      update: vi.fn().mockResolvedValue({}),
    },
    refund: {
      findFirst: vi.fn().mockResolvedValue(refundFindFirstResult),
      update: vi.fn().mockResolvedValue({}),
      aggregate: vi.fn().mockResolvedValue({ _sum: { amount: null } }),
    },
    studentWallet: {
      findFirst: vi.fn().mockResolvedValue(walletExists ? { id: "wallet-1" } : null),
      create: vi.fn().mockResolvedValue({ id: "wallet-1" }),
    },
    studentWalletTransaction: {
      create: vi.fn().mockResolvedValue({ id: "wallet-tx-1" }),
    },
    $queryRaw: vi.fn().mockResolvedValue(lockResult ?? [{ id: "pay-1" }]),
    $transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => unknown) => fn(db)),
  };
  return db;
}

// ---------------------------------------------------------------------------
// Scenario 1 — Full CASH_RETURN refund: payment→REFUNDED, no wallet tx
// ---------------------------------------------------------------------------

describe("CompleteRefund — full CASH_RETURN refund", () => {
  beforeEach(() => vi.clearAllMocks());

  it("sets payment status to REFUNDED and does not create a wallet transaction", async () => {
    // refundable = 100, refund.amount = 100 → fully refunded
    (calculateRefundableAmountInTx as Mock).mockResolvedValue(100);
    const db = makeDb({ paymentTotal: 100 });
    (getDb as Mock).mockResolvedValue(db);
    (findRefundById as Mock)
      .mockResolvedValueOnce(makeRefund({ amount: 100, refundMethod: "CASH_RETURN" }))
      .mockResolvedValueOnce(makeRefund({ status: "COMPLETED", completedBy: "user-1" }));

    await new CompleteRefundCommand({ refundId: "ref-1" }, CTX).execute();

    expect(db.payment.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "REFUNDED" }) })
    );
    expect(db.studentWalletTransaction.create).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Scenario 2 — Partial CASH_RETURN refund: payment→PARTIALLY_REFUNDED
// ---------------------------------------------------------------------------

describe("CompleteRefund — partial CASH_RETURN refund", () => {
  beforeEach(() => vi.clearAllMocks());

  it("sets payment status to PARTIALLY_REFUNDED when not all funds are returned", async () => {
    // total = 200, refundable = 200 (no prior COMPLETED), refund.amount = 80
    (calculateRefundableAmountInTx as Mock).mockResolvedValue(200);
    const db = makeDb({ paymentTotal: 200 });
    (getDb as Mock).mockResolvedValue(db);
    (findRefundById as Mock)
      .mockResolvedValueOnce(makeRefund({ amount: 80, refundMethod: "CASH_RETURN" }))
      .mockResolvedValueOnce(makeRefund({ status: "COMPLETED" }));

    await new CompleteRefundCommand({ refundId: "ref-1" }, CTX).execute();

    expect(db.payment.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "PARTIALLY_REFUNDED" }) })
    );
    expect(db.studentWalletTransaction.create).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Scenario 3 — Full WALLET_CREDIT refund: wallet tx created, payment→REFUNDED
// ---------------------------------------------------------------------------

describe("CompleteRefund — full WALLET_CREDIT refund", () => {
  beforeEach(() => vi.clearAllMocks());

  it("creates a positive wallet transaction and sets payment to REFUNDED", async () => {
    (calculateRefundableAmountInTx as Mock).mockResolvedValue(100);
    const db = makeDb({ paymentTotal: 100, walletExists: true });
    (getDb as Mock).mockResolvedValue(db);
    (findRefundById as Mock)
      .mockResolvedValueOnce(makeRefund({ amount: 100, refundMethod: "WALLET_CREDIT", studentId: "stu-1" }))
      .mockResolvedValueOnce(makeRefund({ status: "COMPLETED" }));

    await new CompleteRefundCommand({ refundId: "ref-1" }, CTX).execute();

    expect(db.studentWalletTransaction.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ type: "REFUND", amount: 100 }),
      })
    );
    expect(db.payment.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "REFUNDED" }) })
    );
  });

  it("creates the wallet if it does not exist yet", async () => {
    (calculateRefundableAmountInTx as Mock).mockResolvedValue(100);
    const db = makeDb({ paymentTotal: 100, walletExists: false });
    (getDb as Mock).mockResolvedValue(db);
    (findRefundById as Mock)
      .mockResolvedValueOnce(makeRefund({ amount: 100, refundMethod: "WALLET_CREDIT", studentId: "stu-1" }))
      .mockResolvedValueOnce(makeRefund({ status: "COMPLETED" }));

    await new CompleteRefundCommand({ refundId: "ref-1" }, CTX).execute();

    expect(db.studentWallet.create).toHaveBeenCalled();
    expect(db.studentWalletTransaction.create).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Scenario 4 — Partial WALLET_CREDIT refund: wallet tx created, payment→PARTIALLY_REFUNDED
// ---------------------------------------------------------------------------

describe("CompleteRefund — partial WALLET_CREDIT refund", () => {
  beforeEach(() => vi.clearAllMocks());

  it("creates wallet transaction and sets payment to PARTIALLY_REFUNDED", async () => {
    (calculateRefundableAmountInTx as Mock).mockResolvedValue(200);
    const db = makeDb({ paymentTotal: 200, walletExists: true });
    (getDb as Mock).mockResolvedValue(db);
    (findRefundById as Mock)
      .mockResolvedValueOnce(makeRefund({ amount: 80, refundMethod: "WALLET_CREDIT", studentId: "stu-1" }))
      .mockResolvedValueOnce(makeRefund({ status: "COMPLETED" }));

    await new CompleteRefundCommand({ refundId: "ref-1" }, CTX).execute();

    expect(db.studentWalletTransaction.create).toHaveBeenCalled();
    expect(db.payment.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "PARTIALLY_REFUNDED" }) })
    );
  });
});

// ---------------------------------------------------------------------------
// Scenario 5 — Full refund with receipt: receipt→CANCELLED
// ---------------------------------------------------------------------------

describe("CompleteRefund — full refund updates receipt to CANCELLED", () => {
  beforeEach(() => vi.clearAllMocks());

  it("cancels the receipt when the full amount has been refunded", async () => {
    (calculateRefundableAmountInTx as Mock).mockResolvedValue(100);
    const db = makeDb({
      paymentTotal: 100,
      hasReceipt: true,
      receiptAmount: 100,
      receiptRefundedAmount: 0,
      receiptStatus: "ISSUED",
    });
    (getDb as Mock).mockResolvedValue(db);
    (findRefundById as Mock)
      .mockResolvedValueOnce(makeRefund({ amount: 100, refundMethod: "CASH_RETURN" }))
      .mockResolvedValueOnce(makeRefund({ status: "COMPLETED" }));

    await new CompleteRefundCommand({ refundId: "ref-1" }, CTX).execute();

    expect(db.receipt.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "CANCELLED",
          refundedAmount: 100,
          cancelledBy: "user-1",
        }),
      })
    );
  });
});

// ---------------------------------------------------------------------------
// Scenario 6 — Partial refund with receipt: receipt→PARTIALLY_REFUNDED
// ---------------------------------------------------------------------------

describe("CompleteRefund — partial refund sets receipt to PARTIALLY_REFUNDED", () => {
  beforeEach(() => vi.clearAllMocks());

  it("marks receipt PARTIALLY_REFUNDED when amount < receipt total", async () => {
    (calculateRefundableAmountInTx as Mock).mockResolvedValue(200);
    const db = makeDb({
      paymentTotal: 200,
      hasReceipt: true,
      receiptAmount: 200,
      receiptRefundedAmount: 0,
      receiptStatus: "ISSUED",
    });
    (getDb as Mock).mockResolvedValue(db);
    (findRefundById as Mock)
      .mockResolvedValueOnce(makeRefund({ amount: 80, refundMethod: "CASH_RETURN" }))
      .mockResolvedValueOnce(makeRefund({ status: "COMPLETED" }));

    await new CompleteRefundCommand({ refundId: "ref-1" }, CTX).execute();

    expect(db.receipt.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "PARTIALLY_REFUNDED",
          refundedAmount: 80,
        }),
      })
    );
  });
});

// ---------------------------------------------------------------------------
// Scenario 7 — Audit trail: all required entries logged
// ---------------------------------------------------------------------------

describe("CompleteRefund — audit trail", () => {
  beforeEach(() => vi.clearAllMocks());

  it("logs refund.completed and payment.refunded audit entries", async () => {
    (calculateRefundableAmountInTx as Mock).mockResolvedValue(100);
    const db = makeDb({ paymentTotal: 100 });
    (getDb as Mock).mockResolvedValue(db);
    (findRefundById as Mock)
      .mockResolvedValueOnce(makeRefund({ amount: 100, refundMethod: "CASH_RETURN" }))
      .mockResolvedValueOnce(makeRefund({ status: "COMPLETED" }));

    await new CompleteRefundCommand({ refundId: "ref-1" }, CTX).execute();

    const calls = ((auditService.log as Mock).mock.calls as [unknown, { action: string }][]).map(
      ([, entry]) => entry.action
    );
    expect(calls).toContain("refund.completed");
    expect(calls).toContain("payment.refunded");
  });

  it("logs wallet_transaction.created for WALLET_CREDIT refunds", async () => {
    (calculateRefundableAmountInTx as Mock).mockResolvedValue(100);
    const db = makeDb({ paymentTotal: 100, walletExists: true });
    (getDb as Mock).mockResolvedValue(db);
    (findRefundById as Mock)
      .mockResolvedValueOnce(makeRefund({ amount: 100, refundMethod: "WALLET_CREDIT", studentId: "stu-1" }))
      .mockResolvedValueOnce(makeRefund({ status: "COMPLETED" }));

    await new CompleteRefundCommand({ refundId: "ref-1" }, CTX).execute();

    const calls = ((auditService.log as Mock).mock.calls as [unknown, { action: string }][]).map(
      ([, entry]) => entry.action
    );
    expect(calls).toContain("wallet_transaction.created");
  });
});

// ---------------------------------------------------------------------------
// Scenario 8 — Cannot complete refund above refundable amount
// ---------------------------------------------------------------------------

describe("CompleteRefund — refundable amount guard", () => {
  beforeEach(() => vi.clearAllMocks());

  it("throws when refund.amount exceeds refundableAmount inside the transaction", async () => {
    // refundable = 50, but refund.amount = 100
    (calculateRefundableAmountInTx as Mock).mockResolvedValue(50);
    const db = makeDb({ paymentTotal: 200 });
    (getDb as Mock).mockResolvedValue(db);
    (findRefundById as Mock).mockResolvedValue(makeRefund({ amount: 100 }));

    await expect(
      new CompleteRefundCommand({ refundId: "ref-1" }, CTX).execute()
    ).rejects.toThrow("excede o valor reembolsável");
  });
});

// ---------------------------------------------------------------------------
// Scenario 9 — Cannot refund PENDING payment
// ---------------------------------------------------------------------------

describe("CompleteRefund — payment status validation", () => {
  beforeEach(() => vi.clearAllMocks());

  it("throws when payment is PENDING", async () => {
    (calculateRefundableAmountInTx as Mock).mockResolvedValue(100);
    const db = makeDb({ paymentStatus: "PENDING" });
    (getDb as Mock).mockResolvedValue(db);
    (findRefundById as Mock).mockResolvedValue(makeRefund({ status: "APPROVED" }));

    await expect(
      new CompleteRefundCommand({ refundId: "ref-1" }, CTX).execute()
    ).rejects.toThrow("não pode ser reembolsado");
  });

  it("throws when payment is CANCELLED", async () => {
    (calculateRefundableAmountInTx as Mock).mockResolvedValue(100);
    const db = makeDb({ paymentStatus: "CANCELLED" });
    (getDb as Mock).mockResolvedValue(db);
    (findRefundById as Mock).mockResolvedValue(makeRefund({ status: "APPROVED" }));

    await expect(
      new CompleteRefundCommand({ refundId: "ref-1" }, CTX).execute()
    ).rejects.toThrow("não pode ser reembolsado");
  });

  it("throws when payment is already fully REFUNDED", async () => {
    (calculateRefundableAmountInTx as Mock).mockResolvedValue(100);
    const db = makeDb({ paymentStatus: "REFUNDED" });
    (getDb as Mock).mockResolvedValue(db);
    (findRefundById as Mock).mockResolvedValue(makeRefund({ status: "APPROVED" }));

    await expect(
      new CompleteRefundCommand({ refundId: "ref-1" }, CTX).execute()
    ).rejects.toThrow("não pode ser reembolsado");
  });

  it("allows completion when payment is PARTIALLY_REFUNDED", async () => {
    // Second partial refund on a PARTIALLY_REFUNDED payment should work
    (calculateRefundableAmountInTx as Mock).mockResolvedValue(100);
    const db = makeDb({ paymentStatus: "PARTIALLY_REFUNDED", paymentTotal: 200 });
    (getDb as Mock).mockResolvedValue(db);
    (findRefundById as Mock)
      .mockResolvedValueOnce(makeRefund({ amount: 80, refundMethod: "CASH_RETURN" }))
      .mockResolvedValueOnce(makeRefund({ status: "COMPLETED" }));

    await expect(
      new CompleteRefundCommand({ refundId: "ref-1" }, CTX).execute()
    ).resolves.toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Scenario 10 — Tenant isolation: payment lock returns empty (wrong org)
// ---------------------------------------------------------------------------

describe("CompleteRefund — tenant isolation via payment lock", () => {
  beforeEach(() => vi.clearAllMocks());

  it("throws when payment row is not found under the organization's lock", async () => {
    (calculateRefundableAmountInTx as Mock).mockResolvedValue(100);
    // $queryRaw returns empty — payment does not belong to this org
    const db = makeDb({ lockResult: [] });
    (getDb as Mock).mockResolvedValue(db);
    (findRefundById as Mock).mockResolvedValue(makeRefund({ status: "APPROVED" }));

    await expect(
      new CompleteRefundCommand({ refundId: "ref-1" }, CTX).execute()
    ).rejects.toThrow("Pagamento não encontrado nesta organização");
  });
});

// ---------------------------------------------------------------------------
// Scenario 11 — Double-completion guard (TOCTOU inside tx)
// ---------------------------------------------------------------------------

describe("CompleteRefund — double-completion guard", () => {
  beforeEach(() => vi.clearAllMocks());

  it("throws when refund is no longer APPROVED inside the transaction", async () => {
    (calculateRefundableAmountInTx as Mock).mockResolvedValue(100);
    // Inside tx, refund.findFirst returns null — already completed by another request
    const db = makeDb({ refundFindFirstResult: null });
    (getDb as Mock).mockResolvedValue(db);
    // Pre-flight still sees APPROVED; race happens inside tx
    (findRefundById as Mock).mockResolvedValue(makeRefund({ status: "APPROVED" }));

    await expect(
      new CompleteRefundCommand({ refundId: "ref-1" }, CTX).execute()
    ).rejects.toThrow("O reembolso não está mais disponível para conclusão");
  });
});

// ---------------------------------------------------------------------------
// Scenario 12 — Invalid status transitions fail before entering transaction
// ---------------------------------------------------------------------------

describe("CompleteRefund — pre-flight status guard", () => {
  beforeEach(() => vi.clearAllMocks());

  it("throws immediately when refund not found", async () => {
    const db = makeDb();
    (getDb as Mock).mockResolvedValue(db);
    (findRefundById as Mock).mockResolvedValue(null);

    await expect(
      new CompleteRefundCommand({ refundId: "ref-missing" }, CTX).execute()
    ).rejects.toThrow("Reembolso não encontrado nesta organização");

    // Transaction must not have been entered
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it("emits REFUND_COMPLETED domain event with correct payload", async () => {
    (calculateRefundableAmountInTx as Mock).mockResolvedValue(100);
    const db = makeDb({ paymentTotal: 100 });
    (getDb as Mock).mockResolvedValue(db);
    (findRefundById as Mock)
      .mockResolvedValueOnce(makeRefund({ amount: 100, refundMethod: "CASH_RETURN" }))
      .mockResolvedValueOnce(makeRefund({ status: "COMPLETED" }));

    await new CompleteRefundCommand({ refundId: "ref-1" }, CTX).execute();

    expect(eventPublisher.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: DomainEventType.REFUND_COMPLETED,
        payload: expect.objectContaining({
          refundId: "ref-1",
          paymentId: "pay-1",
          refundMethod: "CASH_RETURN",
        }),
      })
    );
  });
});
