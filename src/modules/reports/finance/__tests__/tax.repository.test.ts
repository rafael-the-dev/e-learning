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
  getTaxKPIs,
  getTaxByRule,
  getTaxByBranch,
  getTaxMonthlyTrend,
  listTaxRows,
  hasCriticalTaxIntegrityIssue,
} from "../repositories/tax.repository";
import type { TaxReportFilters } from "../types";

const BASE: TaxReportFilters = { organizationId: "org-1", page: 1, pageSize: 20 };

beforeEach(() => {
  vi.clearAllMocks();
});

function rawTaxRow(overrides: Partial<{
  id: string; invoiceId: string; invoiceNumber: string; studentId: string | null;
  firstName: string | null; lastName: string | null; branchId: string | null; branchName: string | null;
  taxRuleId: string; taxRuleName: string; taxRate: number; taxableBase: number; taxAmount: number;
  invoiceTotal: number; issueDate: Date; status: string;
}> = {}) {
  return {
    id: "applied-tax-1",
    invoiceId: "invoice-1",
    invoiceNumber: "INV-0001",
    studentId: "student-1",
    firstName: "Maria",
    lastName: "Silva",
    branchId: "branch-1",
    branchName: "Filial Central",
    taxRuleId: "tax-rule-1",
    taxRuleName: "IVA",
    taxRate: 17,
    taxableBase: 1000,
    taxAmount: 170,
    invoiceTotal: 1170,
    issueDate: new Date("2026-03-15"),
    status: "PAID",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// 1. KPI totals
// ---------------------------------------------------------------------------

describe("getTaxKPIs (test 1: KPI totals)", () => {
  it("combines the applied-tax aggregate and invoice aggregate into the full KPI set", async () => {
    mockQueryRaw.mockResolvedValueOnce([{ totalTaxAmount: 1700, taxableBase: 10000 }]);
    mockQueryRaw.mockResolvedValueOnce([{ grossInvoiced: 50000, taxedInvoicesCount: BigInt(8), exemptAmount: 5000 }]);

    const kpis = await getTaxKPIs(BASE);

    expect(kpis.totalTaxAmount).toBe(1700);
    expect(kpis.taxableBase).toBe(10000);
    expect(kpis.grossInvoiced).toBe(50000);
    expect(kpis.taxedInvoicesCount).toBe(8);
    expect(kpis.exemptAmount).toBe(5000);
    expect(kpis.averageEffectiveTaxRate).toBeCloseTo(17, 5);
  });

  it("guards against divide-by-zero when taxable base is zero", async () => {
    mockQueryRaw.mockResolvedValueOnce([{ totalTaxAmount: 0, taxableBase: 0 }]);
    mockQueryRaw.mockResolvedValueOnce([{ grossInvoiced: 0, taxedInvoicesCount: BigInt(0), exemptAmount: 0 }]);

    const kpis = await getTaxKPIs(BASE);
    expect(kpis.averageEffectiveTaxRate).toBe(0);
  });

  it("derives taxableBase from amount / (rate/100), not a stored column", async () => {
    mockQueryRaw.mockResolvedValueOnce([{ totalTaxAmount: 0, taxableBase: 0 }]);
    mockQueryRaw.mockResolvedValueOnce([{ grossInvoiced: 0, taxedInvoicesCount: BigInt(0), exemptAmount: 0 }]);

    await getTaxKPIs(BASE);

    const { sql } = flattenSql(mockQueryRaw.mock.calls[0][0]);
    expect(sql).toContain("CAST(at.amount AS FLOAT) / (CAST(at.rate AS FLOAT) / 100)");
  });
});

// ---------------------------------------------------------------------------
// 2. Tax by rule
// ---------------------------------------------------------------------------

describe("getTaxByRule (test 2)", () => {
  it("groups by tax rule and aggregates amount/base/count in SQL", async () => {
    mockQueryRaw.mockResolvedValueOnce([
      { taxRuleId: "tax-rule-1", taxRuleName: "IVA", taxAmount: 1700, taxableBase: 10000, count: BigInt(8) },
    ]);

    const rows = await getTaxByRule(BASE);

    expect(rows).toEqual([
      { taxRuleId: "tax-rule-1", taxRuleName: "IVA", taxAmount: 1700, taxableBase: 10000, count: 8 },
    ]);

    const { sql } = flattenSql(mockQueryRaw.mock.calls[0][0]);
    expect(sql).toContain("GROUP BY at.taxRuleId, tr.name");
  });
});

// ---------------------------------------------------------------------------
// 3. Tax by branch
// ---------------------------------------------------------------------------

describe("getTaxByBranch (test 3)", () => {
  it("groups by branch and falls back to 'Sem Filial' when null", async () => {
    mockQueryRaw.mockResolvedValueOnce([
      { branchId: null, branchName: null, taxAmount: 250, taxableBase: 1470 },
    ]);

    const rows = await getTaxByBranch(BASE);

    expect(rows).toEqual([
      { branchId: null, branchName: "Sem Filial", taxAmount: 250, taxableBase: 1470 },
    ]);

    const { sql } = flattenSql(mockQueryRaw.mock.calls[0][0]);
    expect(sql).toContain("GROUP BY i.branchId, b.name");
  });
});

// ---------------------------------------------------------------------------
// 4. Date filter
// ---------------------------------------------------------------------------

describe("date filter (test 4)", () => {
  it("binds issueDate >= dateFrom and <= dateTo as parameters", async () => {
    mockQueryRaw.mockResolvedValueOnce([]);
    mockQueryRaw.mockResolvedValueOnce([{ total: BigInt(0) }]);

    await listTaxRows({ ...BASE, dateFrom: "2026-01-01", dateTo: "2026-01-31" });

    const { sql, values } = flattenSql(mockQueryRaw.mock.calls[0][0]);
    expect(sql).toContain("i.issueDate >=");
    expect(sql).toContain("i.issueDate <=");
    expect(values).toContainEqual(new Date("2026-01-01"));
    expect(values).toContainEqual(new Date("2026-01-31"));
  });

  it("applies the date range identically to the monthly trend query", async () => {
    mockQueryRaw.mockResolvedValueOnce([]);
    await getTaxMonthlyTrend({ ...BASE, dateFrom: "2026-01-01", dateTo: "2026-01-31" });

    const { sql } = flattenSql(mockQueryRaw.mock.calls[0][0]);
    expect(sql).toContain("i.issueDate >=");
    expect(sql).toContain("i.issueDate <=");
    expect(sql).toContain("GROUP BY CONVERT(VARCHAR(7), i.issueDate, 120)");
  });
});

// ---------------------------------------------------------------------------
// 5. Cancelled invoice exclusion
// ---------------------------------------------------------------------------

describe("cancelled invoice exclusion (test 5)", () => {
  it("excludes CANCELLED invoices by default", async () => {
    mockQueryRaw.mockResolvedValueOnce([]);
    mockQueryRaw.mockResolvedValueOnce([{ total: BigInt(0) }]);

    await listTaxRows(BASE);

    const { sql } = flattenSql(mockQueryRaw.mock.calls[0][0]);
    expect(sql).toContain("i.status <> 'CANCELLED'");
  });

  it("uses an exact status match instead when invoiceStatus filter is supplied", async () => {
    mockQueryRaw.mockResolvedValueOnce([]);
    mockQueryRaw.mockResolvedValueOnce([{ total: BigInt(0) }]);

    await listTaxRows({ ...BASE, invoiceStatus: "PAID" });

    const { sql, values } = flattenSql(mockQueryRaw.mock.calls[0][0]);
    expect(sql).toContain("i.status =");
    expect(sql).not.toContain("i.status <> 'CANCELLED'");
    expect(values).toContain("PAID");
  });

  it("also excludes CANCELLED invoices by default on the invoice-rooted KPI query", async () => {
    mockQueryRaw.mockResolvedValueOnce([{ totalTaxAmount: 0, taxableBase: 0 }]);
    mockQueryRaw.mockResolvedValueOnce([{ grossInvoiced: 0, taxedInvoicesCount: BigInt(0), exemptAmount: 0 }]);

    await getTaxKPIs(BASE);

    const { sql } = flattenSql(mockQueryRaw.mock.calls[1][0]);
    expect(sql).toContain("i.status <> 'CANCELLED'");
  });
});

// ---------------------------------------------------------------------------
// 6. Tenant isolation
// ---------------------------------------------------------------------------

describe("tenant isolation (test 6)", () => {
  it("binds organizationId as a parameter on the applied-tax-rooted table query, never interpolated", async () => {
    mockQueryRaw.mockResolvedValueOnce([]);
    mockQueryRaw.mockResolvedValueOnce([{ total: BigInt(0) }]);

    await listTaxRows({ organizationId: "org-secret", page: 1, pageSize: 20 });

    const { sql, values } = flattenSql(mockQueryRaw.mock.calls[0][0]);
    expect(sql).not.toContain("org-secret");
    expect(sql).toContain("at.organizationId =");
    expect(values).toContain("org-secret");
  });

  it("binds organizationId on the invoice-rooted KPI query too", async () => {
    mockQueryRaw.mockResolvedValueOnce([{ totalTaxAmount: 0, taxableBase: 0 }]);
    mockQueryRaw.mockResolvedValueOnce([{ grossInvoiced: 0, taxedInvoicesCount: BigInt(0), exemptAmount: 0 }]);

    await getTaxKPIs({ ...BASE, organizationId: "org-secret" });

    const { sql, values } = flattenSql(mockQueryRaw.mock.calls[1][0]);
    expect(sql).not.toContain("org-secret");
    expect(sql).toContain("i.organizationId =");
    expect(values).toContain("org-secret");
  });
});

// ---------------------------------------------------------------------------
// 7. Export respects filters (same code path the export route calls)
// ---------------------------------------------------------------------------

describe("export respects filters (test 7)", () => {
  it("applies branch, course, tax rule, invoice status and date range together", async () => {
    mockQueryRaw.mockResolvedValueOnce([]);
    mockQueryRaw.mockResolvedValueOnce([{ total: BigInt(0) }]);

    await listTaxRows({
      organizationId: "org-1",
      branchId: "branch-1",
      courseId: "course-1",
      academicYearId: "year-1",
      academicTermId: "term-1",
      taxRuleId: "tax-rule-1",
      invoiceStatus: "PAID",
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
    expect(sql).toContain("at.taxRuleId =");
    expect(values).toEqual(
      expect.arrayContaining(["branch-1", "course-1", "year-1", "term-1", "tax-rule-1", "PAID"])
    );
  });
});

// ---------------------------------------------------------------------------
// 8. No JS full-table grouping
// ---------------------------------------------------------------------------

describe("no JS full-table grouping (test 8)", () => {
  it("getTaxKPIs issues exactly two aggregate queries, never per-row data", async () => {
    mockQueryRaw.mockResolvedValueOnce([{ totalTaxAmount: 0, taxableBase: 0 }]);
    mockQueryRaw.mockResolvedValueOnce([{ grossInvoiced: 0, taxedInvoicesCount: BigInt(0), exemptAmount: 0 }]);

    await getTaxKPIs(BASE);
    expect(mockQueryRaw).toHaveBeenCalledTimes(2);
  });

  it("getTaxByRule aggregates via GROUP BY rather than fetching all applied taxes", async () => {
    mockQueryRaw.mockResolvedValueOnce([]);
    await getTaxByRule(BASE);
    expect(mockQueryRaw).toHaveBeenCalledTimes(1);
    const { sql } = flattenSql(mockQueryRaw.mock.calls[0][0]);
    expect(sql).toContain("GROUP BY");
    expect(sql).toContain("SUM(");
  });

  it("listTaxRows issues exactly two queries (rows + count), both SQL-bounded", async () => {
    mockQueryRaw.mockResolvedValueOnce([rawTaxRow()]);
    mockQueryRaw.mockResolvedValueOnce([{ total: BigInt(1) }]);

    const { rows, total } = await listTaxRows(BASE);

    expect(mockQueryRaw).toHaveBeenCalledTimes(2);
    expect(rows).toHaveLength(1);
    expect(total).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Pagination / sorting (table is SQL-paginated like every other report)
// ---------------------------------------------------------------------------

describe("pagination and sorting happen in SQL", () => {
  it("uses OFFSET / FETCH NEXT with (page-1)*pageSize bound as a parameter", async () => {
    mockQueryRaw.mockResolvedValueOnce([]);
    mockQueryRaw.mockResolvedValueOnce([{ total: BigInt(0) }]);

    await listTaxRows({ organizationId: "org-1", page: 3, pageSize: 10 });

    const { sql, values } = flattenSql(mockQueryRaw.mock.calls[0][0]);
    expect(sql).toContain("OFFSET");
    expect(sql).toContain("ROWS FETCH NEXT");
    expect(values).toContain(20);
    expect(values).toContain(10);
  });

  it("defaults to issueDate DESC", async () => {
    mockQueryRaw.mockResolvedValueOnce([]);
    mockQueryRaw.mockResolvedValueOnce([{ total: BigInt(0) }]);

    await listTaxRows(BASE);

    const { sql } = flattenSql(mockQueryRaw.mock.calls[0][0]);
    expect(sql).toContain("ORDER BY i.issueDate DESC");
  });

  it("orders by the requested column and direction", async () => {
    mockQueryRaw.mockResolvedValueOnce([]);
    mockQueryRaw.mockResolvedValueOnce([{ total: BigInt(0) }]);

    await listTaxRows({ ...BASE, sortBy: "taxAmount", sortDir: "asc" });

    const { sql } = flattenSql(mockQueryRaw.mock.calls[0][0]);
    expect(sql).toContain("ORDER BY CAST(at.amount AS FLOAT) ASC");
  });
});

// ---------------------------------------------------------------------------
// Integrity warning
// ---------------------------------------------------------------------------

describe("hasCriticalTaxIntegrityIssue", () => {
  it("returns true when an OPEN CRITICAL INVOICE_BALANCE issue exists", async () => {
    mockQueryRaw.mockResolvedValueOnce([{ count: 1 }]);

    const result = await hasCriticalTaxIntegrityIssue("org-1");

    expect(result).toBe(true);
    const { sql } = flattenSql(mockQueryRaw.mock.calls[0][0]);
    expect(sql).toContain("severity = 'CRITICAL'");
    expect(sql).toContain("category = 'INVOICE_BALANCE'");
  });

  it("returns false when no such issue exists", async () => {
    mockQueryRaw.mockResolvedValueOnce([{ count: 0 }]);
    const result = await hasCriticalTaxIntegrityIssue("org-1");
    expect(result).toBe(false);
  });
});
