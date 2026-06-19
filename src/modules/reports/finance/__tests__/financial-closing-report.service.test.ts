import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  getGrossInvoiced: vi.fn(),
  getGrossCollected: vi.fn(),
  getNetCashTrend: vi.fn(),
  getReceivablesSnapshot: vi.fn(),
  getWalletLiabilitySummary: vi.fn(),
  getRefundExposureSummary: vi.fn(),
  getCompletedRefundsThisPeriod: vi.fn(),
  getIntegrityCounts: vi.fn(),
  getReconciliationSummaryData: vi.fn(),
  getClosingWatchlist: vi.fn(),
  buildControlSummary: vi.fn(),
}));

vi.mock("../repositories/closing.repository", () => mocks);

import { getFinancialClosingReport } from "../services/financial-closing-report.service";
import type { ClosingFilters } from "../types";

const BASE: ClosingFilters = { organizationId: "org-1" };

beforeEach(() => {
  vi.clearAllMocks();

  mocks.getGrossInvoiced.mockResolvedValue(10000);
  mocks.getGrossCollected.mockResolvedValue(8000);
  mocks.getNetCashTrend.mockResolvedValue([
    { month: "2026-04", cashIn: 5000, cashOut: 1000, net: 4000 },
    { month: "2026-05", cashIn: 3000, cashOut: 500, net: 2500 },
  ]);
  mocks.getReceivablesSnapshot.mockResolvedValue({ outstanding: 2000, overdue: 500, dueSoon: 300 });
  mocks.getWalletLiabilitySummary.mockResolvedValue({ totalLiability: 1200, studentsWithCredit: 4, largestBalance: 600 });
  mocks.getRefundExposureSummary.mockResolvedValue({ pendingAmount: 700, requestedCount: 2, approvedCount: 1 });
  mocks.getCompletedRefundsThisPeriod.mockResolvedValue({ count: 3, amount: 900 });
  mocks.getIntegrityCounts.mockResolvedValue({ openCritical: 2, openHigh: 1, openMedium: 0, openLow: 0, walletMismatchCount: 0 });
  mocks.getReconciliationSummaryData.mockResolvedValue({
    missingLedgerEntries: 1,
    duplicateLedgerEntries: 0,
    orphanLedgerEntries: 0,
    invoiceAllocationMismatches: 0,
    receiptAmountMismatches: 0,
    reconciledItems: 50,
    mismatchedItems: 1,
    criticalIssues: 0,
  });
  mocks.getClosingWatchlist.mockResolvedValue([
    {
      severity: "CRITICAL",
      category: "INTEGRITY_CRITICAL",
      entityType: "Invoice",
      entityReference: "INV-1",
      amount: null,
      description: "Fatura desbalanceada",
      recommendedAction: "VIEW_INTEGRITY",
      link: "/reports/finance/integrity",
      detectedAt: new Date("2026-05-01"),
    },
  ]);
  mocks.buildControlSummary.mockReturnValue({
    integrity: { openCritical: 2, openHigh: 1, openMedium: 0, openLow: 0 },
    reconciliation: { reconciled: 50, unreconciled: 1 },
    receivables: { outstanding: 2000, overdue: 500, dueSoon: 300 },
    refunds: { requestedCount: 2, approvedCount: 1, completedThisPeriodCount: 3, completedThisPeriodAmount: 900 },
    wallet: { totalLiability: 1200, studentsWithCredit: 4, largestBalance: 600 },
  });
});

// ---------------------------------------------------------------------------
// 1. KPIs calculate correctly
// ---------------------------------------------------------------------------

describe("getFinancialClosingReport — KPIs calculate correctly (test 1)", () => {
  it("derives netCashPosition by summing the net cash trend and maps every KPI from its source", async () => {
    const report = await getFinancialClosingReport(BASE);

    expect(report.kpis).toEqual({
      grossInvoiced: 10000,
      grossCollected: 8000,
      netCashPosition: 6500,
      outstandingReceivables: 2000,
      overdueReceivables: 500,
      walletLiability: 1200,
      refundExposure: 700,
      criticalFinancialIssues: 2,
    });
  });

  it("derives the trust score from the integrity/reconciliation counts produced by the repository", async () => {
    const report = await getFinancialClosingReport(BASE);

    // openCritical>0 (-25) and openHigh>0 (-15); reconciliation/wallet flags are all clear here.
    expect(report.trustScore.score).toBe(60);
    expect(report.trustScore.deductions.map((d) => d.reason)).toEqual([
      "UNRESOLVED_CRITICAL_INTEGRITY",
      "UNRESOLVED_HIGH_INTEGRITY",
    ]);
  });
});

// ---------------------------------------------------------------------------
// 13. Export includes KPIs + trust score + watchlist
// ---------------------------------------------------------------------------

describe("getFinancialClosingReport — report shape for the executive CSV export (test 13)", () => {
  it("returns every section the /api/reports/finance/export/closing branch consumes", async () => {
    const report = await getFinancialClosingReport(BASE);

    expect(report.kpis).toBeDefined();
    expect(report.trustScore.score).toBeTypeOf("number");
    expect(report.trustScore.rating).toBeTypeOf("string");
    expect(report.watchlist).toHaveLength(1);
    expect(report.watchlist[0].entityReference).toBe("INV-1");
    expect(report.controlSummary).toBeDefined();
    expect(report.reconciliationSummary).toBeDefined();
  });
});
