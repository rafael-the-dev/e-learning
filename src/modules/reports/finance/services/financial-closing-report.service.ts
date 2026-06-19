import {
  getGrossInvoiced,
  getGrossCollected,
  getNetCashTrend,
  getReceivablesSnapshot,
  getWalletLiabilitySummary,
  getRefundExposureSummary,
  getCompletedRefundsThisPeriod,
  getIntegrityCounts,
  getReconciliationSummaryData,
  getClosingWatchlist,
  buildControlSummary,
} from "../repositories/closing.repository";
import { calculateFinancialTrustScore } from "../utils/trust-score";
import type { ClosingFilters, ClosingKPIs, ClosingReport } from "../types";

export async function getFinancialClosingReport(filters: ClosingFilters): Promise<ClosingReport> {
  const [
    grossInvoiced,
    grossCollected,
    netCashTrend,
    receivables,
    walletSummary,
    refundExposure,
    completedRefunds,
    integrityCounts,
    reconciliationSummary,
    watchlist,
  ] = await Promise.all([
    getGrossInvoiced(filters),
    getGrossCollected(filters),
    getNetCashTrend(filters),
    getReceivablesSnapshot(filters),
    getWalletLiabilitySummary(filters),
    getRefundExposureSummary(filters),
    getCompletedRefundsThisPeriod(filters),
    getIntegrityCounts(filters),
    getReconciliationSummaryData(filters),
    getClosingWatchlist(filters),
  ]);

  const netCashPosition = netCashTrend.reduce((sum, point) => sum + point.net, 0);

  const kpis: ClosingKPIs = {
    grossInvoiced,
    grossCollected,
    netCashPosition,
    outstandingReceivables: receivables.outstanding,
    overdueReceivables: receivables.overdue,
    walletLiability: walletSummary.totalLiability,
    refundExposure: refundExposure.pendingAmount,
    criticalFinancialIssues: integrityCounts.openCritical,
  };

  const trustScore = calculateFinancialTrustScore({
    hasUnresolvedCriticalIntegrity: integrityCounts.openCritical > 0,
    hasUnresolvedHighIntegrity: integrityCounts.openHigh > 0,
    hasCriticalReconciliationMismatch: reconciliationSummary.criticalIssues > 0,
    hasDuplicateLedgerEntries: reconciliationSummary.duplicateLedgerEntries > 0,
    hasOrphanLedgerEntries: reconciliationSummary.orphanLedgerEntries > 0,
    hasWalletLiabilityMismatch: integrityCounts.walletMismatchCount > 0,
  });

  const controlSummary = buildControlSummary({
    integrity: {
      openCritical: integrityCounts.openCritical,
      openHigh: integrityCounts.openHigh,
      openMedium: integrityCounts.openMedium,
      openLow: integrityCounts.openLow,
    },
    reconciliation: reconciliationSummary,
    receivables,
    refundExposure,
    completedRefunds,
    wallet: walletSummary,
  });

  return {
    kpis,
    trustScore,
    netCashTrend,
    watchlist,
    controlSummary,
    reconciliationSummary,
  };
}
