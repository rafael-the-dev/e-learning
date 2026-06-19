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
  getDiscountKPIs,
  getDiscountByRule,
  getDiscountByBranch,
  getDiscountByCourse,
  getDiscountMonthlyTrend,
  listDiscountRows,
  getDiscountWatchlist,
  hasCriticalDiscountIntegrityIssue,
} from "../repositories/discount.repository";
import type { DiscountReportFilters } from "../types";

const BASE: DiscountReportFilters = { organizationId: "org-1", page: 1, pageSize: 20 };

beforeEach(() => {
  vi.clearAllMocks();
});

function rawDiscountRow(overrides: Partial<{
  id: string; invoiceId: string; invoiceNumber: string; studentId: string | null;
  firstName: string | null; lastName: string | null; branchId: string | null; branchName: string | null;
  courseId: string | null; courseName: string | null; discountRuleId: string; discountRuleName: string;
  discountType: string; discountAmount: number; invoiceSubtotal: number; invoiceTotal: number;
  leakageRate: number; appliedByUserId: string | null; appliedByName: string | null;
  appliedAt: Date; status: string;
}> = {}) {
  return {
    id: "applied-discount-1",
    invoiceId: "invoice-1",
    invoiceNumber: "INV-0001",
    studentId: "student-1",
    firstName: "Maria",
    lastName: "Silva",
    branchId: "branch-1",
    branchName: "Filial Central",
    courseId: "course-1",
    courseName: "Condução B",
    discountRuleId: "rule-1",
    discountRuleName: "Desconto Antecipado",
    discountType: "PERCENTAGE",
    discountAmount: 500,
    invoiceSubtotal: 5000,
    invoiceTotal: 4500,
    leakageRate: 10,
    appliedByUserId: "user-1",
    appliedByName: "Ana Secretária",
    appliedAt: new Date("2026-03-15"),
    status: "PAID",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// 1-2-3-4-5-6-7-8. KPIs
// ---------------------------------------------------------------------------

describe("getDiscountKPIs", () => {
  it("(test 1) sums AppliedDiscount.amount for totalDiscounts", async () => {
    mockQueryRaw.mockResolvedValueOnce([{ totalDiscounts: 1500, largestDiscount: 800 }]);
    mockQueryRaw.mockResolvedValueOnce([{ grossBeforeDiscounts: 10000, netInvoiced: 8500, discountedInvoicesCount: BigInt(5) }]);

    const kpis = await getDiscountKPIs(BASE);
    expect(kpis.totalDiscounts).toBe(1500);
  });

  it("(test 2) counts distinct discounted invoices from the invoice-rooted query", async () => {
    mockQueryRaw.mockResolvedValueOnce([{ totalDiscounts: 1500, largestDiscount: 800 }]);
    mockQueryRaw.mockResolvedValueOnce([{ grossBeforeDiscounts: 10000, netInvoiced: 8500, discountedInvoicesCount: BigInt(5) }]);

    const kpis = await getDiscountKPIs(BASE);
    expect(kpis.discountedInvoicesCount).toBe(5);

    const { sql } = flattenSql(mockQueryRaw.mock.calls[1][0]);
    expect(sql).toContain("EXISTS");
    expect(sql).toContain("applied_discounts ad3 WHERE ad3.invoiceId = i.id");
  });

  it("(test 3) computes Gross Before Discounts from the stored Invoice.subtotal field", async () => {
    mockQueryRaw.mockResolvedValueOnce([{ totalDiscounts: 1500, largestDiscount: 800 }]);
    mockQueryRaw.mockResolvedValueOnce([{ grossBeforeDiscounts: 10000, netInvoiced: 8500, discountedInvoicesCount: BigInt(5) }]);

    const kpis = await getDiscountKPIs(BASE);
    expect(kpis.grossBeforeDiscounts).toBe(10000);

    const { sql } = flattenSql(mockQueryRaw.mock.calls[1][0]);
    expect(sql).toContain("SUM(CAST(i.subtotal AS FLOAT))");
  });

  it("(test 4) Net Invoiced excludes CANCELLED invoices by default", async () => {
    mockQueryRaw.mockResolvedValueOnce([{ totalDiscounts: 0, largestDiscount: null }]);
    mockQueryRaw.mockResolvedValueOnce([{ grossBeforeDiscounts: 0, netInvoiced: 0, discountedInvoicesCount: BigInt(0) }]);

    await getDiscountKPIs(BASE);

    const { sql } = flattenSql(mockQueryRaw.mock.calls[1][0]);
    expect(sql).toContain("SUM(CAST(i.totalAmount AS FLOAT))");
    expect(sql).toContain("i.status <> 'CANCELLED'");
  });

  it("(test 5) Revenue Leakage Rate = totalDiscounts / grossBeforeDiscounts * 100, with a divide-by-zero guard", async () => {
    mockQueryRaw.mockResolvedValueOnce([{ totalDiscounts: 1500, largestDiscount: 800 }]);
    mockQueryRaw.mockResolvedValueOnce([{ grossBeforeDiscounts: 10000, netInvoiced: 8500, discountedInvoicesCount: BigInt(5) }]);

    const kpis = await getDiscountKPIs(BASE);
    expect(kpis.revenueLeakageRate).toBeCloseTo(15, 5);

    mockQueryRaw.mockResolvedValueOnce([{ totalDiscounts: 0, largestDiscount: null }]);
    mockQueryRaw.mockResolvedValueOnce([{ grossBeforeDiscounts: 0, netInvoiced: 0, discountedInvoicesCount: BigInt(0) }]);
    const zeroKpis = await getDiscountKPIs(BASE);
    expect(zeroKpis.revenueLeakageRate).toBe(0);
  });

  it("(test 6) Average Discount Per Invoice = totalDiscounts / discountedInvoicesCount, with a divide-by-zero guard", async () => {
    mockQueryRaw.mockResolvedValueOnce([{ totalDiscounts: 1500, largestDiscount: 800 }]);
    mockQueryRaw.mockResolvedValueOnce([{ grossBeforeDiscounts: 10000, netInvoiced: 8500, discountedInvoicesCount: BigInt(5) }]);

    const kpis = await getDiscountKPIs(BASE);
    expect(kpis.averageDiscountPerInvoice).toBeCloseTo(300, 5);

    mockQueryRaw.mockResolvedValueOnce([{ totalDiscounts: 0, largestDiscount: null }]);
    mockQueryRaw.mockResolvedValueOnce([{ grossBeforeDiscounts: 0, netInvoiced: 0, discountedInvoicesCount: BigInt(0) }]);
    const zeroKpis = await getDiscountKPIs(BASE);
    expect(zeroKpis.averageDiscountPerInvoice).toBe(0);
  });

  it("(test 7) Manual Discounts are always 0 — schema has no MANUAL discount concept", async () => {
    mockQueryRaw.mockResolvedValueOnce([{ totalDiscounts: 1500, largestDiscount: 800 }]);
    mockQueryRaw.mockResolvedValueOnce([{ grossBeforeDiscounts: 10000, netInvoiced: 8500, discountedInvoicesCount: BigInt(5) }]);

    const kpis = await getDiscountKPIs(BASE);
    expect(kpis.manualDiscountsAmount).toBe(0);
    expect(kpis.manualDiscountsCount).toBe(0);
    // No extra query needed to determine this — still exactly 2 calls.
    expect(mockQueryRaw).toHaveBeenCalledTimes(2);
  });

  it("(test 8) Largest Discount = MAX(AppliedDiscount.amount)", async () => {
    mockQueryRaw.mockResolvedValueOnce([{ totalDiscounts: 1500, largestDiscount: 800 }]);
    mockQueryRaw.mockResolvedValueOnce([{ grossBeforeDiscounts: 10000, netInvoiced: 8500, discountedInvoicesCount: BigInt(5) }]);

    const kpis = await getDiscountKPIs(BASE);
    expect(kpis.largestDiscount).toBe(800);

    const { sql } = flattenSql(mockQueryRaw.mock.calls[0][0]);
    expect(sql).toContain("MAX(CAST(ad.amount AS FLOAT))");
  });
});

// ---------------------------------------------------------------------------
// 9. Discounts by rule
// ---------------------------------------------------------------------------

describe("getDiscountByRule (test 9)", () => {
  it("groups by discount rule and aggregates amount/count in SQL", async () => {
    mockQueryRaw.mockResolvedValueOnce([
      { discountRuleId: "rule-1", discountRuleName: "Desconto Antecipado", discountAmount: 1500, count: BigInt(3) },
    ]);

    const rows = await getDiscountByRule(BASE);

    expect(rows).toEqual([
      { discountRuleId: "rule-1", discountRuleName: "Desconto Antecipado", discountAmount: 1500, count: 3 },
    ]);

    const { sql } = flattenSql(mockQueryRaw.mock.calls[0][0]);
    expect(sql).toContain("GROUP BY ad.discountRuleId, dr.name");
  });
});

// ---------------------------------------------------------------------------
// 10. Discounts by branch
// ---------------------------------------------------------------------------

describe("getDiscountByBranch (test 10)", () => {
  it("groups by branch and falls back to 'Sem Filial' when null", async () => {
    mockQueryRaw.mockResolvedValueOnce([{ branchId: null, branchName: null, discountAmount: 250 }]);

    const rows = await getDiscountByBranch(BASE);

    expect(rows).toEqual([{ branchId: null, branchName: "Sem Filial", discountAmount: 250 }]);

    const { sql } = flattenSql(mockQueryRaw.mock.calls[0][0]);
    expect(sql).toContain("GROUP BY i.branchId, b.name");
  });
});

// ---------------------------------------------------------------------------
// 11. Discounts by course
// ---------------------------------------------------------------------------

describe("getDiscountByCourse (test 11)", () => {
  it("groups by course and falls back to 'Sem Curso' when null", async () => {
    mockQueryRaw.mockResolvedValueOnce([{ courseId: null, courseName: null, discountAmount: 320 }]);

    const rows = await getDiscountByCourse(BASE);

    expect(rows).toEqual([{ courseId: null, courseName: "Sem Curso", discountAmount: 320 }]);

    const { sql } = flattenSql(mockQueryRaw.mock.calls[0][0]);
    expect(sql).toContain("GROUP BY e.courseId, c.name");
  });
});

// ---------------------------------------------------------------------------
// 12. Monthly trend grouped in SQL
// ---------------------------------------------------------------------------

describe("getDiscountMonthlyTrend (test 12)", () => {
  it("groups by month of AppliedDiscount.createdAt in SQL", async () => {
    mockQueryRaw.mockResolvedValueOnce([{ month: "2026-03", discountAmount: 1500 }]);

    const rows = await getDiscountMonthlyTrend(BASE);

    expect(rows).toEqual([{ month: "2026-03", discountAmount: 1500 }]);

    const { sql } = flattenSql(mockQueryRaw.mock.calls[0][0]);
    expect(sql).toContain("GROUP BY CONVERT(VARCHAR(7), ad.createdAt, 120)");
  });

  it("applies the date range against ad.createdAt (the report's date basis)", async () => {
    mockQueryRaw.mockResolvedValueOnce([]);
    await getDiscountMonthlyTrend({ ...BASE, dateFrom: "2026-01-01", dateTo: "2026-01-31" });

    const { sql, values } = flattenSql(mockQueryRaw.mock.calls[0][0]);
    expect(sql).toContain("ad.createdAt >=");
    expect(sql).toContain("ad.createdAt <=");
    expect(values).toContainEqual(new Date("2026-01-01"));
    expect(values).toContainEqual(new Date("2026-01-31"));
  });
});

// ---------------------------------------------------------------------------
// 13. Table pagination in SQL
// ---------------------------------------------------------------------------

describe("listDiscountRows pagination (test 13)", () => {
  it("uses OFFSET / FETCH NEXT with (page-1)*pageSize bound as a parameter", async () => {
    mockQueryRaw.mockResolvedValueOnce([]);
    mockQueryRaw.mockResolvedValueOnce([{ total: BigInt(0) }]);

    await listDiscountRows({ organizationId: "org-1", page: 3, pageSize: 10 });

    const { sql, values } = flattenSql(mockQueryRaw.mock.calls[0][0]);
    expect(sql).toContain("OFFSET");
    expect(sql).toContain("ROWS FETCH NEXT");
    expect(values).toContain(20);
    expect(values).toContain(10);
  });

  it("issues exactly two queries (rows + count)", async () => {
    mockQueryRaw.mockResolvedValueOnce([rawDiscountRow()]);
    mockQueryRaw.mockResolvedValueOnce([{ total: BigInt(1) }]);

    const { rows, total } = await listDiscountRows(BASE);

    expect(mockQueryRaw).toHaveBeenCalledTimes(2);
    expect(rows).toHaveLength(1);
    expect(total).toBe(1);
    expect(rows[0].studentName).toBe("Maria Silva");
  });
});

// ---------------------------------------------------------------------------
// 14. Sorting in SQL
// ---------------------------------------------------------------------------

describe("listDiscountRows sorting (test 14)", () => {
  it("defaults to discountAmount DESC", async () => {
    mockQueryRaw.mockResolvedValueOnce([]);
    mockQueryRaw.mockResolvedValueOnce([{ total: BigInt(0) }]);

    await listDiscountRows(BASE);

    const { sql } = flattenSql(mockQueryRaw.mock.calls[0][0]);
    expect(sql).toContain("ORDER BY CAST(ad.amount AS FLOAT) DESC");
  });

  it("orders by the requested column and direction", async () => {
    mockQueryRaw.mockResolvedValueOnce([]);
    mockQueryRaw.mockResolvedValueOnce([{ total: BigInt(0) }]);

    await listDiscountRows({ ...BASE, sortBy: "createdAt", sortDir: "asc" });

    const { sql } = flattenSql(mockQueryRaw.mock.calls[0][0]);
    expect(sql).toContain("ORDER BY ad.createdAt ASC");
  });
});

// ---------------------------------------------------------------------------
// 15-16. Cancelled invoice handling
// ---------------------------------------------------------------------------

describe("cancelled invoice handling (tests 15 & 16)", () => {
  it("(test 15) excludes CANCELLED invoices by default", async () => {
    mockQueryRaw.mockResolvedValueOnce([]);
    mockQueryRaw.mockResolvedValueOnce([{ total: BigInt(0) }]);

    await listDiscountRows(BASE);

    const { sql } = flattenSql(mockQueryRaw.mock.calls[0][0]);
    expect(sql).toContain("i.status <> 'CANCELLED'");
  });

  it("(test 16) includes CANCELLED invoices only when explicitly requested via invoiceStatus", async () => {
    mockQueryRaw.mockResolvedValueOnce([]);
    mockQueryRaw.mockResolvedValueOnce([{ total: BigInt(0) }]);

    await listDiscountRows({ ...BASE, invoiceStatus: "CANCELLED" });

    const { sql, values } = flattenSql(mockQueryRaw.mock.calls[0][0]);
    expect(sql).toContain("i.status =");
    expect(sql).not.toContain("i.status <> 'CANCELLED'");
    expect(values).toContain("CANCELLED");
  });
});

// ---------------------------------------------------------------------------
// 17. No invoice total double counting with multiple discounts
// ---------------------------------------------------------------------------

describe("no double counting across multiple discounts per invoice (test 17)", () => {
  it("computes Net Invoiced / Gross Before Discounts from an invoice-rooted query, never SUM(invoice) joined to applied_discounts", async () => {
    mockQueryRaw.mockResolvedValueOnce([{ totalDiscounts: 0, largestDiscount: null }]);
    mockQueryRaw.mockResolvedValueOnce([{ grossBeforeDiscounts: 0, netInvoiced: 0, discountedInvoicesCount: BigInt(0) }]);

    await getDiscountKPIs(BASE);

    expect(mockQueryRaw).toHaveBeenCalledTimes(2);
    const { sql } = flattenSql(mockQueryRaw.mock.calls[1][0]);
    expect(sql).toContain("FROM invoices i");
    // The only reference to applied_discounts is a scalar EXISTS() check
    // (discountedInvoicesCount) — never a JOIN that could multiply invoice rows.
    expect(sql).not.toContain("JOIN applied_discounts");
  });

  it("the discount-rooted query counts AppliedDiscount rows directly (one row per discount), never multiplying invoice totals", async () => {
    mockQueryRaw.mockResolvedValueOnce([{ totalDiscounts: 0, largestDiscount: null }]);
    mockQueryRaw.mockResolvedValueOnce([{ grossBeforeDiscounts: 0, netInvoiced: 0, discountedInvoicesCount: BigInt(0) }]);

    await getDiscountKPIs(BASE);

    const { sql } = flattenSql(mockQueryRaw.mock.calls[0][0]);
    expect(sql).toContain("FROM applied_discounts ad");
    expect(sql).not.toContain("i.totalAmount");
  });
});

// ---------------------------------------------------------------------------
// 18. Tenant isolation
// ---------------------------------------------------------------------------

describe("tenant isolation (test 18)", () => {
  it("binds organizationId as a parameter on the discount-rooted table query, never interpolated", async () => {
    mockQueryRaw.mockResolvedValueOnce([]);
    mockQueryRaw.mockResolvedValueOnce([{ total: BigInt(0) }]);

    await listDiscountRows({ organizationId: "org-secret", page: 1, pageSize: 20 });

    const { sql, values } = flattenSql(mockQueryRaw.mock.calls[0][0]);
    expect(sql).not.toContain("org-secret");
    expect(sql).toContain("ad.organizationId =");
    expect(values).toContain("org-secret");
  });

  it("binds organizationId on the invoice-rooted KPI query too", async () => {
    mockQueryRaw.mockResolvedValueOnce([{ totalDiscounts: 0, largestDiscount: null }]);
    mockQueryRaw.mockResolvedValueOnce([{ grossBeforeDiscounts: 0, netInvoiced: 0, discountedInvoicesCount: BigInt(0) }]);

    await getDiscountKPIs({ ...BASE, organizationId: "org-secret" });

    const { sql, values } = flattenSql(mockQueryRaw.mock.calls[1][0]);
    expect(sql).not.toContain("org-secret");
    expect(sql).toContain("i.organizationId =");
    expect(values).toContain("org-secret");
  });

  it("a cross-tenant appliedBy filter is structurally scoped by organizationId, not a separate lookup", async () => {
    mockQueryRaw.mockResolvedValueOnce([]);
    mockQueryRaw.mockResolvedValueOnce([{ total: BigInt(0) }]);

    await listDiscountRows({ organizationId: "org-1", appliedBy: "user-other-org", page: 1, pageSize: 20 });

    const { sql, values } = flattenSql(mockQueryRaw.mock.calls[0][0]);
    expect(sql).toContain("ad.organizationId =");
    expect(sql).toContain("i.createdBy =");
    expect(values).toEqual(expect.arrayContaining(["org-1", "user-other-org"]));
  });
});

// ---------------------------------------------------------------------------
// 19. Export respects filters (same code path the export route calls)
// ---------------------------------------------------------------------------

describe("export respects filters (test 19)", () => {
  it("applies branch, course, academic year/term, discount rule, discount type, invoice status, applied-by, and minimum amount together", async () => {
    mockQueryRaw.mockResolvedValueOnce([]);
    mockQueryRaw.mockResolvedValueOnce([{ total: BigInt(0) }]);

    await listDiscountRows({
      organizationId: "org-1",
      branchId: "branch-1",
      courseId: "course-1",
      academicYearId: "year-1",
      academicTermId: "term-1",
      discountRuleId: "rule-1",
      discountType: "PERCENTAGE",
      invoiceStatus: "PAID",
      appliedBy: "user-1",
      minDiscountAmount: 100,
      dateFrom: "2026-01-01",
      dateTo: "2026-01-31",
      page: 1,
      pageSize: 500,
    });

    const { sql, values } = flattenSql(mockQueryRaw.mock.calls[0][0]);
    expect(sql).toContain("i.branchId =");
    expect(sql).toContain("e.courseId =");
    expect(sql).toContain("e.academicYearId =");
    expect(sql).toContain("e.academicTermId =");
    expect(sql).toContain("ad.discountRuleId =");
    expect(sql).toContain("dr.discountType =");
    expect(sql).toContain("i.createdBy =");
    expect(sql).toContain("CAST(ad.amount AS FLOAT) >=");
    expect(values).toEqual(
      expect.arrayContaining(["branch-1", "course-1", "year-1", "term-1", "rule-1", "PERCENTAGE", "PAID", "user-1", 100])
    );
  });
});

// ---------------------------------------------------------------------------
// 20. Watchlist severity rules correct
// ---------------------------------------------------------------------------

describe("getDiscountWatchlist severity rules (test 20)", () => {
  it("flags CRITICAL when the discount amount crosses the critical threshold", async () => {
    mockQueryRaw.mockResolvedValueOnce([rawDiscountRow({ discountAmount: 60000, leakageRate: 5 })]);

    const [item] = await getDiscountWatchlist(BASE);
    expect(item.severity).toBe("CRITICAL");
    expect(item.recommendedAction).toBe("VIEW_INVOICE");
    expect(item.link).toBe("/invoices/invoice-1");
  });

  it("flags CRITICAL when the invoice leakage rate crosses 50%, and recommends reviewing the rule", async () => {
    mockQueryRaw.mockResolvedValueOnce([rawDiscountRow({ discountAmount: 200, leakageRate: 55 })]);

    const [item] = await getDiscountWatchlist(BASE);
    expect(item.severity).toBe("CRITICAL");
    expect(item.recommendedAction).toBe("REVIEW_DISCOUNT_RULE");
    expect(item.link).toBe("/settings/billing/discounts");
  });

  it("flags HIGH between the high and critical thresholds", async () => {
    mockQueryRaw.mockResolvedValueOnce([rawDiscountRow({ discountAmount: 12000, leakageRate: 5 })]);

    const [item] = await getDiscountWatchlist(BASE);
    expect(item.severity).toBe("HIGH");
  });

  it("flags MEDIUM between the medium and high thresholds", async () => {
    mockQueryRaw.mockResolvedValueOnce([rawDiscountRow({ discountAmount: 6000, leakageRate: 5 })]);

    const [item] = await getDiscountWatchlist(BASE);
    expect(item.severity).toBe("MEDIUM");
  });

  it("filters out rows below the medium threshold in SQL (no unbounded LOW tier)", async () => {
    mockQueryRaw.mockResolvedValueOnce([]);
    await getDiscountWatchlist(BASE);

    const { sql } = flattenSql(mockQueryRaw.mock.calls[0][0]);
    expect(sql).toContain("WHERE discountAmount >=");
    expect(sql).toContain("OR leakageRate >=");
  });

  it("computes leakageRate via a CTE so the window function never appears directly in a WHERE clause", async () => {
    mockQueryRaw.mockResolvedValueOnce([]);
    await getDiscountWatchlist(BASE);

    const { sql } = flattenSql(mockQueryRaw.mock.calls[0][0]);
    expect(sql).toContain("WITH DiscountRows AS");
    expect(sql).toContain("OVER (PARTITION BY ad.invoiceId)");
    // The outer WHERE/ORDER BY reference the CTE's plain "leakageRate" column,
    // not a second OVER(...) call.
    const afterCte = sql.split(")\n    SELECT TOP")[1] ?? "";
    expect(afterCte).not.toContain("OVER");
  });

  it("limits rows via a parameterized TOP, ordered by severity rank then amount", async () => {
    mockQueryRaw.mockResolvedValueOnce([]);
    await getDiscountWatchlist(BASE);

    const { sql, values } = flattenSql(mockQueryRaw.mock.calls[0][0]);
    expect(sql).toContain("SELECT TOP (?) *");
    expect(values).toContain(20);
    expect(sql).toContain("ORDER BY");
    expect(sql).toContain("discountAmount DESC");
  });
});

// ---------------------------------------------------------------------------
// 21. Integrity warning
// ---------------------------------------------------------------------------

describe("hasCriticalDiscountIntegrityIssue (test 21)", () => {
  it("returns true when an OPEN CRITICAL INVOICE_BALANCE issue exists", async () => {
    mockQueryRaw.mockResolvedValueOnce([{ count: 1 }]);

    const result = await hasCriticalDiscountIntegrityIssue("org-1");

    expect(result).toBe(true);
    const { sql } = flattenSql(mockQueryRaw.mock.calls[0][0]);
    expect(sql).toContain("severity = 'CRITICAL'");
    expect(sql).toContain("category = 'INVOICE_BALANCE'");
  });

  it("returns false when no such issue exists", async () => {
    mockQueryRaw.mockResolvedValueOnce([{ count: 0 }]);
    const result = await hasCriticalDiscountIntegrityIssue("org-1");
    expect(result).toBe(false);
  });
});
