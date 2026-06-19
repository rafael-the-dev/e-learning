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

function queueRow(row: Record<string, unknown>) {
  mockQueryRaw.mockResolvedValueOnce([row]);
}

function rawReconciliationRow(overrides: Partial<{
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
    issueType: "ORPHAN_LEDGER_ENTRY",
    severity: "CRITICAL",
    entityType: "FinancialTransaction",
    entityId: "ft-1",
    entityReference: "TXN-001",
    expectedAmount: 100,
    actualAmount: 0,
    difference: 100,
    occurredAt: new Date("2026-05-01"),
    ...overrides,
  };
}

function queueReconciliationListing(rows: unknown[], total: number) {
  mockQueryRaw.mockResolvedValueOnce(rows).mockResolvedValueOnce([{ total: BigInt(total) }]);
}

import { getDb } from "@/server/db";
import {
  getGrossInvoiced,
  getGrossCollected,
  getNetCashTrend,
  getWalletLiabilitySummary,
  getRefundExposureSummary,
  getIntegrityCounts,
  getIntegrityWatchlist,
  getReconciliationWatchlist,
} from "../repositories/closing.repository";

beforeEach(() => {
  vi.clearAllMocks();
  mockFindMany.mockResolvedValue([]);
});

// ---------------------------------------------------------------------------
// 2. Wallet liability counts only positive balances
// ---------------------------------------------------------------------------

describe("getWalletLiabilitySummary — positive balances only (test 2)", () => {
  it("sums/ranks balances using a balance > 0 condition and never a balance < 0 one", async () => {
    queueRow({ totalLiability: 800, studentsWithCredit: 1, largestBalance: 800 });

    const result = await getWalletLiabilitySummary({ organizationId: "org-1" });

    expect(result).toEqual({ totalLiability: 800, studentsWithCredit: 1, largestBalance: 800 });

    const { sql } = flattenSql(mockQueryRaw.mock.calls[0][0]);
    expect(sql).toContain("WHEN balance > 0");
    expect(sql).not.toContain("balance < 0");
  });
});

// ---------------------------------------------------------------------------
// 3. Refund exposure sums REQUESTED + APPROVED
// ---------------------------------------------------------------------------

describe("getRefundExposureSummary — sums REQUESTED + APPROVED (test 3)", () => {
  it("combines both statuses into pendingAmount while keeping per-status counts separate", async () => {
    mockQueryRaw.mockResolvedValueOnce([
      { status: "REQUESTED", cnt: 2, amt: 1000 },
      { status: "APPROVED", cnt: 1, amt: 500 },
    ]);

    const result = await getRefundExposureSummary({ organizationId: "org-1" });

    expect(result).toEqual({ pendingAmount: 1500, requestedCount: 2, approvedCount: 1 });

    const { sql } = flattenSql(mockQueryRaw.mock.calls[0][0]);
    expect(sql).toContain("IN ('REQUESTED', 'APPROVED')");
  });
});

// ---------------------------------------------------------------------------
// 4. Critical issue count correct
// ---------------------------------------------------------------------------

describe("getIntegrityCounts — critical issue count correct (test 4)", () => {
  it("maps grouped severity counts and the wallet-mismatch count independently", async () => {
    mockQueryRaw
      .mockResolvedValueOnce([{ severity: "CRITICAL", cnt: 3 }, { severity: "HIGH", cnt: 1 }])
      .mockResolvedValueOnce([{ cnt: 1 }]);

    const result = await getIntegrityCounts({ organizationId: "org-1" });

    expect(result).toEqual({ openCritical: 3, openHigh: 1, openMedium: 0, openLow: 0, walletMismatchCount: 1 });

    const { sql } = flattenSql(mockQueryRaw.mock.calls[0][0]);
    expect(sql).toContain("status = 'OPEN'");
  });
});

// ---------------------------------------------------------------------------
// 7. Net cash trend uses SQL aggregation
// ---------------------------------------------------------------------------

describe("getNetCashTrend — uses SQL aggregation (test 7)", () => {
  it("delegates to a single GROUP BY month query and derives net per point", async () => {
    mockQueryRaw.mockResolvedValueOnce([{ month: "2026-04", cashIn: 1000, cashOut: 200 }]);

    const trend = await getNetCashTrend({ organizationId: "org-1" });

    expect(trend).toEqual([{ month: "2026-04", cashIn: 1000, cashOut: 200, net: 800 }]);

    const { sql } = flattenSql(mockQueryRaw.mock.calls[0][0]);
    expect(sql).toContain("GROUP BY");
    expect(mockFindMany).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// 8. Watchlist includes critical integrity issues
// ---------------------------------------------------------------------------

describe("getIntegrityWatchlist — includes critical integrity issues (test 8)", () => {
  it("maps OPEN CRITICAL integrity issues into INTEGRITY_CRITICAL watchlist items", async () => {
    mockQueryRaw.mockResolvedValueOnce([
      { id: "iss-1", entityType: "Invoice", entityId: "inv-1", description: "Fatura desbalanceada", detectedAt: new Date("2026-05-01") },
    ]);
    const db = await getDb();

    const items = await getIntegrityWatchlist(db, { organizationId: "org-1" }, "CRITICAL", 5);

    expect(items).toHaveLength(1);
    expect(items[0].category).toBe("INTEGRITY_CRITICAL");
    expect(items[0].recommendedAction).toBe("VIEW_INTEGRITY");
    expect(items[0].entityReference).toBe("inv-1");

    const { sql } = flattenSql(mockQueryRaw.mock.calls[0][0]);
    expect(sql).toContain("severity = ?");
    expect(sql).toContain("status = 'OPEN'");
  });
});

// ---------------------------------------------------------------------------
// 9. Watchlist includes reconciliation mismatches
// ---------------------------------------------------------------------------

describe("getReconciliationWatchlist — includes reconciliation mismatches (test 9)", () => {
  it("maps CRITICAL reconciliation issues into RECONCILIATION_MISMATCH watchlist items", async () => {
    queueReconciliationListing([rawReconciliationRow()], 1);

    const items = await getReconciliationWatchlist({ organizationId: "org-1" }, 5);

    expect(items).toHaveLength(1);
    expect(items[0].category).toBe("RECONCILIATION_MISMATCH");
    expect(items[0].recommendedAction).toBe("VIEW_RECONCILIATION");
    expect(items[0].entityReference).toBe("TXN-001");
  });
});

// ---------------------------------------------------------------------------
// 10. Date range filters applied
// ---------------------------------------------------------------------------

describe("date range filters applied (test 10)", () => {
  it("applies dateFrom/dateTo to detectedAt for Integrity Counts", async () => {
    mockQueryRaw.mockResolvedValueOnce([{ severity: "CRITICAL", cnt: 1 }]).mockResolvedValueOnce([{ cnt: 0 }]);

    await getIntegrityCounts({ organizationId: "org-1", dateFrom: "2026-01-01", dateTo: "2026-01-31" });

    const { sql } = flattenSql(mockQueryRaw.mock.calls[0][0]);
    expect(sql).toContain("detectedAt >=");
    expect(sql).toContain("detectedAt <=");
  });

  it("applies dateFrom/dateTo to issueDate for Gross Invoiced", async () => {
    queueRow({ total: 0 });

    await getGrossInvoiced({ organizationId: "org-1", dateFrom: "2026-01-01", dateTo: "2026-01-31" });

    const { sql } = flattenSql(mockQueryRaw.mock.calls[0][0]);
    expect(sql).toContain("i.issueDate >=");
    expect(sql).toContain("i.issueDate <=");
  });
});

// ---------------------------------------------------------------------------
// 11. Branch filter applied where supported
// ---------------------------------------------------------------------------

describe("branch filter applied where supported (test 11)", () => {
  it("applies branchId to Gross Invoiced (Invoice has a branchId column)", async () => {
    queueRow({ total: 500 });

    await getGrossInvoiced({ organizationId: "org-1", branchId: "branch-9" });

    const { sql, values } = flattenSql(mockQueryRaw.mock.calls[0][0]);
    expect(sql).toContain("i.branchId =");
    expect(values).toContain("branch-9");
  });

  it("applies branchId to Gross Collected (Payment has a branchId column)", async () => {
    queueRow({ total: 500 });

    await getGrossCollected({ organizationId: "org-1", branchId: "branch-9" });

    const { sql, values } = flattenSql(mockQueryRaw.mock.calls[0][0]);
    expect(sql).toContain("p.branchId =");
    expect(values).toContain("branch-9");
  });

  it("does not apply branchId to the Net Cash Trend (FinancialTransaction has no branchId column)", async () => {
    mockQueryRaw.mockResolvedValueOnce([]);

    await getNetCashTrend({ organizationId: "org-1", branchId: "branch-9" });

    const { sql, values } = flattenSql(mockQueryRaw.mock.calls[0][0]);
    expect(sql).not.toContain("branchId");
    expect(values).not.toContain("branch-9");
  });
});

// ---------------------------------------------------------------------------
// 12. Tenant isolation
// ---------------------------------------------------------------------------

describe("tenant isolation (test 12)", () => {
  it("binds organizationId as a parameter, never interpolated, for Gross Invoiced", async () => {
    queueRow({ total: 0 });

    await getGrossInvoiced({ organizationId: "org-secret" });

    const { sql, values } = flattenSql(mockQueryRaw.mock.calls[0][0]);
    expect(sql).not.toContain("org-secret");
    expect(values).toContain("org-secret");
  });

  it("binds organizationId as a parameter for Wallet Liability", async () => {
    queueRow({ totalLiability: 0, studentsWithCredit: 0, largestBalance: 0 });

    await getWalletLiabilitySummary({ organizationId: "org-secret" });

    const { sql, values } = flattenSql(mockQueryRaw.mock.calls[0][0]);
    expect(sql).not.toContain("org-secret");
    expect(values).toContain("org-secret");
  });
});

// ---------------------------------------------------------------------------
// 14. No full-table raw grouping
// ---------------------------------------------------------------------------

describe("no full-table raw grouping (test 14)", () => {
  it("Wallet Liability returns one pre-aggregated row via SQL, not per-transaction rows fetched into JS", async () => {
    queueRow({ totalLiability: 1500, studentsWithCredit: 2, largestBalance: 1000 });

    await getWalletLiabilitySummary({ organizationId: "org-1" });

    expect(mockQueryRaw).toHaveBeenCalledTimes(1);
    const { sql } = flattenSql(mockQueryRaw.mock.calls[0][0]);
    expect(sql).toContain("SUM(");
    expect(sql).toContain("GROUP BY");
  });

  it("Integrity Counts aggregates via GROUP BY severity, not a per-issue findMany", async () => {
    mockQueryRaw.mockResolvedValueOnce([{ severity: "CRITICAL", cnt: 2 }]).mockResolvedValueOnce([{ cnt: 0 }]);

    await getIntegrityCounts({ organizationId: "org-1" });

    const { sql } = flattenSql(mockQueryRaw.mock.calls[0][0]);
    expect(sql).toContain("GROUP BY severity");
    expect(mockFindMany).not.toHaveBeenCalled();
  });
});
