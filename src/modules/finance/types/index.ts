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

export const ALLOCATION_TYPE_LABELS: Record<string, string> = {
  PAYMENT: "Pagamento",
  WALLET_CREDIT: "Crédito da Carteira",
  ADJUSTMENT: "Ajuste",
  REFUND_REVERSAL: "Reversão de Reembolso",
};
