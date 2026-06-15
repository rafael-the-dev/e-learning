import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Mock } from "vitest";

// ---------------------------------------------------------------------------
// Module mocks — declared before imports so Vitest can hoist them
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

vi.mock("@/modules/finance/services/financial-sequence.service", () => ({
  getNextRefundNumber: vi.fn().mockResolvedValue("REF-000001"),
}));

vi.mock("@/modules/finance/ledger/services/financial-transaction.service", () => ({
  recordRefundDisbursed: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/modules/audit-logs/services/audit.service", () => ({
  auditService: { log: vi.fn().mockResolvedValue(undefined) },
}));

vi.mock("@/server/events/event-publisher", () => ({
  eventPublisher: { publish: vi.fn().mockResolvedValue(undefined) },
}));

import { getDb } from "@/server/db";
import {
  findRefundById,
  calculateAvailableToRequest,
  calculateRefundableAmountInTx,
} from "@/modules/finance/refunds/repositories/refund.repository";
import { auditService } from "@/modules/audit-logs/services/audit.service";
import { eventPublisher } from "@/server/events/event-publisher";
import { CreateRefundRequestCommand } from "../commands/create-refund-request.command";
import { ApproveRefundCommand } from "../commands/approve-refund.command";
import { RejectRefundCommand } from "../commands/reject-refund.command";
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
  refundNumber: string;
  amount: number;
  refundMethod: string;
  studentId: string | null;
  rejectionReason: string | null;
  approvedBy: string | null;
  rejectedBy: string | null;
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
    reason: "Pagamento duplicado",
    status: "REQUESTED",
    refundMethod: "CASH_RETURN",
    notes: null,
    rejectionReason: null,
    requestedBy: "user-1",
    approvedBy: null,
    rejectedBy: null,
    completedBy: null,
    approvedAt: null,
    rejectedAt: null,
    completedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    ...overrides,
  };
}

function makePayment(overrides: Partial<{ status: string; totalAmount: number }> = {}) {
  return {
    id: "pay-1",
    status: "CONFIRMED",
    totalAmount: 200,
    branchId: null,
    studentId: "stu-1",
    enrollmentId: null,
    invoiceId: "inv-1",
    ...overrides,
  };
}

function makeDb(overrides: Partial<{
  paymentFindFirst: unknown;
  receiptFindFirst: unknown;
  refundCreate: unknown;
  refundUpdate: unknown;
  refundFindFirst: unknown;
}> = {}) {
  const refundCreateMock = vi.fn().mockResolvedValue({ id: "ref-1" });
  // Use `in` to distinguish an explicit null from "not provided"
  const paymentResult = "paymentFindFirst" in overrides ? overrides.paymentFindFirst : makePayment();
  const refundFindFirstResult = "refundFindFirst" in overrides
    ? overrides.refundFindFirst
    : { id: "ref-1" };
  const db = {
    payment: {
      findFirst: vi.fn().mockResolvedValue(paymentResult),
      update: vi.fn().mockResolvedValue({}),
    },
    receipt: {
      findFirst: vi.fn().mockResolvedValue(overrides.receiptFindFirst ?? null),
      update: vi.fn().mockResolvedValue({}),
    },
    refund: {
      create: overrides.refundCreate ? vi.fn().mockResolvedValue(overrides.refundCreate) : refundCreateMock,
      update: vi.fn().mockResolvedValue({}),
      aggregate: vi.fn().mockResolvedValue({ _sum: { amount: null } }),
      findFirst: vi.fn().mockResolvedValue(refundFindFirstResult),
    },
    studentWallet: {
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({ id: "wallet-1" }),
    },
    studentWalletTransaction: {
      create: vi.fn().mockResolvedValue({ id: "wallet-tx-1" }),
    },
    $queryRaw: vi.fn().mockResolvedValue([{ id: "pay-1" }]),
    $transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => unknown) => fn(db)),
  };
  return db;
}

// ---------------------------------------------------------------------------
// Test 1 — CreateRefundRequest: success
// ---------------------------------------------------------------------------

describe("CreateRefundRequestCommand — success", () => {
  beforeEach(() => vi.clearAllMocks());

  it("creates a refund with REQUESTED status and correct fields", async () => {
    const db = makeDb();
    (getDb as Mock).mockResolvedValue(db);
    (calculateAvailableToRequest as Mock).mockResolvedValue(200);
    (findRefundById as Mock).mockResolvedValue(makeRefund());

    const cmd = new CreateRefundRequestCommand(
      { paymentId: "pay-1", amount: 100, reason: "Pagamento duplicado", refundMethod: "CASH_RETURN" },
      CTX
    );
    const result = await cmd.execute();

    expect(result.status).toBe("REQUESTED");
    expect(result.refundNumber).toBe("REF-000001");
    expect(result.amount).toBe(100);
  });

  it("emits REFUND_REQUESTED domain event", async () => {
    const db = makeDb();
    (getDb as Mock).mockResolvedValue(db);
    (calculateAvailableToRequest as Mock).mockResolvedValue(200);
    (findRefundById as Mock).mockResolvedValue(makeRefund());

    const cmd = new CreateRefundRequestCommand(
      { paymentId: "pay-1", amount: 100, reason: "Pagamento duplicado", refundMethod: "CASH_RETURN" },
      CTX
    );
    await cmd.execute();

    expect(eventPublisher.publish).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: DomainEventType.REFUND_REQUESTED })
    );
  });

  it("logs a refund.requested audit entry", async () => {
    const db = makeDb();
    (getDb as Mock).mockResolvedValue(db);
    (calculateAvailableToRequest as Mock).mockResolvedValue(200);
    (findRefundById as Mock).mockResolvedValue(makeRefund());

    const cmd = new CreateRefundRequestCommand(
      { paymentId: "pay-1", amount: 100, reason: "Pagamento duplicado", refundMethod: "CASH_RETURN" },
      CTX
    );
    await cmd.execute();

    expect(auditService.log).toHaveBeenCalledWith(
      CTX,
      expect.objectContaining({ action: "refund.requested" })
    );
  });
});

// ---------------------------------------------------------------------------
// Test 2 — CreateRefundRequest: fails when payment is not CONFIRMED
// ---------------------------------------------------------------------------

describe("CreateRefundRequestCommand — payment not CONFIRMED", () => {
  beforeEach(() => vi.clearAllMocks());

  it("throws BusinessRuleError when payment status is PENDING", async () => {
    const db = makeDb({ paymentFindFirst: makePayment({ status: "PENDING" }) });
    (getDb as Mock).mockResolvedValue(db);

    const cmd = new CreateRefundRequestCommand(
      { paymentId: "pay-1", amount: 50, reason: "Motivo", refundMethod: "CASH_RETURN" },
      CTX
    );

    await expect(cmd.execute()).rejects.toThrow(
      "Apenas pagamentos confirmados podem ser reembolsados"
    );
  });

  it("throws BusinessRuleError when payment status is CANCELLED", async () => {
    const db = makeDb({ paymentFindFirst: makePayment({ status: "CANCELLED" }) });
    (getDb as Mock).mockResolvedValue(db);

    const cmd = new CreateRefundRequestCommand(
      { paymentId: "pay-1", amount: 50, reason: "Motivo", refundMethod: "CASH_RETURN" },
      CTX
    );

    await expect(cmd.execute()).rejects.toThrow(
      "Apenas pagamentos confirmados podem ser reembolsados"
    );
  });
});

// ---------------------------------------------------------------------------
// Test 3 — CreateRefundRequest: tenant isolation (payment not found)
// ---------------------------------------------------------------------------

describe("CreateRefundRequestCommand — tenant isolation", () => {
  beforeEach(() => vi.clearAllMocks());

  it("throws when payment does not belong to the organization", async () => {
    const db = makeDb({ paymentFindFirst: null });
    (getDb as Mock).mockResolvedValue(db);

    const cmd = new CreateRefundRequestCommand(
      { paymentId: "pay-other-org", amount: 50, reason: "Motivo", refundMethod: "CASH_RETURN" },
      CTX
    );

    await expect(cmd.execute()).rejects.toThrow("Pagamento não encontrado nesta organização");
  });
});

// ---------------------------------------------------------------------------
// Test 4 — CreateRefundRequest: fails when amount exceeds available to request
// ---------------------------------------------------------------------------

describe("CreateRefundRequestCommand — amount exceeds available to request", () => {
  beforeEach(() => vi.clearAllMocks());

  it("throws when requested amount is greater than availableToRequest", async () => {
    const db = makeDb();
    (getDb as Mock).mockResolvedValue(db);
    (calculateAvailableToRequest as Mock).mockResolvedValue(50);

    const cmd = new CreateRefundRequestCommand(
      { paymentId: "pay-1", amount: 150, reason: "Motivo", refundMethod: "CASH_RETURN" },
      CTX
    );

    await expect(cmd.execute()).rejects.toThrow("excede o valor disponível para reembolso");
  });
});

// ---------------------------------------------------------------------------
// Test 5 — CreateRefundRequest: partial refund after a previous COMPLETED refund
// ---------------------------------------------------------------------------

describe("CreateRefundRequestCommand — partial refund with existing completed refund", () => {
  beforeEach(() => vi.clearAllMocks());

  it("succeeds when amount ≤ (totalAmount − committedRefunds)", async () => {
    // payment.totalAmount = 200; committed refunds of 80 already exist
    // → availableToRequest = 120; requesting 100 should succeed
    const db = makeDb({ paymentFindFirst: makePayment({ totalAmount: 200 }) });
    (getDb as Mock).mockResolvedValue(db);
    (calculateAvailableToRequest as Mock).mockResolvedValue(120); // 200 - 80
    (findRefundById as Mock).mockResolvedValue(makeRefund({ amount: 100 }));

    const cmd = new CreateRefundRequestCommand(
      { paymentId: "pay-1", amount: 100, reason: "Reembolso parcial", refundMethod: "CASH_RETURN" },
      CTX
    );
    const result = await cmd.execute();

    expect(result.status).toBe("REQUESTED");
    expect(result.amount).toBe(100);
  });

  it("fails when amount exceeds remaining available amount", async () => {
    // payment.totalAmount = 200; previous committed refunds of 180 → only 20 available
    const db = makeDb({ paymentFindFirst: makePayment({ totalAmount: 200 }) });
    (getDb as Mock).mockResolvedValue(db);
    (calculateAvailableToRequest as Mock).mockResolvedValue(20);

    const cmd = new CreateRefundRequestCommand(
      { paymentId: "pay-1", amount: 50, reason: "Reembolso excessivo", refundMethod: "CASH_RETURN" },
      CTX
    );

    await expect(cmd.execute()).rejects.toThrow("excede o valor disponível para reembolso");
  });
});

// ---------------------------------------------------------------------------
// Test 6 — ApproveRefund: success
// ---------------------------------------------------------------------------

describe("ApproveRefundCommand — success", () => {
  beforeEach(() => vi.clearAllMocks());

  it("moves refund from REQUESTED to APPROVED", async () => {
    const db = makeDb();
    (getDb as Mock).mockResolvedValue(db);
    (findRefundById as Mock)
      .mockResolvedValueOnce(makeRefund({ status: "REQUESTED" }))
      .mockResolvedValueOnce(makeRefund({ status: "APPROVED", approvedBy: "user-1" }));

    const cmd = new ApproveRefundCommand({ refundId: "ref-1" }, CTX);
    const result = await cmd.execute();

    expect(result.status).toBe("APPROVED");
    expect(result.approvedBy).toBe("user-1");
  });

  it("emits REFUND_APPROVED domain event", async () => {
    const db = makeDb();
    (getDb as Mock).mockResolvedValue(db);
    (findRefundById as Mock)
      .mockResolvedValueOnce(makeRefund({ status: "REQUESTED" }))
      .mockResolvedValueOnce(makeRefund({ status: "APPROVED", approvedBy: "user-1" }));

    const cmd = new ApproveRefundCommand({ refundId: "ref-1" }, CTX);
    await cmd.execute();

    expect(eventPublisher.publish).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: DomainEventType.REFUND_APPROVED })
    );
  });

  it("logs a refund.approved audit entry", async () => {
    const db = makeDb();
    (getDb as Mock).mockResolvedValue(db);
    (findRefundById as Mock)
      .mockResolvedValueOnce(makeRefund({ status: "REQUESTED" }))
      .mockResolvedValueOnce(makeRefund({ status: "APPROVED", approvedBy: "user-1" }));

    const cmd = new ApproveRefundCommand({ refundId: "ref-1" }, CTX);
    await cmd.execute();

    expect(auditService.log).toHaveBeenCalledWith(
      CTX,
      expect.objectContaining({ action: "refund.approved" })
    );
  });
});

// ---------------------------------------------------------------------------
// Test 7 — ApproveRefund: fails when refund is not REQUESTED
// ---------------------------------------------------------------------------

describe("ApproveRefundCommand — invalid status", () => {
  beforeEach(() => vi.clearAllMocks());

  it("throws when refund is already APPROVED", async () => {
    const db = makeDb();
    (getDb as Mock).mockResolvedValue(db);
    (findRefundById as Mock).mockResolvedValue(makeRefund({ status: "APPROVED" }));

    const cmd = new ApproveRefundCommand({ refundId: "ref-1" }, CTX);

    await expect(cmd.execute()).rejects.toThrow(
      "Apenas reembolsos com estado REQUESTED podem ser aprovados"
    );
  });

  it("throws when refund is COMPLETED", async () => {
    const db = makeDb();
    (getDb as Mock).mockResolvedValue(db);
    (findRefundById as Mock).mockResolvedValue(makeRefund({ status: "COMPLETED" }));

    const cmd = new ApproveRefundCommand({ refundId: "ref-1" }, CTX);

    await expect(cmd.execute()).rejects.toThrow(
      "Apenas reembolsos com estado REQUESTED podem ser aprovados"
    );
  });
});

// ---------------------------------------------------------------------------
// Test 8 — ApproveRefund: tenant isolation (refund not found)
// ---------------------------------------------------------------------------

describe("ApproveRefundCommand — tenant isolation", () => {
  beforeEach(() => vi.clearAllMocks());

  it("throws when refund does not belong to the organization", async () => {
    const db = makeDb();
    (getDb as Mock).mockResolvedValue(db);
    (findRefundById as Mock).mockResolvedValue(null);

    const cmd = new ApproveRefundCommand({ refundId: "ref-other-org" }, CTX);

    await expect(cmd.execute()).rejects.toThrow("Reembolso não encontrado nesta organização");
  });
});

// ---------------------------------------------------------------------------
// Test 9 — RejectRefund: success with rejection reason
// ---------------------------------------------------------------------------

describe("RejectRefundCommand — success", () => {
  beforeEach(() => vi.clearAllMocks());

  it("moves refund from REQUESTED to REJECTED with rejection reason", async () => {
    const db = makeDb();
    (getDb as Mock).mockResolvedValue(db);
    (findRefundById as Mock)
      .mockResolvedValueOnce(makeRefund({ status: "REQUESTED" }))
      .mockResolvedValueOnce(
        makeRefund({ status: "REJECTED", rejectedBy: "user-1", rejectionReason: "Não elegível" })
      );

    const cmd = new RejectRefundCommand(
      { refundId: "ref-1", rejectionReason: "Não elegível" },
      CTX
    );
    const result = await cmd.execute();

    expect(result.status).toBe("REJECTED");
    expect(result.rejectedBy).toBe("user-1");
    expect(result.rejectionReason).toBe("Não elegível");
  });

  it("emits REFUND_REJECTED domain event with rejectionReason", async () => {
    const db = makeDb();
    (getDb as Mock).mockResolvedValue(db);
    (findRefundById as Mock)
      .mockResolvedValueOnce(makeRefund({ status: "REQUESTED" }))
      .mockResolvedValueOnce(makeRefund({ status: "REJECTED", rejectedBy: "user-1" }));

    const cmd = new RejectRefundCommand(
      { refundId: "ref-1", rejectionReason: "Não elegível" },
      CTX
    );
    await cmd.execute();

    expect(eventPublisher.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: DomainEventType.REFUND_REJECTED,
        payload: expect.objectContaining({ rejectionReason: "Não elegível" }),
      })
    );
  });

  it("logs a refund.rejected audit entry", async () => {
    const db = makeDb();
    (getDb as Mock).mockResolvedValue(db);
    (findRefundById as Mock)
      .mockResolvedValueOnce(makeRefund({ status: "REQUESTED" }))
      .mockResolvedValueOnce(makeRefund({ status: "REJECTED" }));

    const cmd = new RejectRefundCommand(
      { refundId: "ref-1", rejectionReason: "Não elegível" },
      CTX
    );
    await cmd.execute();

    expect(auditService.log).toHaveBeenCalledWith(
      CTX,
      expect.objectContaining({ action: "refund.rejected" })
    );
  });
});

// ---------------------------------------------------------------------------
// Test 10 — RejectRefund: fails when refund is not REQUESTED
// ---------------------------------------------------------------------------

describe("RejectRefundCommand — invalid status", () => {
  beforeEach(() => vi.clearAllMocks());

  it("throws when refund is already APPROVED", async () => {
    const db = makeDb();
    (getDb as Mock).mockResolvedValue(db);
    (findRefundById as Mock).mockResolvedValue(makeRefund({ status: "APPROVED" }));

    const cmd = new RejectRefundCommand(
      { refundId: "ref-1", rejectionReason: "Motivo" },
      CTX
    );

    await expect(cmd.execute()).rejects.toThrow(
      "Apenas reembolsos com estado REQUESTED podem ser rejeitados"
    );
  });

  it("throws when refund is already REJECTED (terminal state)", async () => {
    const db = makeDb();
    (getDb as Mock).mockResolvedValue(db);
    (findRefundById as Mock).mockResolvedValue(makeRefund({ status: "REJECTED" }));

    const cmd = new RejectRefundCommand(
      { refundId: "ref-1", rejectionReason: "Motivo" },
      CTX
    );

    await expect(cmd.execute()).rejects.toThrow(
      "Apenas reembolsos com estado REQUESTED podem ser rejeitados"
    );
  });
});

// ---------------------------------------------------------------------------
// Test 11 — CompleteRefund: success (CASH_RETURN, no receipt)
// ---------------------------------------------------------------------------

describe("CompleteRefundCommand — success", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (calculateRefundableAmountInTx as Mock).mockResolvedValue(100);
  });

  it("moves refund from APPROVED to COMPLETED", async () => {
    const db = makeDb();
    (getDb as Mock).mockResolvedValue(db);
    (findRefundById as Mock)
      .mockResolvedValueOnce(makeRefund({ status: "APPROVED" }))
      .mockResolvedValueOnce(makeRefund({ status: "COMPLETED", completedBy: "user-1" }));

    const cmd = new CompleteRefundCommand({ refundId: "ref-1" }, CTX);
    const result = await cmd.execute();

    expect(result.status).toBe("COMPLETED");
    expect(result.completedBy).toBe("user-1");
  });

  it("emits REFUND_COMPLETED domain event", async () => {
    const db = makeDb();
    (getDb as Mock).mockResolvedValue(db);
    (findRefundById as Mock)
      .mockResolvedValueOnce(makeRefund({ status: "APPROVED" }))
      .mockResolvedValueOnce(makeRefund({ status: "COMPLETED", completedBy: "user-1" }));

    const cmd = new CompleteRefundCommand({ refundId: "ref-1" }, CTX);
    await cmd.execute();

    expect(eventPublisher.publish).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: DomainEventType.REFUND_COMPLETED })
    );
  });

  it("updates payment status inside the transaction", async () => {
    const db = makeDb();
    (getDb as Mock).mockResolvedValue(db);
    (findRefundById as Mock)
      .mockResolvedValueOnce(makeRefund({ status: "APPROVED" }))
      .mockResolvedValueOnce(makeRefund({ status: "COMPLETED", completedBy: "user-1" }));

    const cmd = new CompleteRefundCommand({ refundId: "ref-1" }, CTX);
    await cmd.execute();

    expect(db.payment.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "REFUNDED" }),
      })
    );
  });

  it("logs a refund.completed audit entry", async () => {
    const db = makeDb();
    (getDb as Mock).mockResolvedValue(db);
    (findRefundById as Mock)
      .mockResolvedValueOnce(makeRefund({ status: "APPROVED" }))
      .mockResolvedValueOnce(makeRefund({ status: "COMPLETED", completedBy: "user-1" }));

    const cmd = new CompleteRefundCommand({ refundId: "ref-1" }, CTX);
    await cmd.execute();

    expect(auditService.log).toHaveBeenCalledWith(
      CTX,
      expect.objectContaining({ action: "refund.completed" })
    );
  });
});

// ---------------------------------------------------------------------------
// Test 12 — CompleteRefund: fails when refund is not APPROVED
// ---------------------------------------------------------------------------

describe("CompleteRefundCommand — invalid status", () => {
  beforeEach(() => vi.clearAllMocks());

  it("throws when refund is still REQUESTED", async () => {
    const db = makeDb();
    (getDb as Mock).mockResolvedValue(db);
    (findRefundById as Mock).mockResolvedValue(makeRefund({ status: "REQUESTED" }));

    const cmd = new CompleteRefundCommand({ refundId: "ref-1" }, CTX);

    await expect(cmd.execute()).rejects.toThrow(
      "Apenas reembolsos com estado APPROVED podem ser concluídos"
    );
  });

  it("throws when refund is REJECTED (terminal state)", async () => {
    const db = makeDb();
    (getDb as Mock).mockResolvedValue(db);
    (findRefundById as Mock).mockResolvedValue(makeRefund({ status: "REJECTED" }));

    const cmd = new CompleteRefundCommand({ refundId: "ref-1" }, CTX);

    await expect(cmd.execute()).rejects.toThrow(
      "Apenas reembolsos com estado APPROVED podem ser concluídos"
    );
  });
});
