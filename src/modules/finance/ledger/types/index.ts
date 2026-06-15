import type { FinancialTransactionType, FinancialDirection } from "@/shared/types/common";

// =============================================================================
// FINANCIAL TRANSACTION LEDGER TYPES
// =============================================================================

export interface FinancialTransaction {
  id: string;
  organizationId: string;
  transactionNumber: string;
  transactionType: FinancialTransactionType;
  direction: FinancialDirection;
  amount: number;
  currencyCode: string;
  sourceType: string;
  sourceId: string;
  invoiceId: string | null;
  paymentId: string | null;
  receiptId: string | null;
  refundId: string | null;
  studentId: string | null;
  enrollmentId: string | null;
  description: string | null;
  actorId: string | null;
  occurredAt: Date;
  createdAt: Date;
}

// Input shape passed to each record* helper in the service.
// sourceType and direction are derived by the service — callers provide business fields only.
export interface LedgerEntryInput {
  transactionType: string;
  direction: string;
  amount: number;
  sourceType: string;
  sourceId: string;
  invoiceId?: string | null;
  paymentId?: string | null;
  receiptId?: string | null;
  refundId?: string | null;
  studentId?: string | null;
  enrollmentId?: string | null;
  description?: string | null;
  actorId?: string | null;
  occurredAt?: Date;
}

export interface ListLedgerParams {
  organizationId: string;
  invoiceId?: string;
  paymentId?: string;
  studentId?: string;
  transactionType?: string;
  direction?: string;
  dateFrom?: Date;
  dateTo?: Date;
  limit?: number;
  offset?: number;
}
