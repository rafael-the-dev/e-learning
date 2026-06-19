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

export type ArSortBy = "dueDate" | "balanceAmount" | "daysOverdue" | "studentName" | "invoiceNumber";

export interface AccountsReceivableFilters extends FinancialReportBaseFilters, PaginationParams {
  dueDateFrom?: string;
  dueDateTo?: string;
  invoiceStatus?: string;
  agingBucket?: string;
  search?: string;
  sortBy?: ArSortBy;
  sortDir?: "asc" | "desc";
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

export type AgingSortBy = "dueDate" | "balanceAmount" | "daysOverdue" | "studentName" | "invoiceNumber";

export interface AgingFilters extends FinancialReportBaseFilters, PaginationParams {
  agingBucket?: AgingBucket;
  search?: string;
  sortBy?: AgingSortBy;
  sortDir?: "asc" | "desc";
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
// FINANCIAL RECONCILIATION REPORT
// =============================================================================
// Calculated comparison view for auditors — NOT the same as the Financial
// Integrity Report (which shows stored, job-detected issues). This report
// recomputes ledger-vs-source comparisons live, on every request.

export type ReconciliationIssueType =
  | "MISSING_PAYMENT_RECEIVED"
  | "MISSING_REFUND_DISBURSED"
  | "MISSING_RECEIPT_ISSUED"
  | "INVOICE_PAID_AMOUNT_MISMATCH"
  | "RECEIPT_AMOUNT_MISMATCH"
  | "DUPLICATE_LEDGER_ENTRY"
  | "ORPHAN_LEDGER_ENTRY";

export type ReconciliationSeverity = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";

// Severity and entityType are fixed per issueType — used by the repository to
// skip irrelevant checks entirely when a severity/entityType filter is applied,
// and by the UI to render badges/labels.
export const RECONCILIATION_ISSUE_META: Record<
  ReconciliationIssueType,
  { severity: ReconciliationSeverity; entityType: string }
> = {
  MISSING_PAYMENT_RECEIVED:     { severity: "HIGH",     entityType: "Payment" },
  MISSING_REFUND_DISBURSED:     { severity: "HIGH",     entityType: "Refund" },
  MISSING_RECEIPT_ISSUED:       { severity: "MEDIUM",   entityType: "Receipt" },
  INVOICE_PAID_AMOUNT_MISMATCH: { severity: "CRITICAL", entityType: "Invoice" },
  RECEIPT_AMOUNT_MISMATCH:      { severity: "HIGH",     entityType: "Receipt" },
  DUPLICATE_LEDGER_ENTRY:       { severity: "HIGH",     entityType: "FinancialTransaction" },
  ORPHAN_LEDGER_ENTRY:          { severity: "CRITICAL", entityType: "FinancialTransaction" },
};

export const RECONCILIATION_ISSUE_LABELS: Record<ReconciliationIssueType, string> = {
  MISSING_PAYMENT_RECEIVED:     "Lançamento de pagamento recebido em falta",
  MISSING_REFUND_DISBURSED:     "Lançamento de reembolso desembolsado em falta",
  MISSING_RECEIPT_ISSUED:       "Lançamento de recibo emitido em falta",
  INVOICE_PAID_AMOUNT_MISMATCH: "Valor pago da fatura não corresponde às imputações",
  RECEIPT_AMOUNT_MISMATCH:      "Valor do recibo não corresponde ao pagamento",
  DUPLICATE_LEDGER_ENTRY:       "Lançamento duplicado no livro-razão",
  ORPHAN_LEDGER_ENTRY:          "Lançamento órfão no livro-razão (sem registo de origem)",
};

export interface ReconciliationFilters {
  organizationId: string;
  branchId?: string;
  studentId?: string;
  dateFrom?: string;
  dateTo?: string;
  entityType?: string;
  issueType?: ReconciliationIssueType;
  issueTypes?: ReconciliationIssueType[];
  severity?: ReconciliationSeverity;
  severities?: ReconciliationSeverity[];
  page: number;
  pageSize: number;
}

export interface ReconciliationRow {
  issueType: ReconciliationIssueType;
  severity: ReconciliationSeverity;
  entityType: string;
  entityId: string;
  entityReference: string;
  expectedAmount: number;
  actualAmount: number;
  difference: number;
  occurredAt: Date;
  detectedAt: Date;
  integrityIssueId: string | null;
  integrityIssueStatus: string | null;
}

export interface ReconciliationKPIs {
  reconciledItems: number;
  mismatchedItems: number;
  missingLedgerEntries: number;
  duplicateLedgerEntries: number;
  orphanLedgerEntries: number;
  criticalIssues: number;
}

export interface ReconciliationReport {
  kpis: ReconciliationKPIs;
  watchlist: ReconciliationRow[];
  rows: ReconciliationRow[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

// =============================================================================
// STUDENT DEBT REPORT
// =============================================================================

export type StudentDebtSortBy =
  | "outstandingBalance"
  | "overdueBalance"
  | "longestOverdueDays"
  | "studentName"
  | "totalInvoiced";

export interface StudentDebtFilters extends FinancialReportBaseFilters, PaginationParams {
  overdueOnly?: boolean;
  minBalance?: number;
  dueDateFrom?: string;
  dueDateTo?: string;
  search?: string;
  sortBy?: StudentDebtSortBy;
  sortDir?: "asc" | "desc";
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

export type WalletSortBy = "currentBalance" | "totalCredits" | "totalDebits" | "lastTransactionDate" | "studentName";

export interface WalletActivityFilters {
  organizationId: string;
  studentId?: string;
  branchId?: string;
  transactionType?: string;
  dateFrom?: string;
  dateTo?: string;
  minBalance?: number;
  search?: string;
  sortBy?: WalletSortBy;
  sortDir?: "asc" | "desc";
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

// =============================================================================
// FINANCIAL CLOSING DASHBOARD
// =============================================================================
// Executive control view — aggregates existing read models (Integrity,
// Reconciliation, Accounts Receivable, Cash Flow, Wallet, Refunds). It never
// computes a new financial fact; it only composes numbers already produced by
// those reports/repositories. See docs/financial-reports.md for the formula
// reference and the filter-applicability matrix.

export interface ClosingFilters {
  organizationId: string;
  branchId?: string;
  academicYearId?: string;
  academicTermId?: string;
  dateFrom?: string;
  dateTo?: string;
}

export interface ClosingKPIs {
  grossInvoiced: number;
  grossCollected: number;
  netCashPosition: number;
  outstandingReceivables: number;
  overdueReceivables: number;
  walletLiability: number;
  refundExposure: number;
  criticalFinancialIssues: number;
}

export type TrustScoreRating = "HEALTHY" | "NEEDS_REVIEW" | "RISKY" | "UNSAFE";

export const TRUST_SCORE_RATING_LABELS: Record<TrustScoreRating, string> = {
  HEALTHY: "Saudável",
  NEEDS_REVIEW: "Requer Revisão",
  RISKY: "Arriscado",
  UNSAFE: "Inseguro",
};

// Each deduction reason is a fixed code so the UI/export can render it
// through a pt-PT lookup table without ever hardcoding Portuguese in the
// scoring logic itself.
export type TrustScoreDeductionReason =
  | "UNRESOLVED_CRITICAL_INTEGRITY"
  | "UNRESOLVED_HIGH_INTEGRITY"
  | "CRITICAL_RECONCILIATION_MISMATCH"
  | "DUPLICATE_LEDGER_ENTRIES"
  | "ORPHAN_LEDGER_ENTRIES"
  | "WALLET_LIABILITY_MISMATCH";

export const TRUST_SCORE_DEDUCTION_LABELS: Record<TrustScoreDeductionReason, string> = {
  UNRESOLVED_CRITICAL_INTEGRITY: "Problemas de integridade críticos não resolvidos",
  UNRESOLVED_HIGH_INTEGRITY: "Problemas de integridade altos não resolvidos",
  CRITICAL_RECONCILIATION_MISMATCH: "Divergências críticas de reconciliação",
  DUPLICATE_LEDGER_ENTRIES: "Lançamentos duplicados no livro-razão",
  ORPHAN_LEDGER_ENTRIES: "Lançamentos órfãos no livro-razão",
  WALLET_LIABILITY_MISMATCH: "Divergência no passivo de carteiras",
};

export interface FinancialTrustScoreInputs {
  hasUnresolvedCriticalIntegrity: boolean;
  hasUnresolvedHighIntegrity: boolean;
  hasCriticalReconciliationMismatch: boolean;
  hasDuplicateLedgerEntries: boolean;
  hasOrphanLedgerEntries: boolean;
  hasWalletLiabilityMismatch: boolean;
}

export interface FinancialTrustScoreDeduction {
  reason: TrustScoreDeductionReason;
  points: number;
}

export interface FinancialTrustScore {
  score: number;
  rating: TrustScoreRating;
  deductions: FinancialTrustScoreDeduction[];
}

export type NetCashTrendPoint = CashFlowMonthlyPoint;

export type ClosingWatchlistCategory =
  | "INTEGRITY_CRITICAL"
  | "INTEGRITY_HIGH"
  | "RECONCILIATION_MISMATCH"
  | "DUPLICATE_LEDGER"
  | "ORPHAN_LEDGER"
  | "WALLET_LIABILITY"
  | "REFUND_EXPOSURE"
  | "OVERDUE_RECEIVABLE";

export const CLOSING_WATCHLIST_CATEGORY_LABELS: Record<ClosingWatchlistCategory, string> = {
  INTEGRITY_CRITICAL: "Integridade — Crítico",
  INTEGRITY_HIGH: "Integridade — Alto",
  RECONCILIATION_MISMATCH: "Reconciliação",
  DUPLICATE_LEDGER: "Livro-Razão Duplicado",
  ORPHAN_LEDGER: "Livro-Razão Órfão",
  WALLET_LIABILITY: "Passivo de Carteira",
  REFUND_EXPOSURE: "Exposição a Reembolso",
  OVERDUE_RECEIVABLE: "Recebível Vencido",
};

export type ClosingRecommendedAction =
  | "VIEW_INTEGRITY"
  | "VIEW_RECONCILIATION"
  | "VIEW_STUDENT_DEBT"
  | "VIEW_WALLET"
  | "VIEW_REFUND";

export const CLOSING_RECOMMENDED_ACTION_LABELS: Record<ClosingRecommendedAction, string> = {
  VIEW_INTEGRITY: "Ver Problema de Integridade",
  VIEW_RECONCILIATION: "Ver Reconciliação",
  VIEW_STUDENT_DEBT: "Ver Dívida do Aluno",
  VIEW_WALLET: "Ver Carteira",
  VIEW_REFUND: "Ver Reembolso",
};

export interface ClosingWatchlistItem {
  severity: ReconciliationSeverity;
  category: ClosingWatchlistCategory;
  entityType: string;
  entityReference: string;
  amount: number | null;
  description: string;
  recommendedAction: ClosingRecommendedAction;
  link: string;
  detectedAt: Date;
}

export interface FinancialControlSummary {
  integrity: {
    openCritical: number;
    openHigh: number;
    openMedium: number;
    openLow: number;
  };
  reconciliation: {
    reconciled: number;
    unreconciled: number;
  };
  receivables: {
    outstanding: number;
    overdue: number;
    dueSoon: number;
  };
  refunds: {
    requestedCount: number;
    approvedCount: number;
    completedThisPeriodCount: number;
    completedThisPeriodAmount: number;
  };
  wallet: {
    totalLiability: number;
    studentsWithCredit: number;
    largestBalance: number;
  };
}

export interface ReconciliationSummary {
  missingLedgerEntries: number;
  duplicateLedgerEntries: number;
  orphanLedgerEntries: number;
  invoiceAllocationMismatches: number;
  receiptAmountMismatches: number;
  reconciledItems: number;
  mismatchedItems: number;
  criticalIssues: number;
}

export interface ClosingReport {
  kpis: ClosingKPIs;
  trustScore: FinancialTrustScore;
  netCashTrend: NetCashTrendPoint[];
  watchlist: ClosingWatchlistItem[];
  controlSummary: FinancialControlSummary;
  reconciliationSummary: ReconciliationSummary;
}

// =============================================================================
// REVENUE TREND REPORT
// =============================================================================
// Month-over-month billing vs. collection evolution. Collected uses the
// Invoice.paidAmount basis (billing-period view, same basis as Branch/Course
// Revenue) — not Payment.paymentDate cash-received — see docs note in the
// repository file. Refunded uses Refund.completedAt (actual cash effect).

export interface RevenueTrendFilters extends FinancialReportBaseFilters {}

export interface RevenueTrendMonthlyRow {
  month: string;
  invoiced: number;
  collected: number;
  refunded: number;
  netCollected: number;
  outstanding: number;
  collectionRate: number;
}

export interface RevenueTrendKPIs {
  totalInvoiced: number;
  totalCollected: number;
  totalRefunded: number;
  netCollected: number;
  collectionRate: number;
  outstandingBalance: number;
}

export interface RevenueTrendReport {
  kpis: RevenueTrendKPIs;
  rows: RevenueTrendMonthlyRow[];
}

// =============================================================================
// WALLET LIABILITY REPORT
// =============================================================================
// Distinct from the Wallet Activity Report: Activity answers "what movements
// happened?"; Liability answers "how much credit do we currently owe
// students, and where is it concentrated/at risk?". Only positive balances
// are liability — a negative balance is an integrity defect, never a
// negative liability. See docs/financial-reports.md for the full formula
// reference and the branch/course attribution rules.

export type WalletLiabilitySortBy =
  | "currentBalance"
  | "creditsIssued"
  | "creditsConsumed"
  | "netMovement"
  | "lastTransactionDate"
  | "daysDormant"
  | "transactionCount"
  | "studentName";

export interface WalletLiabilityFilters {
  organizationId: string;
  branchId?: string;
  courseId?: string;
  studentId?: string;
  dateFrom?: string;
  dateTo?: string;
  minBalance?: number;
  dormantDays?: number;
  includeZeroBalances?: boolean;
  includeNegativeBalances?: boolean;
  sortBy?: WalletLiabilitySortBy;
  sortDir?: "asc" | "desc";
  page: number;
  pageSize: number;
}

export interface WalletLiabilityRow {
  walletId: string;
  studentId: string;
  studentName: string;
  studentCode: string | null;
  branchId: string | null;
  branchName: string;
  courseId: string | null;
  courseName: string;
  currentBalance: number;
  creditsIssued: number;
  creditsConsumed: number;
  netMovement: number;
  lastTransactionDate: Date | null;
  daysDormant: number | null;
  transactionCount: number;
}

export interface WalletLiabilityKPIs {
  totalLiability: number;
  studentsWithCredit: number;
  averagePositiveBalance: number;
  largestBalance: number;
  creditsIssuedThisPeriod: number;
  creditsConsumedThisPeriod: number;
  netWalletMovement: number;
  dormantWallets: number;
}

export interface WalletLiabilityMonthlyPoint {
  month: string;
  creditsIssued: number;
  creditsConsumed: number;
  netMovement: number;
  cumulativeLiability: number;
}

export interface WalletLiabilityBranchPoint {
  branchId: string | null;
  branchName: string;
  totalLiability: number;
}

export interface WalletLiabilityCoursePoint {
  courseId: string | null;
  courseName: string;
  totalLiability: number;
}

export type WalletLiabilityRecommendedAction =
  | "VIEW_STUDENT"
  | "VIEW_WALLET_ACTIVITY"
  | "VIEW_STUDENT_STATEMENT"
  | "VIEW_INTEGRITY";

export const WALLET_LIABILITY_ACTION_LABELS: Record<WalletLiabilityRecommendedAction, string> = {
  VIEW_STUDENT: "Ver Aluno",
  VIEW_WALLET_ACTIVITY: "Ver Actividade de Carteira",
  VIEW_STUDENT_STATEMENT: "Ver Extrato do Aluno",
  VIEW_INTEGRITY: "Ver Problema de Integridade",
};

export interface WalletLiabilityWatchlistItem {
  severity: ReconciliationSeverity;
  studentId: string | null;
  studentName: string;
  branchName: string;
  courseName: string;
  currentBalance: number | null;
  lastTransactionDate: Date | null;
  daysDormant: number | null;
  issue: string;
  recommendedAction: WalletLiabilityRecommendedAction;
  integrityIssueId: string | null;
  link: string;
}

export interface WalletLiabilityReport {
  kpis: WalletLiabilityKPIs;
  watchlist: WalletLiabilityWatchlistItem[];
  rows: WalletLiabilityRow[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  monthlyTrend: WalletLiabilityMonthlyPoint[];
  byBranch: WalletLiabilityBranchPoint[];
  byCourse: WalletLiabilityCoursePoint[];
  hasCriticalIntegrityIssue: boolean;
}

// =============================================================================
// TAX REPORT
// =============================================================================
// AppliedTax is an immutable snapshot of tax computed at invoice-generation
// time (see billing-calculator.service.ts: amount = base * rate/100) — this
// report never recomputes tax, it only aggregates what was already applied.
// AppliedTax has no stored "base" column, so taxableBase is derived
// algebraically from the SAME relationship used to create it:
// base = amount / (rate/100). This is not a new formula, just its inverse.

export type TaxSortBy = "issueDate" | "taxAmount" | "taxableBase" | "invoiceNumber" | "studentName";

export interface TaxReportFilters extends FinancialReportBaseFilters, PaginationParams {
  taxRuleId?: string;
  invoiceStatus?: string;
  sortBy?: TaxSortBy;
  sortDir?: "asc" | "desc";
}

export interface TaxReportRow {
  appliedTaxId: string;
  invoiceId: string;
  invoiceNumber: string;
  studentId: string | null;
  studentName: string | null;
  branchId: string | null;
  branchName: string | null;
  taxRuleId: string;
  taxRuleName: string;
  taxRate: number;
  taxableBase: number;
  taxAmount: number;
  invoiceTotal: number;
  issueDate: Date;
  status: string;
}

export interface TaxReportKPIs {
  totalTaxAmount: number;
  taxableBase: number;
  grossInvoiced: number;
  taxedInvoicesCount: number;
  averageEffectiveTaxRate: number;
  exemptAmount: number;
}

export interface TaxByRulePoint {
  taxRuleId: string;
  taxRuleName: string;
  taxAmount: number;
  taxableBase: number;
  count: number;
}

export interface TaxByBranchPoint {
  branchId: string | null;
  branchName: string;
  taxAmount: number;
  taxableBase: number;
}

export interface TaxMonthlyPoint {
  month: string;
  taxAmount: number;
  taxableBase: number;
  effectiveTaxRate: number;
}

export interface TaxReport {
  kpis: TaxReportKPIs;
  byRule: TaxByRulePoint[];
  byBranch: TaxByBranchPoint[];
  monthlyTrend: TaxMonthlyPoint[];
  rows: TaxReportRow[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  hasCriticalIntegrityIssue: boolean;
}

// =============================================================================
// DISCOUNT & REVENUE LEAKAGE REPORT
// =============================================================================
// Discounts reduce billed revenue before collection — they are never refunds,
// wallet credits, or payments. AppliedDiscount is an immutable snapshot
// created at invoice-generation time (generate-invoice-from-enrollment.command.ts),
// the only code path that ever creates one — there is no later "apply a
// manual discount to an existing invoice" command.
//
// Schema facts that shape this report:
// - AppliedDiscount.discountRuleId is a required (NOT NULL) FK — every
//   discount is rule-based. DiscountRule.discountType is only
//   PERCENTAGE | FIXED_AMOUNT — there is no "MANUAL" type. So "Manual
//   Discounts" is always 0 under the current schema (see DiscountReportKPIs).
// - AppliedDiscount has no actor field. "Applied By" is read from
//   Invoice.createdBy — the user who triggered invoice generation (and thus
//   the automatic application of active discount rules) — since that is the
//   only actor recorded anywhere near discount creation.
// - Invoice.subtotal is the stored gross amount before discount and tax
//   (see billing-calculator.service.ts), so "Gross Before Discounts" uses it
//   directly rather than estimating from totalAmount + discountAmount.
// - Date basis: AppliedDiscount.createdAt for discount-rooted aggregates.
//   Since discounts are created in the same request as their invoice (no
//   manual entry path), this is always the same moment as Invoice.issueDate
//   in current data, so invoice-rooted KPIs filter on Invoice.issueDate with
//   no basis drift.

export type DiscountSortBy = "createdAt" | "discountAmount" | "leakageRate" | "invoiceNumber" | "studentName";

export interface DiscountReportFilters extends FinancialReportBaseFilters, PaginationParams {
  discountRuleId?: string;
  // DiscountType: PERCENTAGE | FIXED_AMOUNT
  discountType?: string;
  invoiceStatus?: string;
  // Proxy for "who applied this discount" — see Invoice.createdBy note above.
  appliedBy?: string;
  minDiscountAmount?: number;
  sortBy?: DiscountSortBy;
  sortDir?: "asc" | "desc";
}

export interface DiscountReportRow {
  appliedDiscountId: string;
  invoiceId: string;
  invoiceNumber: string;
  studentId: string | null;
  studentName: string | null;
  branchId: string | null;
  branchName: string | null;
  courseId: string | null;
  courseName: string | null;
  discountRuleId: string;
  discountRuleName: string;
  discountType: string;
  discountAmount: number;
  invoiceSubtotal: number;
  invoiceTotal: number;
  leakageRate: number;
  appliedByUserId: string | null;
  appliedByName: string | null;
  appliedAt: Date;
  status: string;
}

export interface DiscountReportKPIs {
  totalDiscounts: number;
  discountedInvoicesCount: number;
  grossBeforeDiscounts: number;
  netInvoiced: number;
  revenueLeakageRate: number;
  averageDiscountPerInvoice: number;
  largestDiscount: number;
  // Always 0 under the current schema — see section comment above.
  manualDiscountsAmount: number;
  manualDiscountsCount: number;
}

export interface DiscountByRulePoint {
  discountRuleId: string;
  discountRuleName: string;
  discountAmount: number;
  count: number;
}

export interface DiscountByBranchPoint {
  branchId: string | null;
  branchName: string;
  discountAmount: number;
}

export interface DiscountByCoursePoint {
  courseId: string | null;
  courseName: string;
  discountAmount: number;
}

export interface DiscountMonthlyPoint {
  month: string;
  discountAmount: number;
}

export type DiscountWatchlistAction = "VIEW_INVOICE" | "REVIEW_DISCOUNT_RULE";

export const DISCOUNT_WATCHLIST_ACTION_LABELS: Record<DiscountWatchlistAction, string> = {
  VIEW_INVOICE: "Ver Fatura",
  REVIEW_DISCOUNT_RULE: "Rever Regra de Desconto",
};

export interface DiscountWatchlistItem {
  severity: ReconciliationSeverity;
  invoiceId: string;
  invoiceNumber: string;
  studentId: string | null;
  studentName: string;
  branchName: string;
  courseName: string;
  discountAmount: number;
  leakageRate: number;
  discountRuleName: string;
  appliedByName: string | null;
  recommendedAction: DiscountWatchlistAction;
  link: string;
}

export interface DiscountReport {
  kpis: DiscountReportKPIs;
  watchlist: DiscountWatchlistItem[];
  byMonth: DiscountMonthlyPoint[];
  byRule: DiscountByRulePoint[];
  byBranch: DiscountByBranchPoint[];
  byCourse: DiscountByCoursePoint[];
  rows: DiscountReportRow[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  hasCriticalIntegrityIssue: boolean;
}

// =============================================================================
// PAYMENT METHOD MIX REPORT
// =============================================================================
// Source of truth: PaymentSplit, never Payment.totalAmount. A Payment can be
// split across several methods (half CASH, half MPESA) — summing
// Payment.totalAmount per method would count the full payment under every
// method it touched. Every aggregate here is rooted at `payment_splits ps`,
// joined to `payments p` only to apply status/date/branch/student filters.
//
// Status basis: splits belonging to payments with status IN (CONFIRMED,
// PARTIALLY_REFUNDED, REFUNDED) are gross "received" money — a later refund
// doesn't erase the fact that cash/digital money physically came in through
// that method. PENDING and CANCELLED payments never represent received money
// and are always excluded — this is a hard rule, not a default; the
// paymentStatus filter can only narrow within the 3 allowed statuses.
//
// Date basis: Payment.paymentDate, not PaymentSplit.createdAt. Splits are
// always created in the same transaction as their parent payment, so the two
// timestamps are operationally identical; paymentDate is used because it is
// the conventional date axis for payment-level reporting elsewhere in this
// codebase (payments-report.repository.ts, branch-revenue.repository.ts) and
// is already covered by existing Payment indexes.
//
// Method categories (PaymentMethod has exactly 8 values):
//   Cash    = CASH
//   Digital = MPESA | EMOLA | CARD | POS
//   Bank    = BANK_TRANSFER | CHEQUE
//   OTHER belongs to no category total, but IS included in Total Received.
//
// Branch attribution: COALESCE(Payment.branchId, Invoice.branchId) — the same
// fallback already established in branch-revenue.repository.ts.
//
// Course attribution: Payment.invoiceId -> Invoice.enrollmentId ->
// Enrollment.courseId. Falls back to "Sem Curso" when the payment has no
// invoice, the invoice has no enrollment, or the enrollment has no course.
//
// Refund-Adjusted Net: Refund.paymentId points at a whole Payment, never at a
// specific PaymentSplit, so a refund on a multi-method payment cannot be tied
// to one method as a stored fact. refundAdjustedNet is therefore a
// PROPORTIONAL ESTIMATE — each split absorbs a share of its payment's
// COMPLETED refunds equal to its share of that payment's totalAmount. For a
// single-method payment (the common case) this is exact; for a split payment
// it is an allocation, not a ledger fact. See docs/financial-reports.md.
//
// Table cardinality: rows are grouped by method (max 8 — CASH, BANK_TRANSFER,
// MPESA, EMOLA, POS, CARD, CHEQUE, OTHER), so this report has no paginated,
// row-heavy table and needs no dedicated API route — KPIs, the table, and the
// "Average Split Amount by Method" chart are all derived from one
// SQL-aggregated result set.

export const PAYMENT_METHOD_COLORS: Record<string, string> = {
  CASH: "#22c55e",
  BANK_TRANSFER: "#3b82f6",
  MPESA: "#ef4444",
  EMOLA: "#f59e0b",
  POS: "#8b5cf6",
  CARD: "#ec4899",
  CHEQUE: "#14b8a6",
  OTHER: "#94a3b8",
};

export interface PaymentMethodMixFilters extends FinancialReportBaseFilters {
  paymentMethod?: string;
  // Restricted to CONFIRMED | PARTIALLY_REFUNDED | REFUNDED — see section comment.
  paymentStatus?: string;
}

export interface PaymentMethodMixKPIs {
  totalReceived: number;
  cashReceived: number;
  digitalReceived: number;
  bankReceived: number;
  mostUsedMethod: string | null;
  highestValueMethod: string | null;
  averagePaymentSplit: number;
  cashDependencyRate: number;
}

export interface PaymentMethodMixRow {
  method: string;
  totalAmount: number;
  splitCount: number;
  paymentCount: number;
  averageAmount: number;
  sharePct: number;
  refundAdjustedNet: number;
}

export interface PaymentMethodMixMonthlyPoint {
  month: string;
  method: string;
  totalAmount: number;
}

export interface PaymentMethodMixByBranchPoint {
  branchId: string | null;
  branchName: string;
  method: string;
  totalAmount: number;
}

export interface PaymentMethodMixReport {
  kpis: PaymentMethodMixKPIs;
  rows: PaymentMethodMixRow[];
  monthlyTrend: PaymentMethodMixMonthlyPoint[];
  byBranch: PaymentMethodMixByBranchPoint[];
  hasCriticalIntegrityIssue: boolean;
}

// =============================================================================
// REFUND ANALYSIS REPORT
// =============================================================================
// Refunds are cash outflows — never discounts (revenue reduction before
// collection) and never wallet credits (a liability, not a cash movement).
// This report is the executive-analytics counterpart to the operational
// "Refunds Report" (refunds-report.repository.ts, which still loads rows and
// aggregates in JS); every query here is pure SQL aggregation instead.
//
// Schema facts that shape this report:
// - There is no RefundReason model or enum anywhere in the schema —
//   `Refund.reason` is unstructured free text (`z.string().min(2, ...)`, no
//   enum constraint). Grouping by it would either fragment into near-one-row
//   cardinality or require inventing a keyword-based categorization, which
//   the spec explicitly forbids ("Do not invent reasons"). So, per the
//   spec's own "If no reason exists: Skip chart" instruction, the "Refunds
//   by Reason" chart is NOT implemented — no repository function for it
//   exists at all (see payment-method.repository.test.ts-style absence test
//   in refund-analysis.repository.test.ts).
// - Refund already carries its own branchId, studentId, enrollmentId, and
//   invoiceId (all nullable) — more direct than the spec's illustrative
//   "Refund -> Payment -> Invoice -> Enrollment -> Course" join chain. The
//   spec's explicit branch fallback (Refund.branchId -> Payment.branchId ->
//   Invoice.branchId) establishes the "prefer the most direct stored field"
//   principle; this report applies that same principle symmetrically to
//   course/student attribution: COALESCE(Refund.enrollmentId,
//   Payment.enrollmentId, Invoice.enrollmentId) -> Enrollment.courseId, and
//   COALESCE(Refund.studentId, Payment.studentId, Invoice.studentId).
//
// Date semantics (three distinct bases, all documented per the spec):
// - Population filter (dateFrom/dateTo, applied everywhere): Refund.createdAt
//   — "which refunds were REQUESTED in this window." This is the single
//   consistent date-range filter for KPIs, the table, the watchlist, and the
//   Refund Trend chart.
// - Processing Time / "Refunded Amount" bucketing: once the createdAt-ranged,
//   COMPLETED-only population is selected, the Processing Time Trend and the
//   "Refunded Amount" series of the Amount Trend chart bucket by
//   Refund.completedAt month instead — the natural axis for "when did this
//   cash actually go out," matching Revenue Trend's exact precedent
//   (getRefundMonthlyAggregates groups by completedAt).
// - "Pending Exposure" series: pending refunds have no completedAt by
//   definition, so this series decomposes TODAY's pending exposure total by
//   the month each pending refund was *created* — not a historical
//   reconstruction of "exposure as of each past month-end" (Refund has no
//   status-history table, so that figure cannot be derived without inventing
//   a fact the schema doesn't store).
//
// Refund Rate reuses Revenue Trend's collection definition exactly:
// grossCollectedAmount = SUM(Invoice.paidAmount) WHERE status <> 'CANCELLED',
// scoped by the same branch/course/academicYear/academicTerm/student/date
// filters, using Invoice.issueDate as the date-range column (Revenue Trend's
// own "collected" series already uses a different date column than its
// "refunded" series for the same reason — this report just extends that
// established precedent to a single ratio).
//
// Tenant isolation: enforced structurally — organizationId is ANDed into
// every WHERE clause, so a cross-tenant branchId/courseId/studentId simply
// matches zero rows (the same pattern wallet-liability.repository.ts
// documents and tax/discount/payment-method reports all rely on), not a
// separate pre-validation round trip.

export type RefundAnalysisSortBy = "amount" | "createdAt" | "completedAt" | "processingDays" | "studentName" | "status";

export interface RefundAnalysisFilters extends FinancialReportBaseFilters, PaginationParams {
  status?: string;
  minAmount?: number;
  sortBy?: RefundAnalysisSortBy;
  sortDir?: "asc" | "desc";
}

export interface RefundAnalysisRow {
  refundId: string;
  refundNumber: string;
  studentId: string | null;
  studentName: string | null;
  branchId: string | null;
  branchName: string | null;
  courseId: string | null;
  courseName: string | null;
  status: string;
  amount: number;
  createdAt: Date;
  approvedAt: Date | null;
  completedAt: Date | null;
  // DATEDIFF(day, createdAt, completedAt) — COMPLETED refunds only, else null.
  processingDays: number | null;
  paymentId: string;
  paymentNumber: string | null;
}

export interface RefundAnalysisKPIs {
  totalRefunded: number;
  refundRequests: number;
  // SUM(COMPLETED refunds) / grossCollectedAmount * 100 — see section comment.
  refundRate: number;
  averageRefundAmount: number;
  largestRefund: number;
  pendingRefundExposure: number;
  rejectedRefundRate: number;
  // Whole-day granularity (DATEDIFF(day, ...)), consistent with daysDormant
  // elsewhere in this codebase (wallet-liability.repository.ts).
  averageProcessingDays: number;
}

export interface RefundTrendPoint {
  month: string;
  requested: number;
  approved: number;
  completed: number;
  rejected: number;
}

export interface RefundAmountTrendPoint {
  month: string;
  refundedAmount: number;
  pendingExposure: number;
}

export interface RefundByBranchPoint {
  branchId: string | null;
  branchName: string;
  totalAmount: number;
}

export interface RefundByCoursePoint {
  courseId: string | null;
  courseName: string;
  totalAmount: number;
}

export interface RefundByStatusPoint {
  status: string;
  count: number;
}

export interface RefundProcessingTimeTrendPoint {
  month: string;
  averageDays: number;
}

// Only the two statuses an operator can still act on appear in the
// watchlist (REQUESTED, APPROVED) — REJECTED/COMPLETED refunds need no
// action, so they are never surfaced here. "View Refund" was considered (per
// the original spec) but dropped: there is no refund detail page anywhere in
// this app. Both actions deep-link to the existing Refunds Report filtered
// by refund number — the closest real destination, since this app has no
// approve/reject/complete UI wired up yet (the commands exist in
// modules/finance/refunds/commands/ but no route or page calls them).
export type RefundWatchlistAction = "REVIEW_REQUEST" | "COMPLETE_REFUND";

export const REFUND_WATCHLIST_ACTION_LABELS: Record<RefundWatchlistAction, string> = {
  REVIEW_REQUEST: "Rever Pedido",
  COMPLETE_REFUND: "Concluir Reembolso",
};

export interface RefundWatchlistItem {
  severity: ReconciliationSeverity;
  refundId: string;
  refundNumber: string;
  studentId: string | null;
  studentName: string;
  branchName: string;
  courseName: string;
  amount: number;
  status: string;
  // REQUESTED: days since createdAt. APPROVED: days since approvedAt.
  ageDays: number;
  issue: string;
  recommendedAction: RefundWatchlistAction;
  paymentId: string;
  link: string;
}

export interface RefundAnalysisReport {
  kpis: RefundAnalysisKPIs;
  watchlist: RefundWatchlistItem[];
  trend: RefundTrendPoint[];
  amountTrend: RefundAmountTrendPoint[];
  byBranch: RefundByBranchPoint[];
  byCourse: RefundByCoursePoint[];
  byStatus: RefundByStatusPoint[];
  processingTimeTrend: RefundProcessingTimeTrendPoint[];
  rows: RefundAnalysisRow[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  hasCriticalIntegrityIssue: boolean;
}
