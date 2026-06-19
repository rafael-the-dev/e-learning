import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  getInvoiceMonthlyAggregates: vi.fn(),
  getRefundMonthlyAggregates: vi.fn(),
}));

vi.mock("../repositories/revenue-trend.repository", () => mocks);

import { getRevenueTrendReport } from "../services/revenue-trend-report.service";
import type { RevenueTrendFilters } from "../types";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getInvoiceMonthlyAggregates.mockResolvedValue([]);
  mocks.getRefundMonthlyAggregates.mockResolvedValue([]);
});

// ---------------------------------------------------------------------------
// 2. Zero-fill months
// ---------------------------------------------------------------------------

describe("getRevenueTrendReport — zero-fills missing months (test 2)", () => {
  it("fills every month in the requested range, even ones with no SQL rows", async () => {
    mocks.getInvoiceMonthlyAggregates.mockResolvedValue([
      { month: "2026-05", invoiced: 1000, collected: 600, outstanding: 400 },
    ]);

    const filters: RevenueTrendFilters = { organizationId: "org-1", dateFrom: "2026-04-01", dateTo: "2026-06-30" };
    const { rows } = await getRevenueTrendReport(filters);

    expect(rows.map((r) => r.month)).toEqual(["2026-04", "2026-05", "2026-06"]);

    const april = rows.find((r) => r.month === "2026-04")!;
    expect(april).toEqual({
      month: "2026-04",
      invoiced: 0,
      collected: 0,
      refunded: 0,
      netCollected: 0,
      outstanding: 0,
      collectionRate: 0,
    });
  });

  it("defaults to the trailing 12 months when no date range is supplied", async () => {
    const { rows } = await getRevenueTrendReport({ organizationId: "org-1" });
    expect(rows).toHaveLength(12);
  });
});

// ---------------------------------------------------------------------------
// 5. Net collected formula
// ---------------------------------------------------------------------------

describe("getRevenueTrendReport — net collected formula (test 5)", () => {
  it("computes netCollected = collected - refunded per month and at the KPI level", async () => {
    mocks.getInvoiceMonthlyAggregates.mockResolvedValue([
      { month: "2026-05", invoiced: 1000, collected: 600, outstanding: 400 },
    ]);
    mocks.getRefundMonthlyAggregates.mockResolvedValue([{ month: "2026-05", refunded: 100 }]);

    const filters: RevenueTrendFilters = { organizationId: "org-1", dateFrom: "2026-05-01", dateTo: "2026-05-31" };
    const { kpis, rows } = await getRevenueTrendReport(filters);

    expect(rows[0].netCollected).toBe(500);
    expect(kpis.netCollected).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// 6. Collection rate formula
// ---------------------------------------------------------------------------

describe("getRevenueTrendReport — collection rate formula (test 6)", () => {
  it("computes collectionRate = collected / invoiced * 100", async () => {
    mocks.getInvoiceMonthlyAggregates.mockResolvedValue([
      { month: "2026-05", invoiced: 1000, collected: 600, outstanding: 400 },
    ]);

    const filters: RevenueTrendFilters = { organizationId: "org-1", dateFrom: "2026-05-01", dateTo: "2026-05-31" };
    const { kpis, rows } = await getRevenueTrendReport(filters);

    expect(rows[0].collectionRate).toBe(60);
    expect(kpis.collectionRate).toBe(60);
  });

  it("guards against division by zero when invoiced is 0", async () => {
    const filters: RevenueTrendFilters = { organizationId: "org-1", dateFrom: "2026-05-01", dateTo: "2026-05-31" };
    const { kpis, rows } = await getRevenueTrendReport(filters);

    expect(rows[0].collectionRate).toBe(0);
    expect(kpis.collectionRate).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 9. Export shape
// ---------------------------------------------------------------------------

describe("getRevenueTrendReport — export shape (test 9)", () => {
  it("returns the exact KPI and row fields the CSV export branch maps over", async () => {
    mocks.getInvoiceMonthlyAggregates.mockResolvedValue([
      { month: "2026-05", invoiced: 1000, collected: 600, outstanding: 400 },
    ]);
    mocks.getRefundMonthlyAggregates.mockResolvedValue([{ month: "2026-05", refunded: 100 }]);

    const filters: RevenueTrendFilters = { organizationId: "org-1", dateFrom: "2026-05-01", dateTo: "2026-05-31" };
    const { kpis, rows } = await getRevenueTrendReport(filters);

    expect(Object.keys(kpis).sort()).toEqual(
      ["collectionRate", "netCollected", "outstandingBalance", "totalCollected", "totalInvoiced", "totalRefunded"].sort()
    );
    expect(Object.keys(rows[0]).sort()).toEqual(
      ["collectionRate", "collected", "invoiced", "month", "netCollected", "outstanding", "refunded"].sort()
    );
  });
});
