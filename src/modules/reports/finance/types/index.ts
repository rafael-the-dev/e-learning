import type { PaginationParams } from "@/shared/types/common";

// =============================================================================
// SHARED FILTER TYPES
// =============================================================================

export interface FinancialReportBaseFilters {
  organizationId: string;
  branchId?: string;
  courseId?: string;
  classGroupId?: string;
  studentId?: string;
  academicYearId?: string;
  academicTermId?: string;
  dateFrom?: string;
  dateTo?: string;
}

// =============================================================================
// ACCOUNTS RECEIVABLE REPORT
// =============================================================================

export interface AccountsReceivableFilters extends FinancialReportBaseFilters, PaginationParams {
  dueDateFrom?: string;
  dueDateTo?: string;
  invoiceStatus?: string;
  agingBucket?: string;
  search?: string;
}

export interface AccountsReceivableRow {
  invoiceId: string;
  invoiceNumber: string;
  studentId: string | null;
  studentName: string | null;
  enrollmentId: string | null;
  enrollmentNumber: string | null;
  courseId: string | null;
  courseName: string | null;
  branchId: string | null;
  branchName: string | null;
  issueDate: Date;
  dueDate: Date | null;
  totalAmount: number;
  paidAmount: number;
  balanceAmount: number;
  status: string;
  daysOverdue: number;
  agingBucket: AgingBucket;
}

export interface AccountsReceivableKPIs {
  totalReceivable: number;
  overdueReceivable: number;
  dueSoon: number;
  partiallyPaid: number;
  studentsWithDebt: number;
  invoiceCount: number;
}

export interface AccountsReceivableReport {
  kpis: AccountsReceivableKPIs;
  rows: AccountsReceivableRow[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

// =============================================================================
// AGING REPORT
// =============================================================================

export type AgingBucket = "current" | "1-30" | "31-60" | "61-90" | "90+";

export const AGING_BUCKET_LABELS: Record<AgingBucket, string> = {
  current: "Corrente / Não Vencido",
  "1-30": "1–30 dias",
  "31-60": "31–60 dias",
  "61-90": "61–90 dias",
  "90+": "Mais de 90 dias",
};

export interface AgingFilters extends FinancialReportBaseFilters, PaginationParams {
  agingBucket?: AgingBucket;
  search?: string;
}

export interface AgingRow {
  invoiceId: string;
  invoiceNumber: string;
  studentId: string | null;
  studentName: string | null;
  courseId: string | null;
  courseName: string | null;
  branchId: string | null;
  branchName: string | null;
  dueDate: Date | null;
  balanceAmount: number;
  daysOverdue: number;
  agingBucket: AgingBucket;
}

export interface AgingBucketSummary {
  bucket: AgingBucket;
  label: string;
  count: number;
  totalAmount: number;
}

export interface AgingKPIs {
  totalOutstanding: number;
  current: number;
  bucket1to30: number;
  bucket31to60: number;
  bucket61to90: number;
  bucket90plus: number;
  invoiceCount: number;
}

export interface AgingReport {
  kpis: AgingKPIs;
  buckets: AgingBucketSummary[];
  rows: AgingRow[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

// =============================================================================
// PAYMENTS REPORT
// =============================================================================

export interface PaymentsReportFilters extends FinancialReportBaseFilters, PaginationParams {
  paymentMethod?: string;
  search?: string;
  includeRefunded?: boolean;
}

export interface PaymentsReportRow {
  paymentId: string;
  paymentNumber: string;
  studentId: string | null;
  studentName: string | null;
  invoiceId: string | null;
  invoiceNumber: string | null;
  branchId: string | null;
  branchName: string | null;
  totalAmount: number;
  refundedAmount: number;
  netAmount: number;
  paymentMethods: string[];
  status: string;
  paymentDate: Date;
  confirmedAt: Date | null;
  createdBy: string | null;
}

export interface PaymentMethodBreakdown {
  method: string;
  count: number;
  totalAmount: number;
}

export interface PaymentsReportKPIs {
  totalReceived: number;
  paymentsCount: number;
  averagePayment: number;
  cashReceived: number;
  mobileMoneyReceived: number;
  bankTransferReceived: number;
  refundedTotal: number;
  netReceived: number;
}

export interface PaymentMonthlyPoint {
  month: string;
  count: number;
  totalAmount: number;
}

export interface PaymentsReport {
  kpis: PaymentsReportKPIs;
  methodBreakdown: PaymentMethodBreakdown[];
  monthlyTrend: PaymentMonthlyPoint[];
  rows: PaymentsReportRow[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

// =============================================================================
// REFUNDS REPORT
// =============================================================================

export interface RefundsReportFilters extends FinancialReportBaseFilters, PaginationParams {
  refundMethod?: string;
  refundStatus?: string;
  search?: string;
}

export interface RefundsReportRow {
  refundId: string;
  refundNumber: string;
  studentId: string | null;
  studentName: string | null;
  paymentId: string;
  paymentNumber: string | null;
  receiptId: string | null;
  receiptNumber: string | null;
  amount: number;
  refundMethod: string;
  status: string;
  reason: string | null;
  requestedAt: Date;
  completedAt: Date | null;
  branchId: string | null;
  branchName: string | null;
  approvedBy: string | null;
}

export interface RefundsReportKPIs {
  totalRefunded: number;
  refundCount: number;
  pendingRefunds: number;
  approvedNotCompleted: number;
  cashReturns: number;
  walletCreditRefunds: number;
}

export interface RefundMonthlyPoint {
  month: string;
  count: number;
  totalAmount: number;
}

export interface RefundsReport {
  kpis: RefundsReportKPIs;
  methodBreakdown: Array<{ method: string; count: number; totalAmount: number }>;
  monthlyTrend: RefundMonthlyPoint[];
  rows: RefundsReportRow[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

// =============================================================================
// STUDENT FINANCIAL STATEMENT
// =============================================================================

export interface StudentStatementFilters {
  organizationId: string;
  studentId: string;
  dateFrom?: string;
  dateTo?: string;
}

export interface StudentStatementKPIs {
  totalInvoiced: number;
  totalPaid: number;
  creditApplied: number;
  totalRefunded: number;
  walletBalance: number;
  outstandingBalance: number;
}

export interface StudentStatementInvoice {
  invoiceId: string;
  invoiceNumber: string;
  issueDate: Date;
  dueDate: Date | null;
  totalAmount: number;
  paidAmount: number;
  balanceAmount: number;
  status: string;
}

export interface StudentStatementPayment {
  paymentId: string;
  paymentNumber: string;
  paymentDate: Date;
  totalAmount: number;
  status: string;
  paymentMethods: string[];
  invoiceNumber: string | null;
  receiptNumber: string | null;
}

export interface StudentStatementReceipt {
  receiptId: string;
  receiptNumber: string;
  issueDate: Date;
  amount: number;
  refundedAmount: number;
  status: string;
  invoiceNumber: string | null;
  paymentNumber: string | null;
}

export interface StudentStatementWalletTransaction {
  transactionId: string;
  type: string;
  amount: number;
  description: string | null;
  createdAt: Date;
  referenceType: string | null;
}

export interface StudentStatementRefund {
  refundId: string;
  refundNumber: string;
  amount: number;
  refundMethod: string;
  status: string;
  requestedAt: Date;
  completedAt: Date | null;
  paymentNumber: string | null;
}

export interface StudentStatementLedgerEntry {
  id: string;
  transactionType: string;
  direction: string;
  amount: number;
  description: string | null;
  referenceNumber: string | null;
  occurredAt: Date;
}

export interface StudentInfo {
  studentId: string;
  studentName: string;
  studentCode: string | null;
  enrollmentCount: number;
}

export interface StudentFinancialStatement {
  student: StudentInfo;
  kpis: StudentStatementKPIs;
  invoices: StudentStatementInvoice[];
  payments: StudentStatementPayment[];
  receipts: StudentStatementReceipt[];
  walletTransactions: StudentStatementWalletTransaction[];
  refunds: StudentStatementRefund[];
  ledger: StudentStatementLedgerEntry[];
}

// =============================================================================
// CASH FLOW REPORT
// =============================================================================

// Transaction types included in cash flow; accounting-only entries are excluded.
export const CASH_FLOW_INCLUDED_TYPES = [
  "PAYMENT_RECEIVED",   // inflow  — CREDIT
  "PAYMENT_CANCELLED",  // outflow — DEBIT (reversal of confirmed payment)
  "REFUND_DISBURSED",   // outflow — DEBIT (cash return or wallet credit method)
] as const;

export type CashFlowTransactionType = typeof CASH_FLOW_INCLUDED_TYPES[number];

export interface CashFlowFilters {
  organizationId: string;
  studentId?: string;
  dateFrom?: string;
  dateTo?: string;
}

export interface CashFlowKPIs {
  totalCashIn: number;
  totalCancellations: number;
  totalRefunds: number;
  netCashFlow: number;
  paymentCount: number;
  cancellationCount: number;
  refundCount: number;
}

export interface CashFlowMonthlyPoint {
  month: string;
  cashIn: number;
  cashOut: number;
  net: number;
}

export interface CashFlowEntry {
  id: string;
  transactionNumber: string;
  transactionType: string;
  direction: string;
  amount: number;
  description: string | null;
  occurredAt: Date;
  studentId: string | null;
  paymentId: string | null;
  refundId: string | null;
}

export interface CashFlowReport {
  kpis: CashFlowKPIs;
  monthlyTrend: CashFlowMonthlyPoint[];
  entries: CashFlowEntry[];
  total: number;
  page: number;
  pageSize: number;
}

// =============================================================================
// EXPORT
// =============================================================================

export interface ReportExportMetadata {
  organizationName: string;
  generatedAt: string;
  generatedBy: string;
  reportType: string;
  filters: Record<string, unknown>;
  rowCount: number;
}

// =============================================================================
// FINANCIAL INTEGRITY REPORT
// =============================================================================

export interface IntegrityReportFilters {
  organizationId: string;
  severity?: string;
  category?: string;
  entityType?: string;
  status?: string;
  dateFrom?: string;
  dateTo?: string;
  page: number;
  pageSize: number;
}

export interface IntegrityReportKPIs {
  openCritical: number;
  openHigh: number;
  openMedium: number;
  openLow: number;
  totalOpen: number;
  totalResolved: number;
}

export interface IntegrityReportRow {
  id: string;
  severity: string;
  category: string;
  checkName: string;
  entityType: string;
  entityId: string;
  description: string;
  expectedValue: string | null;
  actualValue: string | null;
  detectedAt: Date;
  status: string;
  resolvedAt: Date | null;
  resolvedBy: string | null;
  resolutionNotes: string | null;
}

export interface IntegrityReport {
  kpis: IntegrityReportKPIs;
  rows: IntegrityReportRow[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

// =============================================================================
// STUDENT DEBT REPORT
// =============================================================================

export interface StudentDebtFilters extends FinancialReportBaseFilters, PaginationParams {
  overdueOnly?: boolean;
  minBalance?: number;
  dueDateFrom?: string;
  dueDateTo?: string;
  search?: string;
}

export interface StudentDebtKPIs {
  totalOutstanding: number;
  overdueOutstanding: number;
  studentsWithDebt: number;
  largestDebtorBalance: number;
  longestOverdueDays: number;
}

export interface StudentDebtRow {
  studentId: string;
  studentName: string;
  studentCode: string | null;
  courseNames: string[];
  branchNames: string[];
  totalInvoiced: number;
  totalPaid: number;
  outstandingBalance: number;
  overdueBalance: number;
  invoiceCount: number;
  longestOverdueDays: number;
}

export interface StudentDebtReport {
  kpis: StudentDebtKPIs;
  rows: StudentDebtRow[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

// =============================================================================
// INSTALLMENTS / COLLECTIONS REPORT
// =============================================================================

export interface CollectionsFilters extends FinancialReportBaseFilters, PaginationParams {
  installmentStatus?: string;
  minDaysOverdue?: number;
  maxDaysOverdue?: number;
  dueDateFrom?: string;
  dueDateTo?: string;
  search?: string;
}

export interface CollectionsKPIs {
  overdueInstallments: number;
  overdueAmount: number;
  averageDaysOverdue: number;
  dueThisWeek: number;
  dueThisMonth: number;
}

export interface CollectionsRow {
  installmentId: string;
  studentId: string | null;
  studentName: string | null;
  invoiceId: string;
  invoiceNumber: string;
  paymentPlanId: string;
  paymentPlanName: string;
  courseName: string | null;
  branchName: string | null;
  installmentNumber: number;
  dueDate: Date;
  amount: number;
  paidAmount: number;
  balanceAmount: number;
  daysOverdue: number;
  status: string;
}

export interface CollectionsReport {
  kpis: CollectionsKPIs;
  rows: CollectionsRow[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

// =============================================================================
// BRANCH REVENUE REPORT
// =============================================================================

export interface BranchRevenueFilters extends FinancialReportBaseFilters {}

export interface BranchRevenueKPIs {
  totalInvoiced: number;
  totalCollected: number;
  totalOutstanding: number;
  averageCollectionRate: number;
  bestBranchName: string | null;
  worstBranchName: string | null;
}

export interface BranchRevenueRow {
  branchId: string | null;
  branchName: string;
  totalInvoiced: number;
  totalCollected: number;
  outstandingBalance: number;
  overdueBalance: number;
  collectionRate: number;
  paymentCount: number;
  studentCount: number;
}

export interface BranchRevenueMonthlyPoint {
  month: string;
  branchId: string | null;
  branchName: string;
  collected: number;
}

export interface BranchRevenueReport {
  kpis: BranchRevenueKPIs;
  rows: BranchRevenueRow[];
  monthlyTrend: BranchRevenueMonthlyPoint[];
}

// =============================================================================
// WALLET ACTIVITY REPORT
// =============================================================================

export interface WalletActivityFilters {
  organizationId: string;
  studentId?: string;
  branchId?: string;
  transactionType?: string;
  dateFrom?: string;
  dateTo?: string;
  minBalance?: number;
  search?: string;
  page: number;
  pageSize: number;
}

export interface WalletActivityKPIs {
  totalWalletBalance: number;
  studentsWithPositiveBalance: number;
  creditsThisPeriod: number;
  debitsThisPeriod: number;
  creditAppliedThisPeriod: number;
  walletRefundsThisPeriod: number;
}

export interface WalletActivityRow {
  walletId: string;
  studentId: string;
  studentName: string;
  studentCode: string | null;
  currentBalance: number;
  totalCredits: number;
  totalDebits: number;
  transactionCount: number;
  lastTransactionDate: Date | null;
  lastTransactionType: string | null;
}

export interface WalletTransactionTypePoint {
  type: string;
  count: number;
  totalAmount: number;
}

export interface WalletMonthlyPoint {
  month: string;
  credits: number;
  debits: number;
}

export interface WalletActivityReport {
  kpis: WalletActivityKPIs;
  rows: WalletActivityRow[];
  typeBreakdown: WalletTransactionTypePoint[];
  monthlyTrend: WalletMonthlyPoint[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

// =============================================================================
// COURSE REVENUE REPORT
// =============================================================================

export interface CourseRevenueFilters extends FinancialReportBaseFilters {}

export interface CourseRevenueKPIs {
  totalInvoiced: number;
  totalCollected: number;
  outstandingBalance: number;
  averageCollectionRate: number;
  topRevenueCourseName: string | null;
  worstDebtCourseName: string | null;
}

export interface CourseRevenueRow {
  courseId: string | null;
  courseName: string;
  activeEnrollments: number;
  totalInvoiced: number;
  totalCollected: number;
  outstandingBalance: number;
  overdueBalance: number;
  collectionRate: number;
  averageInvoiceValue: number;
}

export interface CourseRevenueMonthlyPoint {
  month: string;
  courseId: string | null;
  courseName: string;
  invoiced: number;
}

export interface CourseRevenueReport {
  kpis: CourseRevenueKPIs;
  rows: CourseRevenueRow[];
  monthlyTrend: CourseRevenueMonthlyPoint[];
}
