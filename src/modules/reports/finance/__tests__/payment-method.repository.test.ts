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

import {
  getPaymentMethodRows,
  getPaymentMethodMonthlyTrend,
  getPaymentMethodByBranch,
  hasCriticalPaymentMethodIntegrityIssue,
  computePaymentMethodKPIs,
} from "../repositories/payment-method.repository";
import type { PaymentMethodMixFilters, PaymentMethodMixRow } from "../types";

const BASE: PaymentMethodMixFilters = { organizationId: "org-1" };

beforeEach(() => {
  vi.clearAllMocks();
});

function rawRow(overrides: Partial<{
  method: string; totalAmount: number; splitCount: number; paymentCount: number; refundEstimate: number;
}> = {}) {
  return {
    method: "CASH",
    totalAmount: 1000,
    splitCount: 4,
    paymentCount: 3,
    refundEstimate: 0,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// 1. method totals use split.amount, not payment.totalAmount
// ---------------------------------------------------------------------------

describe("getPaymentMethodRows", () => {
  it("(test 1) aggregates SUM(PaymentSplit.amount), never Payment.totalAmount", async () => {
    mockQueryRaw.mockResolvedValueOnce([rawRow()]);
    await getPaymentMethodRows(BASE);

    const { sql } = flattenSql(mockQueryRaw.mock.calls[0][0]);
    expect(sql).toContain("SUM(CAST(ps.amount AS FLOAT)) AS totalAmount");
    expect(sql).not.toMatch(/SUM\(CAST\(p\.totalAmount AS FLOAT\)\) AS totalAmount/);
  });

  it("(test 2) a payment split across two methods contributes only its own split amount to each method", async () => {
    // One $1000 payment split 500/500 across CASH and MPESA. The old bug
    // would have summed the full payment.totalAmount under BOTH methods
    // (1000 + 1000 = 2000); the SQL-side GROUP BY method must instead
    // produce exactly the per-method split amounts.
    mockQueryRaw.mockResolvedValueOnce([
      rawRow({ method: "CASH", totalAmount: 500, splitCount: 1, paymentCount: 1 }),
      rawRow({ method: "MPESA", totalAmount: 500, splitCount: 1, paymentCount: 1 }),
    ]);

    const rows = await getPaymentMethodRows(BASE);

    expect(rows).toHaveLength(2);
    expect(rows.find((r) => r.method === "CASH")?.totalAmount).toBe(500);
    expect(rows.find((r) => r.method === "MPESA")?.totalAmount).toBe(500);
    const grandTotal = rows.reduce((s, r) => s + r.totalAmount, 0);
    expect(grandTotal).toBe(1000); // not 2000
  });

  it("(test 3) excludes PENDING and CANCELLED payments by default", async () => {
    mockQueryRaw.mockResolvedValueOnce([rawRow()]);
    await getPaymentMethodRows(BASE);

    const { sql } = flattenSql(mockQueryRaw.mock.calls[0][0]);
    expect(sql).toContain("p.status IN ('CONFIRMED', 'PARTIALLY_REFUNDED', 'REFUNDED')");
  });

  it("(test 3b) ignores an attempt to filter paymentStatus to PENDING or CANCELLED — hard rule, no override", async () => {
    mockQueryRaw.mockResolvedValueOnce([rawRow()]);
    await getPaymentMethodRows({ ...BASE, paymentStatus: "CANCELLED" });

    const { sql } = flattenSql(mockQueryRaw.mock.calls[0][0]);
    expect(sql).toContain("p.status IN ('CONFIRMED', 'PARTIALLY_REFUNDED', 'REFUNDED')");
    expect(sql).not.toContain("p.status = ?");
  });

  it("(test 4) includes PARTIALLY_REFUNDED and REFUNDED as gross received by default", async () => {
    mockQueryRaw.mockResolvedValueOnce([rawRow()]);
    await getPaymentMethodRows(BASE);

    const { sql } = flattenSql(mockQueryRaw.mock.calls[0][0]);
    expect(sql).toMatch(/CONFIRMED.*PARTIALLY_REFUNDED.*REFUNDED/);
  });

  it("narrows to a single allowed paymentStatus when explicitly filtered", async () => {
    mockQueryRaw.mockResolvedValueOnce([rawRow()]);
    await getPaymentMethodRows({ ...BASE, paymentStatus: "REFUNDED" });

    const { sql, values } = flattenSql(mockQueryRaw.mock.calls[0][0]);
    expect(sql).toContain("p.status = ?");
    expect(values).toContain("REFUNDED");
  });

  it("(test 8) applies the course filter via Enrollment.courseId", async () => {
    mockQueryRaw.mockResolvedValueOnce([rawRow()]);
    await getPaymentMethodRows({ ...BASE, courseId: "course-9" });

    const { sql, values } = flattenSql(mockQueryRaw.mock.calls[0][0]);
    expect(sql).toContain("e.courseId = ?");
    expect(values).toContain("course-9");
  });

  it("(test 9) scopes every query to organizationId — tenant isolation", async () => {
    mockQueryRaw.mockResolvedValueOnce([rawRow()]);
    await getPaymentMethodRows(BASE);

    const { sql, values } = flattenSql(mockQueryRaw.mock.calls[0][0]);
    expect(sql).toContain("ps.organizationId = ?");
    expect(values).toContain("org-1");
  });

  it("(test 10) applies the paymentMethod filter consistently — same shape export reuses", async () => {
    mockQueryRaw.mockResolvedValueOnce([rawRow()]);
    await getPaymentMethodRows({ ...BASE, paymentMethod: "MPESA" });

    const { sql, values } = flattenSql(mockQueryRaw.mock.calls[0][0]);
    expect(sql).toContain("ps.method = ?");
    expect(values).toContain("MPESA");
  });

  it("pre-aggregates refunds per payment in a CTE before joining, so split rows are never multiplied", async () => {
    mockQueryRaw.mockResolvedValueOnce([rawRow()]);
    await getPaymentMethodRows(BASE);

    const { sql } = flattenSql(mockQueryRaw.mock.calls[0][0]);
    expect(sql).toContain("WITH PaymentRefunds AS");
    expect(sql).toContain("GROUP BY paymentId");
    expect(sql).toContain("status = 'COMPLETED'");
  });

  it("derives averageAmount, sharePct, and refundAdjustedNet from the SQL-aggregated row set", async () => {
    mockQueryRaw.mockResolvedValueOnce([
      rawRow({ method: "CASH", totalAmount: 800, splitCount: 4, paymentCount: 4, refundEstimate: 100 }),
      rawRow({ method: "MPESA", totalAmount: 200, splitCount: 2, paymentCount: 2, refundEstimate: 0 }),
    ]);

    const rows = await getPaymentMethodRows(BASE);
    const cash = rows.find((r) => r.method === "CASH")!;
    const mpesa = rows.find((r) => r.method === "MPESA")!;

    expect(cash.averageAmount).toBe(200); // 800 / 4
    expect(cash.sharePct).toBe(80); // 800 / 1000 * 100
    expect(cash.refundAdjustedNet).toBe(700); // 800 - 100
    expect(mpesa.sharePct).toBe(20);
    expect(mpesa.refundAdjustedNet).toBe(200);
  });

  it("returns an empty array with no division-by-zero when there is no data", async () => {
    mockQueryRaw.mockResolvedValueOnce([]);
    const rows = await getPaymentMethodRows(BASE);
    expect(rows).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 5. cash dependency formula (+ KPI derivation)
// ---------------------------------------------------------------------------

describe("computePaymentMethodKPIs", () => {
  it("(test 5) computes cashDependencyRate = cashReceived / totalReceived * 100", () => {
    const rows: PaymentMethodMixRow[] = [
      { method: "CASH", totalAmount: 300, splitCount: 3, paymentCount: 3, averageAmount: 100, sharePct: 30, refundAdjustedNet: 300 },
      { method: "MPESA", totalAmount: 700, splitCount: 7, paymentCount: 7, averageAmount: 100, sharePct: 70, refundAdjustedNet: 700 },
    ];
    const kpis = computePaymentMethodKPIs(rows);
    expect(kpis.cashDependencyRate).toBe(30);
    expect(kpis.totalReceived).toBe(1000);
  });

  it("categorizes Digital = MPESA|EMOLA|CARD|POS and Bank = BANK_TRANSFER|CHEQUE, leaving OTHER uncategorized", () => {
    const rows: PaymentMethodMixRow[] = [
      { method: "MPESA", totalAmount: 100, splitCount: 1, paymentCount: 1, averageAmount: 100, sharePct: 0, refundAdjustedNet: 100 },
      { method: "EMOLA", totalAmount: 100, splitCount: 1, paymentCount: 1, averageAmount: 100, sharePct: 0, refundAdjustedNet: 100 },
      { method: "CARD", totalAmount: 100, splitCount: 1, paymentCount: 1, averageAmount: 100, sharePct: 0, refundAdjustedNet: 100 },
      { method: "POS", totalAmount: 100, splitCount: 1, paymentCount: 1, averageAmount: 100, sharePct: 0, refundAdjustedNet: 100 },
      { method: "BANK_TRANSFER", totalAmount: 50, splitCount: 1, paymentCount: 1, averageAmount: 50, sharePct: 0, refundAdjustedNet: 50 },
      { method: "CHEQUE", totalAmount: 50, splitCount: 1, paymentCount: 1, averageAmount: 50, sharePct: 0, refundAdjustedNet: 50 },
      { method: "OTHER", totalAmount: 999, splitCount: 1, paymentCount: 1, averageAmount: 999, sharePct: 0, refundAdjustedNet: 999 },
    ];
    const kpis = computePaymentMethodKPIs(rows);
    expect(kpis.digitalReceived).toBe(400);
    expect(kpis.bankReceived).toBe(100);
    expect(kpis.cashReceived).toBe(0);
    // OTHER is included in totalReceived but in no category total.
    expect(kpis.totalReceived).toBe(400 + 100 + 999);
  });

  it("picks mostUsedMethod by splitCount and highestValueMethod by totalAmount independently", () => {
    const rows: PaymentMethodMixRow[] = [
      { method: "CASH", totalAmount: 100, splitCount: 50, paymentCount: 50, averageAmount: 2, sharePct: 10, refundAdjustedNet: 100 },
      { method: "BANK_TRANSFER", totalAmount: 900, splitCount: 5, paymentCount: 5, averageAmount: 180, sharePct: 90, refundAdjustedNet: 900 },
    ];
    const kpis = computePaymentMethodKPIs(rows);
    expect(kpis.mostUsedMethod).toBe("CASH"); // most splits
    expect(kpis.highestValueMethod).toBe("BANK_TRANSFER"); // most value
  });

  it("computes averagePaymentSplit = totalReceived / total split count across all methods", () => {
    const rows: PaymentMethodMixRow[] = [
      { method: "CASH", totalAmount: 400, splitCount: 4, paymentCount: 4, averageAmount: 100, sharePct: 40, refundAdjustedNet: 400 },
      { method: "MPESA", totalAmount: 600, splitCount: 6, paymentCount: 6, averageAmount: 100, sharePct: 60, refundAdjustedNet: 600 },
    ];
    const kpis = computePaymentMethodKPIs(rows);
    expect(kpis.averagePaymentSplit).toBe(100); // 1000 / 10
  });

  it("returns zeros and nulls with no division-by-zero when there are no rows", () => {
    const kpis = computePaymentMethodKPIs([]);
    expect(kpis.totalReceived).toBe(0);
    expect(kpis.cashDependencyRate).toBe(0);
    expect(kpis.averagePaymentSplit).toBe(0);
    expect(kpis.mostUsedMethod).toBeNull();
    expect(kpis.highestValueMethod).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 6. method trend grouped in SQL
// ---------------------------------------------------------------------------

describe("getPaymentMethodMonthlyTrend", () => {
  it("(test 6) groups by month and method entirely in SQL", async () => {
    mockQueryRaw.mockResolvedValueOnce([{ month: "2026-01", method: "CASH", totalAmount: 100 }]);
    await getPaymentMethodMonthlyTrend(BASE);

    const { sql } = flattenSql(mockQueryRaw.mock.calls[0][0]);
    expect(sql).toContain("GROUP BY CONVERT(VARCHAR(7), p.paymentDate, 120), ps.method");
    expect(sql).toContain("CONVERT(VARCHAR(7), p.paymentDate, 120) AS month");
  });

  it("uses Payment.paymentDate (not PaymentSplit.createdAt) as the date basis", async () => {
    mockQueryRaw.mockResolvedValueOnce([]);
    await getPaymentMethodMonthlyTrend({ ...BASE, dateFrom: "2026-01-01", dateTo: "2026-01-31" });

    const { sql, values } = flattenSql(mockQueryRaw.mock.calls[0][0]);
    expect(sql).toContain("p.paymentDate >= ?");
    expect(sql).toContain("p.paymentDate <= ?");
    expect(values.some((v) => v instanceof Date)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 7. branch fallback works
// ---------------------------------------------------------------------------

describe("getPaymentMethodByBranch", () => {
  it("(test 7) falls back COALESCE(Payment.branchId, Invoice.branchId) in both SELECT and GROUP BY", async () => {
    mockQueryRaw.mockResolvedValueOnce([
      { branchId: "branch-1", branchName: "Filial Central", method: "CASH", totalAmount: 100 },
    ]);
    const rows = await getPaymentMethodByBranch(BASE);

    const { sql } = flattenSql(mockQueryRaw.mock.calls[0][0]);
    expect(sql).toContain("COALESCE(p.branchId, i.branchId) AS branchId");
    expect(sql).toContain("GROUP BY COALESCE(p.branchId, i.branchId), b.name, ps.method");
    expect(rows[0].branchName).toBe("Filial Central");
  });

  it("falls back to 'Sem Filial' when branch is null", async () => {
    mockQueryRaw.mockResolvedValueOnce([
      { branchId: null, branchName: null, method: "CASH", totalAmount: 100 },
    ]);
    const rows = await getPaymentMethodByBranch(BASE);
    expect(rows[0].branchName).toBe("Sem Filial");
  });

  it("scopes to organizationId — tenant isolation", async () => {
    mockQueryRaw.mockResolvedValueOnce([]);
    await getPaymentMethodByBranch(BASE);
    const { sql, values } = flattenSql(mockQueryRaw.mock.calls[0][0]);
    expect(sql).toContain("ps.organizationId = ?");
    expect(values).toContain("org-1");
  });
});

// ---------------------------------------------------------------------------
// Integrity awareness
// ---------------------------------------------------------------------------

describe("hasCriticalPaymentMethodIntegrityIssue", () => {
  it("checks for an OPEN CRITICAL issue in category PAYMENT_ALLOCATION (payment.split_sum)", async () => {
    mockQueryRaw.mockResolvedValueOnce([{ count: 1 }]);
    const result = await hasCriticalPaymentMethodIntegrityIssue("org-1");

    const { sql, values } = flattenSql(mockQueryRaw.mock.calls[0][0]);
    expect(sql).toContain("category = 'PAYMENT_ALLOCATION'");
    expect(sql).toContain("severity = 'CRITICAL'");
    expect(sql).toContain("status = 'OPEN'");
    expect(values).toContain("org-1");
    expect(result).toBe(true);
  });

  it("returns false when no critical issue is open", async () => {
    mockQueryRaw.mockResolvedValueOnce([{ count: 0 }]);
    expect(await hasCriticalPaymentMethodIntegrityIssue("org-1")).toBe(false);
  });
});
