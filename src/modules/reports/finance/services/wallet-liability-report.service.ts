import {
  listWalletLiabilityRows,
  getWalletLiabilityKPIs,
  getWalletLiabilityByBranch,
  getWalletLiabilityByCourse,
  getWalletLiabilityMonthlyTrend,
  getWalletLiabilityWatchlist,
  hasCriticalWalletIntegrityIssue,
} from "../repositories/wallet-liability.repository";
import type { WalletLiabilityFilters, WalletLiabilityReport } from "../types";

export async function getWalletLiabilityReport(filters: WalletLiabilityFilters): Promise<WalletLiabilityReport> {
  const [{ rows, total }, kpis, byBranch, byCourse, monthlyTrend, hasCriticalIntegrityIssue] = await Promise.all([
    listWalletLiabilityRows(filters),
    getWalletLiabilityKPIs(filters),
    getWalletLiabilityByBranch(filters),
    getWalletLiabilityByCourse(filters),
    getWalletLiabilityMonthlyTrend(filters),
    hasCriticalWalletIntegrityIssue(filters.organizationId),
  ]);

  const watchlist = await getWalletLiabilityWatchlist(filters, kpis.totalLiability);

  return {
    kpis,
    watchlist,
    rows,
    total,
    page: filters.page,
    pageSize: filters.pageSize,
    totalPages: Math.ceil(total / filters.pageSize),
    monthlyTrend,
    byBranch,
    byCourse,
    hasCriticalIntegrityIssue,
  };
}
