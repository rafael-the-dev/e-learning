import { describe, it, expect, vi, beforeEach } from "vitest";
import { Prisma } from "@prisma/client";

const mockQueryRaw = vi.fn();

vi.mock("@/server/db", () => ({
  getDb: async () => ({ $queryRaw: mockQueryRaw }),
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

import { getInvoiceMonthlyAggregates, getRefundMonthlyAggregates } from "../repositories/revenue-trend.repository";

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// 1. Monthly SQL grouping
// ---------------------------------------------------------------------------

describe("getInvoiceMonthlyAggregates — monthly SQL grouping (test 1)", () => {
  it("groups by CONVERT(VARCHAR(7), issueDate) in a single aggregated query", async () => {
    mockQueryRaw.mockResolvedValueOnce([{ month: "2026-05", invoiced: 1000, collected: 600, outstanding: 400 }]);

    const rows = await getInvoiceMonthlyAggregates({ organizationId: "org-1" });

    expect(rows).toEqual([{ month: "2026-05", invoiced: 1000, collected: 600, outstanding: 400 }]);
    expect(mockQueryRaw).toHaveBeenCalledTimes(1);

    const { sql } = flattenSql(mockQueryRaw.mock.calls[0][0]);
    expect(sql).toContain("GROUP BY CONVERT(VARCHAR(7)");
    expect(sql).toContain("SUM(");
  });
});

// ---------------------------------------------------------------------------
// 3. Invoiced excludes CANCELLED
// ---------------------------------------------------------------------------

describe("getInvoiceMonthlyAggregates — excludes CANCELLED (test 3)", () => {
  it("filters out CANCELLED invoices in the WHERE clause", async () => {
    mockQueryRaw.mockResolvedValueOnce([]);

    await getInvoiceMonthlyAggregates({ organizationId: "org-1" });

    const { sql } = flattenSql(mockQueryRaw.mock.calls[0][0]);
    expect(sql).toContain("i.status <> 'CANCELLED'");
  });
});

// ---------------------------------------------------------------------------
// 4. Refunded includes COMPLETED only
// ---------------------------------------------------------------------------

describe("getRefundMonthlyAggregates — COMPLETED only (test 4)", () => {
  it("filters refunds to status = COMPLETED, grouped by completedAt", async () => {
    mockQueryRaw.mockResolvedValueOnce([{ month: "2026-05", refunded: 250 }]);

    const rows = await getRefundMonthlyAggregates({ organizationId: "org-1" });

    expect(rows).toEqual([{ month: "2026-05", refunded: 250 }]);

    const { sql } = flattenSql(mockQueryRaw.mock.calls[0][0]);
    expect(sql).toContain("r.status = 'COMPLETED'");
    expect(sql).toContain("CONVERT(VARCHAR(7), r.completedAt");
  });
});

// ---------------------------------------------------------------------------
// 7. Branch / course filters
// ---------------------------------------------------------------------------

describe("branch/course filters (test 7)", () => {
  it("applies branchId directly and courseId via an EXISTS enrollment join for Invoiced/Collected", async () => {
    mockQueryRaw.mockResolvedValueOnce([]);

    await getInvoiceMonthlyAggregates({ organizationId: "org-1", branchId: "branch-9", courseId: "course-1" });

    const { sql, values } = flattenSql(mockQueryRaw.mock.calls[0][0]);
    expect(sql).toContain("i.branchId =");
    expect(sql).toContain("EXISTS");
    expect(sql).toContain("e.courseId =");
    expect(values).toContain("branch-9");
    expect(values).toContain("course-1");
  });

  it("applies branchId and courseId to Refunded too (via Refund.branchId / Refund.enrollmentId)", async () => {
    mockQueryRaw.mockResolvedValueOnce([]);

    await getRefundMonthlyAggregates({ organizationId: "org-1", branchId: "branch-9", courseId: "course-1" });

    const { sql, values } = flattenSql(mockQueryRaw.mock.calls[0][0]);
    expect(sql).toContain("r.branchId =");
    expect(sql).toContain("e.courseId =");
    expect(values).toContain("branch-9");
    expect(values).toContain("course-1");
  });
});

// ---------------------------------------------------------------------------
// 8. Tenant isolation
// ---------------------------------------------------------------------------

describe("tenant isolation (test 8)", () => {
  it("binds organizationId as a parameter, never interpolated, for Invoiced/Collected", async () => {
    mockQueryRaw.mockResolvedValueOnce([]);

    await getInvoiceMonthlyAggregates({ organizationId: "org-secret" });

    const { sql, values } = flattenSql(mockQueryRaw.mock.calls[0][0]);
    expect(sql).not.toContain("org-secret");
    expect(values).toContain("org-secret");
  });

  it("binds organizationId as a parameter, never interpolated, for Refunded", async () => {
    mockQueryRaw.mockResolvedValueOnce([]);

    await getRefundMonthlyAggregates({ organizationId: "org-secret" });

    const { sql, values } = flattenSql(mockQueryRaw.mock.calls[0][0]);
    expect(sql).not.toContain("org-secret");
    expect(values).toContain("org-secret");
  });
});

// ---------------------------------------------------------------------------
// 10. No full-table raw grouping
// ---------------------------------------------------------------------------

describe("no full-table raw grouping (test 10)", () => {
  it("returns one pre-aggregated row per month via SQL SUM/GROUP BY, never raw invoice rows", async () => {
    mockQueryRaw.mockResolvedValueOnce([
      { month: "2026-04", invoiced: 5000, collected: 3000, outstanding: 2000 },
      { month: "2026-05", invoiced: 4000, collected: 4000, outstanding: 0 },
    ]);

    const rows = await getInvoiceMonthlyAggregates({ organizationId: "org-1" });

    expect(mockQueryRaw).toHaveBeenCalledTimes(1);
    expect(rows).toHaveLength(2);
    expect(Object.keys(rows[0]).sort()).toEqual(["collected", "invoiced", "month", "outstanding"]);
  });
});
