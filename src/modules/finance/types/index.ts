import type {
  InvoiceStatus,
  InvoiceItemType,
  InvoiceItemStatus,
  InstallmentStatus,
  PaymentMethod,
  PaymentStatus,
  PaymentPlanStatus,
  ReceiptStatus,
  AllocationType,
  RefundMethod,
  FinancialTransactionType,
  FinancialDirection,
  IntegrityIssueSeverity,
  IntegrityIssueCategory,
  IntegrityIssueStatus,
} from "@/shared/types/common";

// =============================================================================
// FINANCE DOMAIN TYPES
// =============================================================================

export interface InvoiceItem {
  id: string;
  organizationId: string;
  invoiceId: string;
  feeDefinitionId: string | null;
  itemType: InvoiceItemType;
  description: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  paidAmount: number;
  balanceAmount: number;
  priority: number;
  status: InvoiceItemStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface Invoice {
  id: string;
  organizationId: string;
  branchId: string | null;
  enrollmentId: string | null;
  studentId: string | null;
  billingPolicyId: string | null;
  invoiceNumber: string;
  issueDate: Date;
  dueDate: Date | null;
  subtotal: number;
  discountAmount: number;
  taxAmount: number;
  totalAmount: number;
  paidAmount: number;
  balanceAmount: number;
  status: InvoiceStatus;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
  createdBy: string | null;
  updatedBy: string | null;
  // denormalized
  studentName: string | null;
  branchName: string | null;
  enrollmentNumber: string | null;
  items: InvoiceItem[];
}

export interface Installment {
  id: string;
  organizationId: string;
  paymentPlanId: string;
  invoiceId: string;
  installmentNumber: number;
  dueDate: Date;
  amount: number;
  paidAmount: number;
  balanceAmount: number;
  status: InstallmentStatus;
  paidAt: Date | null;
}

export interface PaymentPlan {
  id: string;
  organizationId: string;
  invoiceId: string;
  name: string;
  numberOfInstallments: number;
  totalAmount: number;
  status: PaymentPlanStatus;
  createdAt: Date;
  updatedAt: Date;
  installments: Installment[];
}

export interface PaymentSplit {
  id: string;
  organizationId: string;
  paymentId: string;
  method: PaymentMethod;
  amount: number;
  reference: string | null;
  notes: string | null;
  createdAt: Date;
}

export interface PaymentAllocation {
  id: string;
  organizationId: string;
  paymentId: string | null;
  creditApplicationId: string | null;
  invoiceId: string;
  invoiceItemId: string;
  amount: number;
  allocationType: AllocationType;
  createdAt: Date;
  createdBy: string | null;
  // denormalized
  itemDescription: string | null;
  itemType: string | null;
}

export interface Payment {
  id: string;
  organizationId: string;
  branchId: string | null;
  invoiceId: string | null;
  installmentId: string | null;
  studentId: string | null;
  enrollmentId: string | null;
  paymentNumber: string;
  paymentDate: Date;
  totalAmount: number;
  status: PaymentStatus;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string | null;
  // denormalized
  studentName: string | null;
  invoiceNumber: string | null;
  branchName: string | null;
  splits: PaymentSplit[];
  receiptId: string | null;
  receiptStatus: string | null;
  receiptNumber: string | null;
}

export interface Receipt {
  id: string;
  organizationId: string;
  branchId: string | null;
  paymentId: string;
  invoiceId: string;
  studentId: string | null;
  receiptNumber: string;
  issueDate: Date;
  amount: number;
  refundedAmount: number;
  status: ReceiptStatus;
  issuedBy: string | null;
  cancelledAt: Date | null;
  cancelledBy: string | null;
  cancellationReason: string | null;
  // denormalized
  studentName: string | null;
  invoiceNumber: string | null;
  paymentNumber: string | null;
  branchName: string | null;
  splits: PaymentSplit[];
  allocations: PaymentAllocation[];
  walletCreditAmount: number;
  overpaymentAmount: number;
}

// =============================================================================
// PRIORITY MAP — determines allocation order for invoice items
// =============================================================================

export const ITEM_TYPE_PRIORITY: Record<string, number> = {
  REGISTRATION_FEE: 1,
  COURSE_FEE: 2,
  MATERIAL_FEE: 3,
  EXAM_FEE: 4,
  CERTIFICATE_FEE: 5,
  PENALTY: 6,
  OTHER: 7,
};

// =============================================================================
// LABEL MAPS (pt-PT)
// =============================================================================

export const INVOICE_STATUS_LABELS: Record<string, string> = {
  PENDING: "Pendente",
  PARTIALLY_PAID: "Parcialmente Pago",
  PAID: "Pago",
  OVERDUE: "Em Atraso",
  CANCELLED: "Cancelado",
};

export const INVOICE_ITEM_TYPE_LABELS: Record<string, string> = {
  REGISTRATION_FEE: "Taxa de Inscrição",
  COURSE_FEE: "Taxa do Curso",
  MATERIAL_FEE: "Material Didático",
  EXAM_FEE: "Taxa de Exame",
  CERTIFICATE_FEE: "Certificado",
  PENALTY: "Multa",
  OTHER: "Outro",
};

export const PAYMENT_STATUS_LABELS: Record<string, string> = {
  PENDING: "Pendente",
  CONFIRMED: "Confirmado",
  CANCELLED: "Cancelado",
  PARTIALLY_REFUNDED: "Parcialmente Reembolsado",
  REFUNDED: "Reembolsado",
};

export const PAYMENT_METHOD_LABELS: Record<string, string> = {
  CASH: "Numerário",
  BANK_TRANSFER: "Transferência Bancária",
  MPESA: "M-Pesa",
  EMOLA: "E-Mola",
  POS: "POS",
  CARD: "Cartão",
  CHEQUE: "Cheque",
  OTHER: "Outro",
};

export const PAYMENT_PLAN_STATUS_LABELS: Record<string, string> = {
  ACTIVE: "Ativo",
  COMPLETED: "Concluído",
  CANCELLED: "Cancelado",
};

export const INSTALLMENT_STATUS_LABELS: Record<string, string> = {
  PENDING: "Pendente",
  PARTIALLY_PAID: "Parcialmente Pago",
  PAID: "Pago",
  OVERDUE: "Em Atraso",
};

export const RECEIPT_STATUS_LABELS: Record<string, string> = {
  ISSUED: "Emitido",
  PARTIALLY_REFUNDED: "Parcialmente Reembolsado",
  CANCELLED: "Cancelado",
};

export const REFUND_METHOD_LABELS: Record<string, string> = {
  CASH_RETURN: "Devolução em Numerário",
  WALLET_CREDIT: "Crédito na Carteira",
};

export const ALLOCATION_TYPE_LABELS: Record<string, string> = {
  PAYMENT: "Pagamento",
  WALLET_CREDIT: "Crédito da Carteira",
  ADJUSTMENT: "Ajuste",
  REFUND_REVERSAL: "Reversão de Reembolso",
};

export const REFUND_STATUS_LABELS: Record<string, string> = {
  REQUESTED: "Solicitado",
  APPROVED: "Aprovado",
  REJECTED: "Rejeitado",
  COMPLETED: "Concluído",
};

// Re-export types so callers don't need to import from shared/types
export type { RefundMethod, FinancialTransactionType, FinancialDirection };

// =============================================================================
// FINANCIAL TRANSACTION LEDGER LABELS (pt-PT)
// =============================================================================

export const FINANCIAL_TRANSACTION_TYPE_LABELS: Record<string, string> = {
  INVOICE_CREATED:   "Fatura Emitida",
  INVOICE_CANCELLED: "Fatura Cancelada",
  PAYMENT_RECEIVED:  "Pagamento Recebido",
  PAYMENT_CANCELLED: "Pagamento Cancelado",
  CREDIT_APPLIED:    "Crédito Aplicado",
  WALLET_CREDIT:     "Crédito em Carteira",
  WALLET_DEBIT:      "Débito de Carteira",
  REFUND_DISBURSED:  "Reembolso Desembolsado",
  RECEIPT_ISSUED:    "Recibo Emitido",
};

export const FINANCIAL_DIRECTION_LABELS: Record<string, string> = {
  CREDIT: "Crédito",
  DEBIT:  "Débito",
};

// =============================================================================
// FINANCIAL INTEGRITY LABELS (pt-PT)
// =============================================================================

export const INTEGRITY_SEVERITY_LABELS: Record<string, string> = {
  CRITICAL: "Crítico",
  HIGH:     "Alto",
  MEDIUM:   "Médio",
  LOW:      "Baixo",
};

export const INTEGRITY_CATEGORY_LABELS: Record<string, string> = {
  INVOICE_BALANCE:     "Saldo de Fatura",
  INSTALLMENT_BALANCE: "Saldo de Prestação",
  PAYMENT_ALLOCATION:  "Imputação de Pagamento",
  WALLET_BALANCE:      "Saldo de Carteira",
  REFUND_TOTAL:        "Total de Reembolso",
  RECEIPT_INTEGRITY:   "Integridade do Recibo",
  ORPHAN_RECORD:       "Registo Órfão",
  LEDGER_CONSISTENCY:  "Consistência do Razão",
};

export const INTEGRITY_STATUS_LABELS: Record<string, string> = {
  OPEN:         "Em Aberto",
  ACKNOWLEDGED: "Reconhecido",
  RESOLVED:     "Resolvido",
  SUPPRESSED:   "Suprimido",
};

// Re-export for callers
export type { IntegrityIssueSeverity, IntegrityIssueCategory, IntegrityIssueStatus };

// =============================================================================
// DASHBOARD TYPES
// =============================================================================

export interface PaymentDashboardKPIs {
  receivedToday: number;
  receivedThisMonth: number;
  pendingCount: number;
  pendingAmount: number;
  confirmedCount: number;
  confirmedAmount: number;
  cancelledCount: number;
  requireReceiptCount: number;
  overpaymentCount: number;
  walletCreditUsed: number;
}

export interface PaymentMethodDistribution {
  method: string;
  count: number;
  totalAmount: number;
}

export interface PaymentStatusDistribution {
  status: string;
  count: number;
  totalAmount: number;
}

export interface PaymentMonthlyTrend {
  month: string;
  count: number;
  totalAmount: number;
}

export interface PaymentBranchDistribution {
  branchId: string | null;
  branchName: string;
  count: number;
  totalAmount: number;
}

export interface PaymentWatchlistItem {
  paymentId: string;
  paymentNumber: string;
  studentId: string | null;
  studentName: string | null;
  invoiceId: string | null;
  invoiceNumber: string | null;
  amount: number;
  issue: string;
  severity: "low" | "medium" | "high" | "critical";
  recommendedAction: string;
  paymentDate: Date;
}

export interface PaymentInsight {
  id: string;
  message: string;
  severity: "info" | "warning" | "critical";
  count?: number;
  linkHref?: string;
  linkLabel?: string;
}

export const RECEIPT_STATUS_FILTER_LABELS: Record<string, string> = {
  MISSING: "Sem Recibo",
  ISSUED: "Recibo Emitido",
  CANCELLED: "Recibo Cancelado",
};

// =============================================================================
// INVOICE DASHBOARD TYPES
// =============================================================================

export interface InvoiceDashboardKPIs {
  invoicedToday: number;
  invoicedThisMonth: number;
  invoicedLastMonth: number;
  pendingCount: number;
  pendingAmount: number;
  overdueCount: number;
  overdueAmount: number;
  paidThisMonth: number;
  paidLastMonth: number;
  partiallyPaidCount: number;
  noPaymentCount: number;
  cancelledCount: number;
  dueSoonCount: number;
  studentsWithMultiplePendingCount: number;
}

export interface InvoiceStatusDistribution {
  status: string;
  count: number;
  totalAmount: number;
}

export interface InvoiceCourseDistribution {
  courseId: string | null;
  courseName: string;
  count: number;
  totalAmount: number;
}

export interface InvoiceMonthlyTrend {
  month: string;
  count: number;
  totalAmount: number;
}

export interface InvoiceAgingBucket {
  bucket: "1-7" | "8-15" | "16-30" | "31+";
  label: string;
  count: number;
  totalAmount: number;
}

export interface InvoiceWatchlistItem {
  invoiceId: string;
  invoiceNumber: string;
  studentId: string | null;
  studentName: string | null;
  enrollmentId: string | null;
  enrollmentNumber: string | null;
  totalAmount: number;
  balanceAmount: number;
  dueDate: Date | null;
  issue: string;
  severity: "low" | "medium" | "high" | "critical";
  recommendedAction: string;
}

export interface InvoiceTopOutstandingBalance {
  studentId: string;
  studentName: string;
  invoiceCount: number;
  totalBalance: number;
}

export interface InvoiceInsight {
  id: string;
  message: string;
  severity: "info" | "warning" | "critical";
  count?: number;
  linkHref?: string;
  linkLabel?: string;
}
