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

import { getInvoiceMonthlyTrend } from "../repositories/invoice-dashboard.repository";
import { getPaymentMonthlyTrend } from "../repositories/payment-dashboard.repository";

beforeEach(() => {
  vi.clearAllMocks();
});

// ────────────────────────────────────────────────────────────────────────────
describe("getInvoiceMonthlyTrend", () => {
  it("uses SQL GROUP BY instead of loading raw invoice rows (test 1 & 2)", async () => {
    mockQueryRaw.mockResolvedValue([{ month: "2026-06", count: 2, totalAmount: 500 }]);
    await getInvoiceMonthlyTrend("org-1", 6);
    const { sql } = flattenSql(mockQueryRaw.mock.calls[0][0] as Prisma.Sql);
    expect(sql).toContain("GROUP BY");
    expect(sql).toContain("CONVERT(VARCHAR(7)");
  });

  it("zero-fills months with no SQL rows (test 3)", async () => {
    // Only one of the 6 requested months has data.
    mockQueryRaw.mockResolvedValue([
      { month: new Date().toISOString().slice(0, 7), count: 2, totalAmount: 500 },
    ]);
    const result = await getInvoiceMonthlyTrend("org-1", 6);
    expect(result).toHaveLength(6);
    const zeroFilled = result.filter((r) => r.count === 0 && r.totalAmount === 0);
    expect(zeroFilled.length).toBe(5);
  });

  it("returns months in chronological order (test 4)", async () => {
    mockQueryRaw.mockResolvedValue([]);
    const result = await getInvoiceMonthlyTrend("org-1", 6);
    const months = result.map((r) => r.month);
    const sorted = [...months].sort();
    expect(months).toEqual(sorted);
  });

  it("excludes CANCELLED and soft-deleted invoices before aggregation (test 5)", async () => {
    mockQueryRaw.mockResolvedValue([]);
    await getInvoiceMonthlyTrend("org-1", 6);
    const { sql } = flattenSql(mockQueryRaw.mock.calls[0][0] as Prisma.Sql);
    const whereIdx = sql.indexOf("WHERE");
    const groupIdx = sql.indexOf("GROUP BY");
    expect(groupIdx).toBeGreaterThan(whereIdx);
    expect(sql).toContain("status <> 'CANCELLED'");
    expect(sql).toContain("deletedAt IS NULL");
  });

  it("binds organizationId as a parameter, not interpolated (test 6)", async () => {
    mockQueryRaw.mockResolvedValue([]);
    await getInvoiceMonthlyTrend("org-secret", 6);
    const { sql, values } = flattenSql(mockQueryRaw.mock.calls[0][0] as Prisma.Sql);
    expect(sql).not.toContain("org-secret");
    expect(values).toContain("org-secret");
  });
});

// ────────────────────────────────────────────────────────────────────────────
describe("getPaymentMonthlyTrend", () => {
  it("uses SQL GROUP BY instead of loading raw payment rows (test 1 & 2)", async () => {
    mockQueryRaw.mockResolvedValue([{ month: "2026-06", count: 2, totalAmount: 500 }]);
    await getPaymentMonthlyTrend("org-1", 6);
    const { sql } = flattenSql(mockQueryRaw.mock.calls[0][0] as Prisma.Sql);
    expect(sql).toContain("GROUP BY");
    expect(sql).toContain("CONVERT(VARCHAR(7)");
  });

  it("returns months in the SQL-provided (ascending) order (test 4)", async () => {
    mockQueryRaw.mockResolvedValue([
      { month: "2026-01", count: 1, totalAmount: 100 },
      { month: "2026-02", count: 2, totalAmount: 200 },
    ]);
    const result = await getPaymentMonthlyTrend("org-1", 6);
    expect(result.map((r) => r.month)).toEqual(["2026-01", "2026-02"]);
    const { sql } = flattenSql(mockQueryRaw.mock.calls[0][0] as Prisma.Sql);
    expect(sql).toContain("ORDER BY month ASC");
  });

  it("restricts to CONFIRMED payments (test 8)", async () => {
    mockQueryRaw.mockResolvedValue([]);
    await getPaymentMonthlyTrend("org-1", 6);
    const { sql } = flattenSql(mockQueryRaw.mock.calls[0][0] as Prisma.Sql);
    expect(sql).toContain("status = 'CONFIRMED'");
  });

  it("binds organizationId as a parameter, not interpolated (test 6)", async () => {
    mockQueryRaw.mockResolvedValue([]);
    await getPaymentMonthlyTrend("org-secret", 6);
    const { sql, values } = flattenSql(mockQueryRaw.mock.calls[0][0] as Prisma.Sql);
    expect(sql).not.toContain("org-secret");
    expect(values).toContain("org-secret");
  });
});
