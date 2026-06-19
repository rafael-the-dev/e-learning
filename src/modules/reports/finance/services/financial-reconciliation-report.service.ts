import { getReconciliationKPIs, listReconciliationIssues } from "../repositories/reconciliation.repository";
import type { ReconciliationFilters, ReconciliationReport } from "../types";

const WATCHLIST_SIZE = 10;

// =============================================================================
// FINANCIAL RECONCILIATION REPORT SERVICE
// Calculated comparison view for auditors. Distinct from the Financial
// Integrity Report (which surfaces stored, job-detected issues) — this report
// recomputes ledger-vs-source comparisons live, via SQL aggregation, on every
// request. Strictly read-only: never writes or auto-repairs anything.
// =============================================================================

export async function getFinancialReconciliationReport(
  filters: ReconciliationFilters
): Promise<ReconciliationReport> {
  const scopeOnly = {
    organizationId: filters.organizationId,
    branchId: filters.branchId,
    studentId: filters.studentId,
    dateFrom: filters.dateFrom,
    dateTo: filters.dateTo,
  };

  const [kpis, { rows: watchlist }, { rows, total }] = await Promise.all([
    getReconciliationKPIs(scopeOnly),
    // Watchlist ignores the page-level entityType/issueType/severity drill-down —
    // it is always "what needs attention most" across the same org/branch/student/date scope.
    listReconciliationIssues({
      ...scopeOnly,
      severities: ["CRITICAL", "HIGH"],
      page: 1,
      pageSize: WATCHLIST_SIZE,
    }),
    listReconciliationIssues(filters),
  ]);

  return {
    kpis,
    watchlist,
    rows,
    total,
    page: filters.page,
    pageSize: filters.pageSize,
    totalPages: Math.ceil(total / filters.pageSize),
  };
}
