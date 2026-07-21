import { getAccountsReceivableKPIs, listAccountsReceivable } from "../repositories/accounts-receivable.repository";
import { getAgingKPIs, listAgingRows } from "../repositories/aging.repository";
import { getPaymentsReportKPIs, listPaymentsReport } from "../repositories/payments-report.repository";
import { getRefundsReportKPIs, listRefundsReport } from "../repositories/refunds-report.repository";
import { getCashFlowKPIs, listCashFlowEntries } from "../repositories/cash-flow.repository";
import {
  getStudentInfo,
  getStudentStatementKPIs,
  getStudentInvoices,
  getStudentPayments,
  getStudentReceipts,
  getStudentWalletTransactions,
  getStudentRefunds,
  getStudentLedger,
} from "../repositories/student-statement.repository";
// M2 — server-side paginated finance-history reads, exposed for the Student 360 finance tab.
export {
  getStudentInvoicesPage,
  getStudentPaymentsPage,
  getStudentReceiptsPage,
  getStudentRefundsPage,
} from "../repositories/student-statement.repository";
// H3 — aggregate-only finance summary (no list loading), for KPIs / risk / portals.
export {
  getStudentFinanceSummary,
  type StudentFinanceSummary,
} from "../repositories/student-finance-summary.repository";
import { getIntegrityReportKPIs, listIntegrityIssuesForReport } from "../repositories/integrity-report.repository";
import { getStudentDebtKPIs, listStudentDebtRows } from "../repositories/student-debt.repository";
import { getCollectionsKPIs, listCollectionsRows } from "../repositories/collections.repository";
import { getBranchRevenueReport as _getBranchRevenueReport } from "../repositories/branch-revenue.repository";
import {
  getWalletActivityKPIs,
  getWalletTypeBreakdown,
  getWalletMonthlyTrend,
  listWalletActivityRows,
} from "../repositories/wallet-activity.repository";
import { getCourseRevenueReport as _getCourseRevenueReport } from "../repositories/course-revenue.repository";
import { getFinancialReconciliationReport as _getFinancialReconciliationReport } from "./financial-reconciliation-report.service";
import { getFinancialClosingReport as _getFinancialClosingReport } from "./financial-closing-report.service";
import { getRevenueTrendReport as _getRevenueTrendReport } from "./revenue-trend-report.service";
import { getWalletLiabilityReport as _getWalletLiabilityReport } from "./wallet-liability-report.service";
import {
  getTaxKPIs,
  getTaxByRule,
  getTaxByBranch,
  getTaxMonthlyTrend,
  listTaxRows,
  hasCriticalTaxIntegrityIssue,
} from "../repositories/tax.repository";
import { getDiscountReport as _getDiscountReport } from "./discount-report.service";
import { getPaymentMethodMixReport as _getPaymentMethodMixReport } from "./payment-method-report.service";
import { getRefundAnalysisReport as _getRefundAnalysisReport } from "./refund-analysis-report.service";
import type {
  AccountsReceivableFilters,
  AccountsReceivableReport,
  AgingFilters,
  AgingReport,
  PaymentsReportFilters,
  PaymentsReport,
  RefundsReportFilters,
  RefundsReport,
  CashFlowFilters,
  CashFlowReport,
  StudentStatementFilters,
  StudentFinancialStatement,
  IntegrityReportFilters,
  IntegrityReport,
  StudentDebtFilters,
  StudentDebtReport,
  CollectionsFilters,
  CollectionsReport,
  BranchRevenueFilters,
  BranchRevenueReport,
  WalletActivityFilters,
  WalletActivityReport,
  CourseRevenueFilters,
  CourseRevenueReport,
  ReconciliationFilters,
  ReconciliationReport,
  ClosingFilters,
  ClosingReport,
  RevenueTrendFilters,
  RevenueTrendReport,
  WalletLiabilityFilters,
  WalletLiabilityReport,
  TaxReportFilters,
  TaxReport,
  DiscountReportFilters,
  DiscountReport,
  PaymentMethodMixFilters,
  PaymentMethodMixReport,
  RefundAnalysisFilters,
  RefundAnalysisReport,
} from "../types";

// =============================================================================
// ACCOUNTS RECEIVABLE
// =============================================================================

export async function getAccountsReceivableReport(
  filters: AccountsReceivableFilters
): Promise<AccountsReceivableReport> {
  const [kpis, { rows, total }] = await Promise.all([
    getAccountsReceivableKPIs(filters),
    listAccountsReceivable(filters),
  ]);

  const totalPages = Math.ceil(total / filters.pageSize);

  return {
    kpis,
    rows,
    total,
    page: filters.page,
    pageSize: filters.pageSize,
    totalPages,
  };
}

// =============================================================================
// AGING
// =============================================================================

export async function getAgingReport(filters: AgingFilters): Promise<AgingReport> {
  const [{ kpis, buckets }, { rows, total }] = await Promise.all([
    getAgingKPIs(filters),
    listAgingRows(filters),
  ]);

  const totalPages = Math.ceil(total / filters.pageSize);

  return {
    kpis,
    buckets,
    rows,
    total,
    page: filters.page,
    pageSize: filters.pageSize,
    totalPages,
  };
}

// =============================================================================
// PAYMENTS
// =============================================================================

export async function getPaymentsReport(filters: PaymentsReportFilters): Promise<PaymentsReport> {
  const [{ kpis, methodBreakdown, monthlyTrend }, { rows, total }] = await Promise.all([
    getPaymentsReportKPIs(filters),
    listPaymentsReport(filters),
  ]);

  const totalPages = Math.ceil(total / filters.pageSize);

  return {
    kpis,
    methodBreakdown,
    monthlyTrend,
    rows,
    total,
    page: filters.page,
    pageSize: filters.pageSize,
    totalPages,
  };
}

// =============================================================================
// REFUNDS
// =============================================================================

export async function getRefundsReport(filters: RefundsReportFilters): Promise<RefundsReport> {
  const [{ kpis, methodBreakdown, monthlyTrend }, { rows, total }] = await Promise.all([
    getRefundsReportKPIs(filters),
    listRefundsReport(filters),
  ]);

  const totalPages = Math.ceil(total / filters.pageSize);

  return {
    kpis,
    methodBreakdown,
    monthlyTrend,
    rows,
    total,
    page: filters.page,
    pageSize: filters.pageSize,
    totalPages,
  };
}

// =============================================================================
// CASH FLOW
// =============================================================================

export async function getCashFlowReport(
  filters: CashFlowFilters & { page: number; pageSize: number }
): Promise<CashFlowReport> {
  const [{ kpis, monthlyTrend }, { entries, total }] = await Promise.all([
    getCashFlowKPIs(filters),
    listCashFlowEntries(filters),
  ]);

  return {
    kpis,
    monthlyTrend,
    entries,
    total,
    page: filters.page,
    pageSize: filters.pageSize,
  };
}

// =============================================================================
// INTEGRITY REPORT
// =============================================================================

export async function getIntegrityReport(
  filters: IntegrityReportFilters
): Promise<IntegrityReport> {
  const [kpis, { rows, total }] = await Promise.all([
    getIntegrityReportKPIs(filters.organizationId),
    listIntegrityIssuesForReport(filters),
  ]);

  return {
    kpis,
    rows,
    total,
    page: filters.page,
    pageSize: filters.pageSize,
    totalPages: Math.ceil(total / filters.pageSize),
  };
}

// =============================================================================
// STUDENT DEBT REPORT
// =============================================================================

export async function getStudentDebtReport(
  filters: StudentDebtFilters
): Promise<StudentDebtReport> {
  const [kpis, { rows, total }] = await Promise.all([
    getStudentDebtKPIs(filters),
    listStudentDebtRows(filters),
  ]);

  return {
    kpis,
    rows,
    total,
    page: filters.page,
    pageSize: filters.pageSize,
    totalPages: Math.ceil(total / filters.pageSize),
  };
}

// =============================================================================
// COLLECTIONS REPORT
// =============================================================================

export async function getCollectionsReport(
  filters: CollectionsFilters
): Promise<CollectionsReport> {
  const [kpis, { rows, total }] = await Promise.all([
    getCollectionsKPIs(filters),
    listCollectionsRows(filters),
  ]);

  return {
    kpis,
    rows,
    total,
    page: filters.page,
    pageSize: filters.pageSize,
    totalPages: Math.ceil(total / filters.pageSize),
  };
}

// =============================================================================
// BRANCH REVENUE REPORT
// =============================================================================

export async function getBranchRevenueReport(
  filters: BranchRevenueFilters
): Promise<BranchRevenueReport> {
  return _getBranchRevenueReport(filters);
}

// =============================================================================
// WALLET ACTIVITY REPORT
// =============================================================================

export async function getWalletActivityReport(
  filters: WalletActivityFilters
): Promise<WalletActivityReport> {
  const [kpis, typeBreakdown, monthlyTrend, { rows, total }] = await Promise.all([
    getWalletActivityKPIs(filters),
    getWalletTypeBreakdown(filters),
    getWalletMonthlyTrend(filters),
    listWalletActivityRows(filters),
  ]);

  return {
    kpis,
    rows,
    typeBreakdown,
    monthlyTrend,
    total,
    page: filters.page,
    pageSize: filters.pageSize,
    totalPages: Math.ceil(total / filters.pageSize),
  };
}

// =============================================================================
// COURSE REVENUE REPORT
// =============================================================================

export async function getCourseRevenueReport(
  filters: CourseRevenueFilters
): Promise<CourseRevenueReport> {
  return _getCourseRevenueReport(filters);
}

// =============================================================================
// FINANCIAL RECONCILIATION REPORT
// =============================================================================

export async function getFinancialReconciliationReport(
  filters: ReconciliationFilters
): Promise<ReconciliationReport> {
  return _getFinancialReconciliationReport(filters);
}

// =============================================================================
// FINANCIAL CLOSING DASHBOARD
// =============================================================================

export async function getFinancialClosingReport(filters: ClosingFilters): Promise<ClosingReport> {
  return _getFinancialClosingReport(filters);
}

// =============================================================================
// REVENUE TREND REPORT
// =============================================================================

export async function getRevenueTrendReport(filters: RevenueTrendFilters): Promise<RevenueTrendReport> {
  return _getRevenueTrendReport(filters);
}

// =============================================================================
// WALLET LIABILITY REPORT
// =============================================================================

export async function getWalletLiabilityReport(filters: WalletLiabilityFilters): Promise<WalletLiabilityReport> {
  return _getWalletLiabilityReport(filters);
}

// =============================================================================
// TAX REPORT
// =============================================================================

export async function getTaxReport(filters: TaxReportFilters): Promise<TaxReport> {
  const [kpis, byRule, byBranch, monthlyTrend, { rows, total }, hasCriticalIntegrityIssue] = await Promise.all([
    getTaxKPIs(filters),
    getTaxByRule(filters),
    getTaxByBranch(filters),
    getTaxMonthlyTrend(filters),
    listTaxRows(filters),
    hasCriticalTaxIntegrityIssue(filters.organizationId),
  ]);

  return {
    kpis,
    byRule,
    byBranch,
    monthlyTrend,
    rows,
    total,
    page: filters.page,
    pageSize: filters.pageSize,
    totalPages: Math.ceil(total / filters.pageSize),
    hasCriticalIntegrityIssue,
  };
}

// =============================================================================
// DISCOUNT & REVENUE LEAKAGE REPORT
// =============================================================================

export async function getDiscountReport(filters: DiscountReportFilters): Promise<DiscountReport> {
  return _getDiscountReport(filters);
}

// =============================================================================
// PAYMENT METHOD MIX REPORT
// =============================================================================

export async function getPaymentMethodMixReport(filters: PaymentMethodMixFilters): Promise<PaymentMethodMixReport> {
  return _getPaymentMethodMixReport(filters);
}

// =============================================================================
// REFUND ANALYSIS REPORT
// =============================================================================

export async function getRefundAnalysisReport(filters: RefundAnalysisFilters): Promise<RefundAnalysisReport> {
  return _getRefundAnalysisReport(filters);
}

// =============================================================================
// STUDENT FINANCIAL STATEMENT
// =============================================================================

export async function getStudentFinancialStatement(
  filters: StudentStatementFilters
): Promise<StudentFinancialStatement | null> {
  const student = await getStudentInfo(filters.studentId, filters.organizationId);
  if (!student) return null;

  const [kpis, invoices, payments, receipts, walletTransactions, refunds, ledger] =
    await Promise.all([
      getStudentStatementKPIs(filters),
      getStudentInvoices(filters),
      getStudentPayments(filters),
      getStudentReceipts(filters),
      getStudentWalletTransactions(filters),
      getStudentRefunds(filters),
      getStudentLedger(filters),
    ]);

  return {
    student,
    kpis,
    invoices,
    payments,
    receipts,
    walletTransactions,
    refunds,
    ledger,
  };
}
