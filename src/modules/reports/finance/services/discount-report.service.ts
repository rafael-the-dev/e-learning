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
import type { DiscountReportFilters, DiscountReport } from "../types";

export async function getDiscountReport(filters: DiscountReportFilters): Promise<DiscountReport> {
  const [kpis, byRule, byBranch, byCourse, byMonth, { rows, total }, watchlist, hasCriticalIntegrityIssue] = await Promise.all([
    getDiscountKPIs(filters),
    getDiscountByRule(filters),
    getDiscountByBranch(filters),
    getDiscountByCourse(filters),
    getDiscountMonthlyTrend(filters),
    listDiscountRows(filters),
    getDiscountWatchlist(filters),
    hasCriticalDiscountIntegrityIssue(filters.organizationId),
  ]);

  return {
    kpis,
    watchlist,
    byMonth,
    byRule,
    byBranch,
    byCourse,
    rows,
    total,
    page: filters.page,
    pageSize: filters.pageSize,
    totalPages: Math.ceil(total / filters.pageSize),
    hasCriticalIntegrityIssue,
  };
}
