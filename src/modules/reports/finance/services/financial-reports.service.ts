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
