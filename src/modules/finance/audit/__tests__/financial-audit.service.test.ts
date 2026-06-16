/**
 * financial-audit.service.test.ts
 *
 * Verifies that FinancialAuditService.log() calls appendFinancialAuditLog with
 * the correct eventType, entityType, entityId, amount, and metadata for each
 * of the 6 required scenarios. The database is fully mocked.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Mock } from "vitest";

// ---------------------------------------------------------------------------
// Module mocks — hoisted before any import that touches the module under test
// ---------------------------------------------------------------------------

vi.mock("@/modules/finance/audit/repositories/financial-audit.repository", () => ({
  appendFinancialAuditLog: vi.fn().mockResolvedValue("audit-id-1"),
}));

import { financialAuditService } from "@/modules/finance/audit/services/financial-audit.service";
import { appendFinancialAuditLog } from "@/modules/finance/audit/repositories/financial-audit.repository";
import { FinancialAuditEventType } from "@/shared/types/common";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ORG = "org-test-1";
const USER = "user-test-1";

function makeContext(overrides?: Partial<{ organizationId: string; userId: string }>) {
  return {
    organizationId: overrides?.organizationId ?? ORG,
    userId: overrides?.userId ?? USER,
    ipAddress: "127.0.0.1",
    userAgent: "vitest",
  };
}

const appendMock = appendFinancialAuditLog as Mock;

beforeEach(() => vi.clearAllMocks());

// ---------------------------------------------------------------------------
// 1. Payment confirmation
// ---------------------------------------------------------------------------

describe("payment confirmation", () => {
  it("appends PAYMENT_CONFIRMED with correct fields", async () => {
    const ctx = makeContext();

    await financialAuditService.log(ctx, {
      eventType: FinancialAuditEventType.PAYMENT_CONFIRMED,
      entityType: "Payment",
      entityId: "pay-001",
      amount: 1500,
      beforeData: { status: "PENDING" },
      afterData: { status: "CONFIRMED" },
      metadata: { invoiceId: "inv-001", paymentNumber: "PAG-000001" },
    });

    expect(appendMock).toHaveBeenCalledOnce();
    const [orgId, performedBy, , , input] = appendMock.mock.calls[0];

    expect(orgId).toBe(ORG);
    expect(performedBy).toBe(USER);
    expect(input.eventType).toBe(FinancialAuditEventType.PAYMENT_CONFIRMED);
    expect(input.entityType).toBe("Payment");
    expect(input.entityId).toBe("pay-001");
    expect(input.amount).toBe(1500);
    expect(input.beforeData).toEqual({ status: "PENDING" });
    expect(input.afterData).toEqual({ status: "CONFIRMED" });
    expect(input.metadata).toMatchObject({ invoiceId: "inv-001" });
  });
});

// ---------------------------------------------------------------------------
// 2. Payment cancellation
// ---------------------------------------------------------------------------

describe("payment cancellation", () => {
  it("appends PAYMENT_CANCELLED with before/after status", async () => {
    const ctx = makeContext();

    await financialAuditService.log(ctx, {
      eventType: FinancialAuditEventType.PAYMENT_CANCELLED,
      entityType: "Payment",
      entityId: "pay-002",
      amount: 800,
      beforeData: { status: "CONFIRMED" },
      afterData: { status: "CANCELLED", reason: "Duplicado" },
      metadata: { paymentNumber: "PAG-000002", invoiceId: "inv-002" },
    });

    expect(appendMock).toHaveBeenCalledOnce();
    const [, , , , input] = appendMock.mock.calls[0];

    expect(input.eventType).toBe(FinancialAuditEventType.PAYMENT_CANCELLED);
    expect(input.entityType).toBe("Payment");
    expect(input.entityId).toBe("pay-002");
    expect(input.amount).toBe(800);
    expect(input.afterData).toMatchObject({ status: "CANCELLED" });
  });
});

// ---------------------------------------------------------------------------
// 3. Refund completion
// ---------------------------------------------------------------------------

describe("refund completion", () => {
  it("appends REFUND_COMPLETED with method and payment ref", async () => {
    const ctx = makeContext();

    await financialAuditService.log(ctx, {
      eventType: FinancialAuditEventType.REFUND_COMPLETED,
      entityType: "Refund",
      entityId: "ref-001",
      amount: 300,
      beforeData: { status: "APPROVED" },
      afterData: { status: "COMPLETED", refundMethod: "WALLET_CREDIT" },
      metadata: { paymentId: "pay-003", refundNumber: "REF-000001", studentId: "stu-001" },
    });

    expect(appendMock).toHaveBeenCalledOnce();
    const [, , , , input] = appendMock.mock.calls[0];

    expect(input.eventType).toBe(FinancialAuditEventType.REFUND_COMPLETED);
    expect(input.entityId).toBe("ref-001");
    expect(input.amount).toBe(300);
    expect(input.afterData).toMatchObject({ refundMethod: "WALLET_CREDIT" });
    expect(input.metadata).toMatchObject({ paymentId: "pay-003" });
  });
});

// ---------------------------------------------------------------------------
// 4. Wallet credit
// ---------------------------------------------------------------------------

describe("wallet credit", () => {
  it("appends WALLET_CREDIT_APPLIED with wallet entity and amount", async () => {
    const ctx = makeContext();

    await financialAuditService.log(ctx, {
      eventType: FinancialAuditEventType.WALLET_CREDIT_APPLIED,
      entityType: "StudentWallet",
      entityId: "wallet-001",
      amount: 200,
      metadata: { invoiceId: "inv-003", studentId: "stu-002" },
    });

    expect(appendMock).toHaveBeenCalledOnce();
    const [, , , , input] = appendMock.mock.calls[0];

    expect(input.eventType).toBe(FinancialAuditEventType.WALLET_CREDIT_APPLIED);
    expect(input.entityType).toBe("StudentWallet");
    expect(input.entityId).toBe("wallet-001");
    expect(input.amount).toBe(200);
    expect(input.metadata).toMatchObject({ invoiceId: "inv-003" });
  });

  it("appends WALLET_OVERPAYMENT_CREDITED when payment overpays invoice", async () => {
    const ctx = makeContext();

    await financialAuditService.log(ctx, {
      eventType: FinancialAuditEventType.WALLET_OVERPAYMENT_CREDITED,
      entityType: "StudentWallet",
      entityId: "wallet-002",
      amount: 50,
      metadata: { paymentId: "pay-004", paymentNumber: "PAG-000004", studentId: "stu-003" },
    });

    expect(appendMock).toHaveBeenCalledOnce();
    const [, , , , input] = appendMock.mock.calls[0];

    expect(input.eventType).toBe(FinancialAuditEventType.WALLET_OVERPAYMENT_CREDITED);
    expect(input.amount).toBe(50);
  });
});

// ---------------------------------------------------------------------------
// 5. Invoice cancellation
// ---------------------------------------------------------------------------

describe("invoice cancellation", () => {
  it("appends INVOICE_CANCELLED with before/after and metadata", async () => {
    const ctx = makeContext();

    await financialAuditService.log(ctx, {
      eventType: FinancialAuditEventType.INVOICE_CANCELLED,
      entityType: "Invoice",
      entityId: "inv-004",
      amount: 2500,
      beforeData: { status: "PENDING", balanceAmount: 2500 },
      afterData: { status: "CANCELLED", reason: "Erro de emissão" },
      metadata: { invoiceNumber: "FAT-000010", studentId: "stu-004" },
    });

    expect(appendMock).toHaveBeenCalledOnce();
    const [orgId, performedBy, , , input] = appendMock.mock.calls[0];

    expect(orgId).toBe(ORG);
    expect(performedBy).toBe(USER);
    expect(input.eventType).toBe(FinancialAuditEventType.INVOICE_CANCELLED);
    expect(input.entityType).toBe("Invoice");
    expect(input.entityId).toBe("inv-004");
    expect(input.amount).toBe(2500);
    expect(input.beforeData).toMatchObject({ status: "PENDING" });
    expect(input.afterData).toMatchObject({ status: "CANCELLED" });
    expect(input.metadata).toMatchObject({ invoiceNumber: "FAT-000010" });
  });
});

// ---------------------------------------------------------------------------
// 6. Integrity issue detection
// ---------------------------------------------------------------------------

describe("integrity issue creation", () => {
  it("appends INTEGRITY_ISSUE_DETECTED with severity and checkName", async () => {
    // System job: userId = "system"
    const ctx = { organizationId: ORG, userId: "system" };

    await financialAuditService.log(ctx, {
      eventType: FinancialAuditEventType.INTEGRITY_ISSUE_DETECTED,
      entityType: "FinancialIntegrityIssue",
      entityId: "issue-001",
      afterData: {
        isNew: true,
        severity: "CRITICAL",
        category: "INVOICE_BALANCE",
        checkName: "invoice.balance_amounts",
        description: "paidAmount + balanceAmount ≠ totalAmount",
        expectedValue: "1000.00",
        actualValue: "999.99",
      },
      metadata: { jobRunId: "job-run-1", affectedEntityType: "Invoice", affectedEntityId: "inv-005" },
    });

    expect(appendMock).toHaveBeenCalledOnce();
    const [orgId, performedBy, , , input] = appendMock.mock.calls[0];

    expect(orgId).toBe(ORG);
    expect(performedBy).toBe("system");
    expect(input.eventType).toBe(FinancialAuditEventType.INTEGRITY_ISSUE_DETECTED);
    expect(input.entityType).toBe("FinancialIntegrityIssue");
    expect(input.entityId).toBe("issue-001");
    expect(input.afterData).toMatchObject({ severity: "CRITICAL", checkName: "invoice.balance_amounts" });
    expect(input.metadata).toMatchObject({ jobRunId: "job-run-1", affectedEntityType: "Invoice" });
  });
});

// ---------------------------------------------------------------------------
// Service resilience: failures in appendFinancialAuditLog must not throw
// ---------------------------------------------------------------------------

describe("service resilience", () => {
  it("swallows appendFinancialAuditLog errors and returns null", async () => {
    appendMock.mockRejectedValueOnce(new Error("DB unavailable"));
    const ctx = makeContext();

    const result = await financialAuditService.log(ctx, {
      eventType: FinancialAuditEventType.PAYMENT_CONFIRMED,
      entityType: "Payment",
      entityId: "pay-fail",
      amount: 100,
    });

    expect(result).toBeNull();
  });

  it("returns the persisted ID on success", async () => {
    appendMock.mockResolvedValueOnce("audit-id-xyz");
    const ctx = makeContext();

    const result = await financialAuditService.log(ctx, {
      eventType: FinancialAuditEventType.RECEIPT_ISSUED,
      entityType: "Receipt",
      entityId: "rec-001",
      amount: 500,
    });

    expect(result).toBe("audit-id-xyz");
  });
});
