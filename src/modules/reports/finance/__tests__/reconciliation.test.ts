import { describe, it, expect, vi, beforeEach } from "vitest";
import { Prisma } from "@prisma/client";

// ---------------------------------------------------------------------------
// DB mock
// ---------------------------------------------------------------------------

const mockQueryRaw = vi.fn();
const mockFindMany = vi.fn();

vi.mock("@/server/db", () => ({
  getDb: async () => ({
    $queryRaw: mockQueryRaw,
    financialIntegrityIssue: { findMany: mockFindMany },
  }),
}));

function flattenSql(sql: Prisma.Sql): { sql: string; values: unknown[] } {
  const values: unknown[] = [];
  function walk(s: Prisma.Sql): string {
    let result = "";
    for (let i = 0; i < s.strings.length; i++) {
      result += s.strings[i];
      if (i < s.values.length) {
        const val = s.values[i];
        if (val && typeof val === "object" && "strings" in val) {
          result += walk(val as Prisma.Sql);
        } else {
          values.push(val);
          result += "?";
        }
      }
    }
    return result;
  }
  return { sql: walk(sql), values };
}

import { listReconciliationIssues } from "../repositories/reconciliation.repository";

const BASE = { organizationId: "org-1", page: 1, pageSize: 20 } as const;

beforeEach(() => {
  vi.clearAllMocks();
  mockFindMany.mockResolvedValue([]);
});

function rawRow(overrides: Partial<{
  issueType: string;
  severity: string;
  entityType: string;
  entityId: string;
  entityReference: string;
  expectedAmount: number;
  actualAmount: number;
  difference: number;
  occurredAt: Date;
}> = {}) {
  return {
    issueType: "MISSING_PAYMENT_RECEIVED",
    severity: "HIGH",
    entityType: "Payment",
    entityId: "pay-1",
    entityReference: "PAY-001",
    expectedAmount: 1000,
    actualAmount: 0,
    difference: 1000,
    occurredAt: new Date("2026-05-01"),
    ...overrides,
  };
}

function queueQueryRaw(rows: unknown[], total: number) {
  mockQueryRaw.mockResolvedValueOnce(rows).mockResolvedValueOnce([{ total: BigInt(total) }]);
}

// ---------------------------------------------------------------------------
// 1. Missing PAYMENT_RECEIVED
// ---------------------------------------------------------------------------

describe("listReconciliationIssues — missing PAYMENT_RECEIVED (test 1)", () => {
  it("detects a confirmed payment with no PAYMENT_RECEIVED ledger entry", async () => {
    queueQueryRaw([rawRow()], 1);

    const { rows, total } = await listReconciliationIssues({ ...BASE, issueType: "MISSING_PAYMENT_RECEIVED" });

    expect(total).toBe(1);
    expect(rows).toHaveLength(1);
    expect(rows[0].issueType).toBe("MISSING_PAYMENT_RECEIVED");
    expect(rows[0].severity).toBe("HIGH");
    expect(rows[0].difference).toBe(1000);

    const { sql } = flattenSql(mockQueryRaw.mock.calls[0][0]);
    expect(sql).toContain("status = 'CONFIRMED'");
    expect(sql).toContain("PAYMENT_RECEIVED");
    expect(sql).toContain("NOT EXISTS");
    // No stored-issue lookup for this check type — only the 2 listing queries.
    expect(mockFindMany).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// 2. Missing REFUND_DISBURSED
// ---------------------------------------------------------------------------

describe("listReconciliationIssues — missing REFUND_DISBURSED (test 2)", () => {
  it("detects a completed refund with no REFUND_DISBURSED ledger entry", async () => {
    queueQueryRaw(
      [rawRow({ issueType: "MISSING_REFUND_DISBURSED", entityType: "Refund", entityId: "ref-1", entityReference: "REF-001" })],
      1
    );

    const { rows } = await listReconciliationIssues({ ...BASE, issueType: "MISSING_REFUND_DISBURSED" });

    expect(rows[0].issueType).toBe("MISSING_REFUND_DISBURSED");
    expect(rows[0].entityType).toBe("Refund");

    const { sql } = flattenSql(mockQueryRaw.mock.calls[0][0]);
    expect(sql).toContain("status = 'COMPLETED'");
    expect(sql).toContain("REFUND_DISBURSED");
    expect(sql).toContain("FROM refunds r");
    expect(sql).toContain("NOT EXISTS");
  });
});

// ---------------------------------------------------------------------------
// 3. Missing RECEIPT_ISSUED
// ---------------------------------------------------------------------------

describe("listReconciliationIssues — missing RECEIPT_ISSUED (test 3)", () => {
  it("detects an issued receipt with no RECEIPT_ISSUED ledger entry", async () => {
    queueQueryRaw(
      [rawRow({ issueType: "MISSING_RECEIPT_ISSUED", entityType: "Receipt", entityId: "rec-1", entityReference: "REC-001" })],
      1
    );

    const { rows } = await listReconciliationIssues({ ...BASE, issueType: "MISSING_RECEIPT_ISSUED" });

    expect(rows[0].issueType).toBe("MISSING_RECEIPT_ISSUED");

    const { sql } = flattenSql(mockQueryRaw.mock.calls[0][0]);
    expect(sql).toContain("FROM receipts rec");
    expect(sql).toContain("status <> 'CANCELLED'");
    expect(sql).toContain("RECEIPT_ISSUED");
    expect(sql).toContain("NOT EXISTS");
  });
});

// ---------------------------------------------------------------------------
// 4. Duplicate ledger entries
// ---------------------------------------------------------------------------

describe("listReconciliationIssues — duplicate ledger entries (test 4)", () => {
  it("detects a duplicated ledger entry and enriches it from a stored FinancialIntegrityIssue", async () => {
    const dupRow = rawRow({
      issueType: "DUPLICATE_LEDGER_ENTRY",
      severity: "HIGH",
      entityType: "FinancialTransaction",
      entityId: "Payment:pay-1:PAYMENT_RECEIVED",
      entityReference: "Payment pay-1",
      expectedAmount: 1,
      actualAmount: 3,
      difference: 2,
    });
    queueQueryRaw([dupRow], 1);
    mockFindMany.mockResolvedValueOnce([
      {
        entityType: "FinancialTransaction",
        entityId: "Payment:pay-1:PAYMENT_RECEIVED",
        detectedAt: new Date("2026-04-01"),
        status: "OPEN",
        id: "issue-1",
      },
    ]);

    const { rows } = await listReconciliationIssues({ ...BASE, issueType: "DUPLICATE_LEDGER_ENTRY" });

    expect(rows[0].issueType).toBe("DUPLICATE_LEDGER_ENTRY");
    expect(rows[0].difference).toBe(2);
    // "Use existing FinancialIntegrityIssue if available" — detectedAt comes from the stored issue.
    expect(rows[0].detectedAt).toEqual(new Date("2026-04-01"));
    expect(rows[0].integrityIssueId).toBe("issue-1");

    const { sql } = flattenSql(mockQueryRaw.mock.calls[0][0]);
    expect(sql).toContain("GROUP BY ft.sourceType, ft.sourceId, ft.transactionType");
    expect(sql).toContain("HAVING COUNT(*) > 1");

    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          organizationId: "org-1",
          OR: [{ entityType: "FinancialTransaction", entityId: "Payment:pay-1:PAYMENT_RECEIVED", checkName: "ledger.duplicate_entry" }],
        }),
      })
    );
  });

  it("falls back to the request timestamp when no stored issue matches", async () => {
    const before = new Date();
    queueQueryRaw(
      [rawRow({ issueType: "DUPLICATE_LEDGER_ENTRY", entityType: "FinancialTransaction", entityId: "x:y:z" })],
      1
    );
    mockFindMany.mockResolvedValueOnce([]);

    const { rows } = await listReconciliationIssues({ ...BASE, issueType: "DUPLICATE_LEDGER_ENTRY" });
    const after = new Date();

    expect(rows[0].integrityIssueId).toBeNull();
    expect(rows[0].detectedAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
    expect(rows[0].detectedAt.getTime()).toBeLessThanOrEqual(after.getTime());
  });
});

// ---------------------------------------------------------------------------
// 5. Invoice paidAmount mismatch
// ---------------------------------------------------------------------------

describe("listReconciliationIssues — invoice paidAmount mismatch (test 5)", () => {
  it("detects Invoice.paidAmount not matching SUM(PaymentAllocation.amount)", async () => {
    queueQueryRaw(
      [
        rawRow({
          issueType: "INVOICE_PAID_AMOUNT_MISMATCH",
          severity: "CRITICAL",
          entityType: "Invoice",
          entityId: "inv-1",
          entityReference: "INV-001",
          expectedAmount: 1000,
          actualAmount: 600,
          difference: 400,
        }),
      ],
      1
    );

    const { rows } = await listReconciliationIssues({ ...BASE, issueType: "INVOICE_PAID_AMOUNT_MISMATCH" });

    expect(rows[0].severity).toBe("CRITICAL");
    expect(rows[0].difference).toBe(400);

    const { sql } = flattenSql(mockQueryRaw.mock.calls[0][0]);
    expect(sql).toContain("LEFT JOIN payment_allocations pa ON pa.invoiceId = i.id");
    expect(sql).toContain("GROUP BY i.id, i.invoiceNumber, i.paidAmount, i.issueDate");
    expect(sql).toContain("HAVING ABS(");
  });
});

// ---------------------------------------------------------------------------
// 6. Orphan ledger entries
// ---------------------------------------------------------------------------

describe("listReconciliationIssues — orphan ledger entries (test 6)", () => {
  it("detects a ledger entry whose source record no longer exists", async () => {
    queueQueryRaw(
      [
        rawRow({
          issueType: "ORPHAN_LEDGER_ENTRY",
          severity: "CRITICAL",
          entityType: "FinancialTransaction",
          entityId: "ft-1",
          entityReference: "TXN-001",
        }),
      ],
      1
    );

    const { rows } = await listReconciliationIssues({ ...BASE, issueType: "ORPHAN_LEDGER_ENTRY" });

    expect(rows[0].issueType).toBe("ORPHAN_LEDGER_ENTRY");
    expect(rows[0].severity).toBe("CRITICAL");

    const { sql } = flattenSql(mockQueryRaw.mock.calls[0][0]);
    expect(sql).toContain("FROM financial_transactions ft");
    expect(sql).toContain("ft.sourceType = 'Payment'");
    expect(sql).toContain("NOT EXISTS (SELECT 1 FROM payments p WHERE p.id = ft.sourceId");
    expect(sql).toContain("ft.sourceType = 'Refund'");
    expect(sql).toContain("ft.sourceType = 'Receipt'");
    expect(sql).toContain("ft.sourceType = 'Invoice'");
  });
});

// ---------------------------------------------------------------------------
// 7. Tenant isolation
// ---------------------------------------------------------------------------

describe("listReconciliationIssues — tenant isolation (test 7)", () => {
  it("binds organizationId as a parameter on every active check, never interpolated", async () => {
    queueQueryRaw([], 0);

    await listReconciliationIssues({ ...BASE, organizationId: "org-secret", issueType: "MISSING_PAYMENT_RECEIVED" });

    const { sql, values } = flattenSql(mockQueryRaw.mock.calls[0][0]);
    expect(sql).not.toContain("org-secret");
    expect(values).toContain("org-secret");
  });

  it("scopes orphan/duplicate ledger checks by organizationId too", async () => {
    queueQueryRaw([], 0);

    await listReconciliationIssues({ ...BASE, organizationId: "org-secret", issueType: "ORPHAN_LEDGER_ENTRY" });

    const { sql, values } = flattenSql(mockQueryRaw.mock.calls[0][0]);
    expect(sql).not.toContain("org-secret");
    expect(values).toContain("org-secret");
  });
});

// ---------------------------------------------------------------------------
// 8. Pagination
// ---------------------------------------------------------------------------

describe("listReconciliationIssues — pagination (test 8)", () => {
  it("uses OFFSET / FETCH NEXT with (page-1)*pageSize bound as a parameter", async () => {
    queueQueryRaw([], 100);

    await listReconciliationIssues({ organizationId: "org-1", page: 3, pageSize: 10, issueType: "MISSING_PAYMENT_RECEIVED" });

    const { sql, values } = flattenSql(mockQueryRaw.mock.calls[0][0]);
    expect(sql).toContain("OFFSET");
    expect(sql).toContain("ROWS FETCH NEXT");
    expect(values).toContain(20); // skip = (3-1)*10
    expect(values).toContain(10); // pageSize
  });

  it("calls $queryRaw exactly twice (rows + count) regardless of page", async () => {
    queueQueryRaw([], 0);

    await listReconciliationIssues({ ...BASE, issueType: "MISSING_PAYMENT_RECEIVED" });

    expect(mockQueryRaw).toHaveBeenCalledTimes(2);
  });
});

// ---------------------------------------------------------------------------
// 9. CSV export uses the same filtered query
// ---------------------------------------------------------------------------

describe("listReconciliationIssues — CSV export uses the same filters (test 9)", () => {
  it("applies branch, student, date range, and issueType together — the exact function the export route calls", async () => {
    queueQueryRaw([], 0);

    await listReconciliationIssues({
      organizationId: "org-1",
      branchId: "branch-1",
      studentId: "student-1",
      dateFrom: "2026-01-01",
      dateTo: "2026-01-31",
      issueType: "MISSING_PAYMENT_RECEIVED",
      page: 1,
      pageSize: 500, // export uses a large batch size, same code path
    });

    const { sql, values } = flattenSql(mockQueryRaw.mock.calls[0][0]);
    expect(sql).toContain("p.branchId =");
    expect(sql).toContain("p.studentId =");
    expect(sql).toContain("p.paymentDate >=");
    expect(sql).toContain("p.paymentDate <=");
    expect(values).toContain("branch-1");
    expect(values).toContain("student-1");
  });

  it("skips checks entirely when severity filters out every issueType (no query executed)", async () => {
    const { rows, total } = await listReconciliationIssues({ ...BASE, severity: "LOW" });

    expect(rows).toEqual([]);
    expect(total).toBe(0);
    expect(mockQueryRaw).not.toHaveBeenCalled();
  });
});
