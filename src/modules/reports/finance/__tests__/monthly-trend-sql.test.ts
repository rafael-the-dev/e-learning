import { describe, it, expect, vi, beforeEach } from "vitest";
import { Prisma } from "@prisma/client";

// ── DB mock ──────────────────────────────────────────────────────────────────
const mockQueryRaw = vi.fn();
const mockBranchFindMany = vi.fn();
const mockCourseFindMany = vi.fn();
const mockInvoiceGroupBy = vi.fn();
const mockInvoiceAggregate = vi.fn();
const mockInvoiceFindMany = vi.fn();
const mockPaymentFindMany = vi.fn();
const mockEnrollmentGroupBy = vi.fn();
const mockEnrollmentFindMany = vi.fn();

vi.mock("@/server/db", () => ({
  getDb: async () => ({
    $queryRaw: mockQueryRaw,
    branch: { findMany: mockBranchFindMany },
    course: { findMany: mockCourseFindMany },
    invoice: {
      groupBy: mockInvoiceGroupBy,
      aggregate: mockInvoiceAggregate,
      findMany: mockInvoiceFindMany,
    },
    payment: { findMany: mockPaymentFindMany },
    enrollment: { groupBy: mockEnrollmentGroupBy, findMany: mockEnrollmentFindMany },
  }),
}));

// ── flattenSql helper — same convention as wallet-activity.test.ts ─────────────
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

import { getPaymentsMonthlyTrend } from "../repositories/payments-report.repository";
import { getRefundsMonthlyTrend } from "../repositories/refunds-report.repository";
import { getCashFlowMonthlyTrend } from "../repositories/cash-flow.repository";
import { getBranchRevenueReport } from "../repositories/branch-revenue.repository";
import { getCourseRevenueReport } from "../repositories/course-revenue.repository";

beforeEach(() => {
  vi.clearAllMocks();
});

// ────────────────────────────────────────────────────────────────────────────
describe("getPaymentsMonthlyTrend", () => {
  beforeEach(() => {
    mockQueryRaw.mockResolvedValue([
      { month: "2026-01", count: 3, total: 1500 },
      { month: "2026-02", count: 2, total: 900 },
    ]);
  });

  it("uses SQL GROUP BY / CONVERT(VARCHAR(7), ...) instead of loading raw rows (test 1)", async () => {
    await getPaymentsMonthlyTrend({ organizationId: "org-1" });
    const { sql } = flattenSql(mockQueryRaw.mock.calls[0][0] as Prisma.Sql);
    expect(sql).toContain("GROUP BY");
    expect(sql).toContain("CONVERT(VARCHAR(7)");
  });

  it("never calls payment.findMany to build the trend (test 2)", async () => {
    await getPaymentsMonthlyTrend({ organizationId: "org-1" });
    expect(mockPaymentFindMany).not.toHaveBeenCalled();
  });

  it("returns rows in the SQL-provided month order (test 4)", async () => {
    const result = await getPaymentsMonthlyTrend({ organizationId: "org-1" });
    expect(result.map((r) => r.month)).toEqual(["2026-01", "2026-02"]);
    const { sql } = flattenSql(mockQueryRaw.mock.calls[0][0] as Prisma.Sql);
    expect(sql).toContain("ORDER BY month ASC");
  });

  it("applies branchId/date filters in WHERE before GROUP BY (test 5)", async () => {
    await getPaymentsMonthlyTrend({
      organizationId: "org-1",
      branchId: "branch-1",
      dateFrom: "2026-01-01",
      dateTo: "2026-06-30",
    });
    const { sql, values } = flattenSql(mockQueryRaw.mock.calls[0][0] as Prisma.Sql);
    const whereIdx = sql.indexOf("WHERE");
    const groupIdx = sql.indexOf("GROUP BY");
    expect(whereIdx).toBeGreaterThan(-1);
    expect(groupIdx).toBeGreaterThan(whereIdx);
    expect(sql).toContain("p.branchId = ?");
    expect(sql).toContain("p.paymentDate >= ?");
    expect(sql).toContain("p.paymentDate <= ?");
    expect(values).toContain("branch-1");
  });

  it("binds organizationId as a parameter, not interpolated (test 6)", async () => {
    await getPaymentsMonthlyTrend({ organizationId: "org-secret" });
    const { sql, values } = flattenSql(mockQueryRaw.mock.calls[0][0] as Prisma.Sql);
    expect(sql).not.toContain("org-secret");
    expect(values).toContain("org-secret");
  });

  it("restricts to CONFIRMED payments (test 8)", async () => {
    await getPaymentsMonthlyTrend({ organizationId: "org-1" });
    const { sql } = flattenSql(mockQueryRaw.mock.calls[0][0] as Prisma.Sql);
    expect(sql).toContain("p.status = 'CONFIRMED'");
  });

  it("sums only matching splits when a paymentMethod filter is active", async () => {
    await getPaymentsMonthlyTrend({ organizationId: "org-1", paymentMethod: "CASH" });
    const { sql, values } = flattenSql(mockQueryRaw.mock.calls[0][0] as Prisma.Sql);
    expect(sql).toContain("payment_splits ps2");
    expect(values).toContain("CASH");
  });
});

// ────────────────────────────────────────────────────────────────────────────
describe("getRefundsMonthlyTrend", () => {
  beforeEach(() => {
    mockQueryRaw.mockResolvedValue([{ month: "2026-03", count: 1, total: 200 }]);
  });

  it("uses SQL GROUP BY instead of loading raw rows (test 1)", async () => {
    await getRefundsMonthlyTrend({ organizationId: "org-1" });
    const { sql } = flattenSql(mockQueryRaw.mock.calls[0][0] as Prisma.Sql);
    expect(sql).toContain("GROUP BY");
    expect(sql).toContain("CONVERT(VARCHAR(7)");
  });

  it("uses createdAt as the date axis, not completedAt (test 7)", async () => {
    await getRefundsMonthlyTrend({ organizationId: "org-1" });
    const { sql } = flattenSql(mockQueryRaw.mock.calls[0][0] as Prisma.Sql);
    expect(sql).toContain("r.createdAt");
    expect(sql).not.toContain("completedAt");
  });

  it("always restricts to COMPLETED refunds regardless of refundStatus filter", async () => {
    await getRefundsMonthlyTrend({ organizationId: "org-1", refundStatus: "REQUESTED" });
    const { sql, values } = flattenSql(mockQueryRaw.mock.calls[0][0] as Prisma.Sql);
    expect(sql).toContain("r.status = 'COMPLETED'");
    expect(values).not.toContain("REQUESTED");
  });

  it("binds organizationId as a parameter, not interpolated (test 6)", async () => {
    await getRefundsMonthlyTrend({ organizationId: "org-secret" });
    const { sql, values } = flattenSql(mockQueryRaw.mock.calls[0][0] as Prisma.Sql);
    expect(sql).not.toContain("org-secret");
    expect(values).toContain("org-secret");
  });

  it("applies branchId filter before GROUP BY (test 5)", async () => {
    await getRefundsMonthlyTrend({ organizationId: "org-1", branchId: "branch-9" });
    const { sql, values } = flattenSql(mockQueryRaw.mock.calls[0][0] as Prisma.Sql);
    const whereIdx = sql.indexOf("WHERE");
    const groupIdx = sql.indexOf("GROUP BY");
    expect(groupIdx).toBeGreaterThan(whereIdx);
    expect(sql).toContain("r.branchId = ?");
    expect(values).toContain("branch-9");
  });
});

// ────────────────────────────────────────────────────────────────────────────
describe("getCashFlowMonthlyTrend", () => {
  beforeEach(() => {
    mockQueryRaw.mockResolvedValue([{ month: "2026-04", cashIn: 1000, cashOut: 300 }]);
  });

  it("uses SQL GROUP BY instead of loading raw rows (test 1)", async () => {
    await getCashFlowMonthlyTrend({ organizationId: "org-1" });
    const { sql } = flattenSql(mockQueryRaw.mock.calls[0][0] as Prisma.Sql);
    expect(sql).toContain("GROUP BY");
    expect(sql).toContain("CONVERT(VARCHAR(7)");
  });

  it("computes net = cashIn - cashOut per month", async () => {
    const result = await getCashFlowMonthlyTrend({ organizationId: "org-1" });
    expect(result[0]).toEqual({ month: "2026-04", cashIn: 1000, cashOut: 300, net: 700 });
  });

  it("restricts to the cash-flow included transaction types", async () => {
    await getCashFlowMonthlyTrend({ organizationId: "org-1" });
    const { sql } = flattenSql(mockQueryRaw.mock.calls[0][0] as Prisma.Sql);
    expect(sql).toContain("t.transactionType IN");
    expect(sql).toContain("PAYMENT_RECEIVED");
  });

  it("binds organizationId as a parameter, not interpolated (test 6)", async () => {
    await getCashFlowMonthlyTrend({ organizationId: "org-secret" });
    const { sql, values } = flattenSql(mockQueryRaw.mock.calls[0][0] as Prisma.Sql);
    expect(sql).not.toContain("org-secret");
    expect(values).toContain("org-secret");
  });
});

// ────────────────────────────────────────────────────────────────────────────
describe("getBranchRevenueReport — monthly trend", () => {
  function mockBaseBranchDeps() {
    mockBranchFindMany.mockResolvedValue([
      { id: "b1", name: "Branch One" },
      { id: "b2", name: "Branch Two" },
    ]);
    mockInvoiceGroupBy
      .mockResolvedValueOnce([
        { branchId: "b1", _sum: { totalAmount: 1000, paidAmount: 800, balanceAmount: 200 }, _count: { id: 5 } },
        { branchId: "b2", _sum: { totalAmount: 500, paidAmount: 400, balanceAmount: 100 }, _count: { id: 3 } },
      ])
      .mockResolvedValueOnce([]); // overdueGroups
    mockPaymentFindMany.mockResolvedValue([
      { branchId: "b1", invoiceId: null, totalAmount: 800, paymentDate: new Date("2026-01-15") },
    ]);
    mockInvoiceFindMany.mockResolvedValue([]); // studentPairs
  }

  it("queries SQL with GROUP BY month + branch instead of looping raw payments (test 1 & 2)", async () => {
    mockBaseBranchDeps();
    mockQueryRaw.mockResolvedValue([{ month: "2026-01", branchId: "b1", collected: 800 }]);

    const report = await getBranchRevenueReport({ organizationId: "org-1" });

    const trendCall = mockQueryRaw.mock.calls[0][0] as Prisma.Sql;
    const { sql } = flattenSql(trendCall);
    expect(sql).toContain("GROUP BY");
    expect(sql).toContain("CONVERT(VARCHAR(7)");
    expect(report.monthlyTrend).toEqual([
      { month: "2026-01", branchId: "b1", branchName: "Branch One", collected: 800 },
    ]);
  });

  it("restricts the IN clause to the top 5 branches by collected (test 9)", async () => {
    mockBranchFindMany.mockResolvedValue(
      Array.from({ length: 6 }, (_, i) => ({ id: `b${i}`, name: `Branch ${i}` }))
    );
    mockInvoiceGroupBy
      .mockResolvedValueOnce(
        Array.from({ length: 6 }, (_, i) => ({
          branchId: `b${i}`,
          _sum: { totalAmount: 1000, paidAmount: 1000 - i * 100, balanceAmount: 0 },
          _count: { id: 1 },
        }))
      )
      .mockResolvedValueOnce([]);
    mockPaymentFindMany.mockResolvedValue([]);
    mockInvoiceFindMany.mockResolvedValue([]);
    mockQueryRaw.mockResolvedValue([]);

    await getBranchRevenueReport({ organizationId: "org-1" });

    const { sql, values } = flattenSql(mockQueryRaw.mock.calls[0][0] as Prisma.Sql);
    expect(sql).toContain("IN (");
    // top 5 by paidAmount desc: b0..b4 (b5 has the lowest paidAmount, excluded)
    expect(values).toEqual(expect.arrayContaining(["b0", "b1", "b2", "b3", "b4"]));
    expect(values).not.toContain("b5");
  });

  it("handles a null branchId among the top 5 with an IS NULL clause (test 9)", async () => {
    mockBranchFindMany.mockResolvedValue([{ id: "b1", name: "Branch One" }]);
    mockInvoiceGroupBy
      .mockResolvedValueOnce([
        { branchId: "b1", _sum: { totalAmount: 500, paidAmount: 400, balanceAmount: 100 }, _count: { id: 2 } },
        { branchId: null, _sum: { totalAmount: 300, paidAmount: 300, balanceAmount: 0 }, _count: { id: 1 } },
      ])
      .mockResolvedValueOnce([]);
    mockPaymentFindMany.mockResolvedValue([]);
    mockInvoiceFindMany.mockResolvedValue([]);
    mockQueryRaw.mockResolvedValue([]);

    await getBranchRevenueReport({ organizationId: "org-1" });

    const { sql } = flattenSql(mockQueryRaw.mock.calls[0][0] as Prisma.Sql);
    expect(sql).toContain("IS NULL");
  });

  it("binds organizationId as a parameter in the trend query (test 6)", async () => {
    mockBaseBranchDeps();
    mockQueryRaw.mockResolvedValue([]);

    await getBranchRevenueReport({ organizationId: "org-secret" });

    const { sql, values } = flattenSql(mockQueryRaw.mock.calls[0][0] as Prisma.Sql);
    expect(sql).not.toContain("org-secret");
    expect(values).toContain("org-secret");
  });
});

// ────────────────────────────────────────────────────────────────────────────
describe("getCourseRevenueReport — monthly trend", () => {
  function mockBaseCourseDeps() {
    mockCourseFindMany.mockResolvedValue([
      { id: "c1", name: "Course One" },
      { id: "c2", name: "Course Two" },
    ]);
    mockInvoiceGroupBy
      .mockResolvedValueOnce([
        { enrollmentId: "e1", _sum: { totalAmount: 1000, paidAmount: 800, balanceAmount: 200 }, _count: { id: 5 } },
        { enrollmentId: "e2", _sum: { totalAmount: 500, paidAmount: 400, balanceAmount: 100 }, _count: { id: 3 } },
      ])
      .mockResolvedValueOnce([]); // overdueGroups
    mockEnrollmentGroupBy.mockResolvedValue([]);
    mockInvoiceAggregate.mockResolvedValue({ _sum: { totalAmount: 0, paidAmount: 0, balanceAmount: 0 }, _count: { id: 0 } });
    mockEnrollmentFindMany.mockResolvedValue([
      { id: "e1", courseId: "c1" },
      { id: "e2", courseId: "c2" },
    ]);
  }

  it("queries SQL with GROUP BY month + course instead of looping raw invoices (test 1 & 2)", async () => {
    mockBaseCourseDeps();
    mockQueryRaw.mockResolvedValue([{ month: "2026-02", courseId: "c1", invoiced: 1000 }]);

    const report = await getCourseRevenueReport({ organizationId: "org-1" });

    const { sql } = flattenSql(mockQueryRaw.mock.calls[0][0] as Prisma.Sql);
    expect(sql).toContain("GROUP BY");
    expect(sql).toContain("CONVERT(VARCHAR(7)");
    expect(report.monthlyTrend).toEqual([
      { month: "2026-02", courseId: "c1", courseName: "Course One", invoiced: 1000 },
    ]);
  });

  it("applies academicYearId / academicTermId / branchId filters before GROUP BY (test 5)", async () => {
    mockBaseCourseDeps();
    mockQueryRaw.mockResolvedValue([]);

    await getCourseRevenueReport({
      organizationId: "org-1",
      branchId: "branch-1",
      academicYearId: "ay-1",
      academicTermId: "at-1",
    });

    const { sql, values } = flattenSql(mockQueryRaw.mock.calls[0][0] as Prisma.Sql);
    const whereIdx = sql.indexOf("WHERE");
    const groupIdx = sql.indexOf("GROUP BY");
    expect(groupIdx).toBeGreaterThan(whereIdx);
    expect(sql).toContain("i.branchId = ?");
    expect(sql).toContain("e.academicYearId = ?");
    expect(sql).toContain("e.academicTermId = ?");
    expect(values).toEqual(expect.arrayContaining(["branch-1", "ay-1", "at-1"]));
  });

  it("restricts the IN clause to the top 5 courses by collected (test 9)", async () => {
    mockCourseFindMany.mockResolvedValue(
      Array.from({ length: 6 }, (_, i) => ({ id: `c${i}`, name: `Course ${i}` }))
    );
    mockInvoiceGroupBy
      .mockResolvedValueOnce(
        Array.from({ length: 6 }, (_, i) => ({
          enrollmentId: `e${i}`,
          _sum: { totalAmount: 1000, paidAmount: 1000 - i * 100, balanceAmount: 0 },
          _count: { id: 1 },
        }))
      )
      .mockResolvedValueOnce([]);
    mockEnrollmentGroupBy.mockResolvedValue([]);
    mockInvoiceAggregate.mockResolvedValue({ _sum: { totalAmount: 0, paidAmount: 0, balanceAmount: 0 }, _count: { id: 0 } });
    mockEnrollmentFindMany.mockResolvedValue(
      Array.from({ length: 6 }, (_, i) => ({ id: `e${i}`, courseId: `c${i}` }))
    );
    mockQueryRaw.mockResolvedValue([]);

    await getCourseRevenueReport({ organizationId: "org-1" });

    const { values } = flattenSql(mockQueryRaw.mock.calls[0][0] as Prisma.Sql);
    expect(values).toEqual(expect.arrayContaining(["c0", "c1", "c2", "c3", "c4"]));
    expect(values).not.toContain("c5");
  });

  it("binds organizationId as a parameter in the trend query (test 6)", async () => {
    mockBaseCourseDeps();
    mockQueryRaw.mockResolvedValue([]);

    await getCourseRevenueReport({ organizationId: "org-secret" });

    const { sql, values } = flattenSql(mockQueryRaw.mock.calls[0][0] as Prisma.Sql);
    expect(sql).not.toContain("org-secret");
    expect(values).toContain("org-secret");
  });
});
