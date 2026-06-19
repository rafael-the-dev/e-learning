import type { RefundAnalysisFilters, RefundAnalysisReport } from "../types";
import {
  listRefundAnalysisRows,
  getRefundAnalysisKPIs,
  getRefundTrend,
  getRefundAmountTrend,
  getRefundByBranch,
  getRefundByCourse,
  getRefundByStatus,
  getRefundProcessingTimeTrend,
  getRefundWatchlist,
  hasCriticalRefundIntegrityIssue,
} from "../repositories/refund-analysis.repository";

export async function getRefundAnalysisReport(filters: RefundAnalysisFilters): Promise<RefundAnalysisReport> {
  const [
    { rows, total },
    kpis,
    trend,
    amountTrend,
    byBranch,
    byCourse,
    byStatus,
    processingTimeTrend,
    watchlist,
    hasCriticalIntegrityIssue,
  ] = await Promise.all([
    listRefundAnalysisRows(filters),
    getRefundAnalysisKPIs(filters),
    getRefundTrend(filters),
    getRefundAmountTrend(filters),
    getRefundByBranch(filters),
    getRefundByCourse(filters),
    getRefundByStatus(filters),
    getRefundProcessingTimeTrend(filters),
    getRefundWatchlist(filters),
    hasCriticalRefundIntegrityIssue(filters.organizationId),
  ]);

  return {
    kpis,
    watchlist,
    trend,
    amountTrend,
    byBranch,
    byCourse,
    byStatus,
    processingTimeTrend,
    rows,
    total,
    page: filters.page,
    pageSize: filters.pageSize,
    totalPages: Math.ceil(total / filters.pageSize),
    hasCriticalIntegrityIssue,
  };
}
