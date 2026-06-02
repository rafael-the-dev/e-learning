import type {
  InvoiceStatus,
  InstallmentStatus,
  PaymentMethod,
  PaymentStatus,
} from "@/shared/types/common";

export interface InvoiceDto {
  id: string;
  organizationId: string;
  studentId: string | null;
  enrollmentId: string | null;
  number: string;
  issueDate: Date;
  dueDate: Date | null;
  subtotal: number;
  taxAmount: number;
  discount: number;
  total: number;
  paidAmount: number;
  balanceDue: number;
  status: InvoiceStatus;
  notes: string | null;
  createdAt: Date;
  items?: InvoiceItemDto[];
  student?: { id: string; firstName: string; lastName: string } | null;
  paymentPlan?: PaymentPlanDto | null;
}

export interface InvoiceItemDto {
  id: string;
  invoiceId: string;
  description: string;
  quantity: number;
  unitPrice: number;
  discount: number;
  total: number;
  order: number;
}

export interface PaymentPlanDto {
  id: string;
  invoiceId: string;
  totalAmount: number;
  installments: number;
  installmentList?: InstallmentDto[];
}

export interface InstallmentDto {
  id: string;
  paymentPlanId: string;
  number: number;
  dueDate: Date;
  amount: number;
  paidAmount: number;
  status: InstallmentStatus;
  paidAt: Date | null;
}

export interface PaymentDto {
  id: string;
  organizationId: string;
  studentId: string | null;
  invoiceId: string | null;
  installmentId: string | null;
  amount: number;
  method: PaymentMethod;
  reference: string | null;
  paymentDate: Date;
  status: PaymentStatus;
  notes: string | null;
  createdAt: Date;
  receipt?: ReceiptDto | null;
}

export interface ReceiptDto {
  id: string;
  invoiceId: string;
  paymentId: string;
  number: string;
  issuedAt: Date;
}

export interface CreateInvoiceInput {
  organizationId: string;
  studentId?: string;
  enrollmentId?: string;
  dueDate?: Date;
  discount?: number;
  notes?: string;
  items: {
    description: string;
    quantity: number;
    unitPrice: number;
    discount?: number;
  }[];
  taxRate?: number;
}

export interface RegisterPaymentInput {
  organizationId: string;
  invoiceId: string;
  installmentId?: string;
  amount: number;
  method: PaymentMethod;
  reference?: string;
  paymentDate?: Date;
  notes?: string;
}
