import type {
  InvoiceStatus,
  InstallmentStatus,
  PaymentMethod,
  PaymentStatus,
  PaymentPlanStatus,
  ReceiptStatus,
} from "@/shared/types/common";

// =============================================================================
// FINANCE DOMAIN TYPES
// =============================================================================

export interface InvoiceItem {
  id: string;
  organizationId: string;
  invoiceId: string;
  description: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
}

export interface Invoice {
  id: string;
  organizationId: string;
  branchId: string | null;
  enrollmentId: string | null;
  studentId: string | null;
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
  invoiceAppliedAmount?: number;
  method: PaymentMethod;
  reference: string | null;
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
  walletCreditAmount: number;
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
  status: ReceiptStatus;
  issuedBy: string | null;
  // denormalized
  studentName: string | null;
  invoiceNumber: string | null;
  paymentNumber: string | null;
  branchName: string | null;
  splits: PaymentSplit[];
  walletCreditAmount: number;
}

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

export const PAYMENT_STATUS_LABELS: Record<string, string> = {
  PENDING: "Pendente",
  CONFIRMED: "Confirmado",
  CANCELLED: "Cancelado",
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
  CANCELLED: "Cancelado",
};
