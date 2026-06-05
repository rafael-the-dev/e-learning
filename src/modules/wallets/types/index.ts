import type { WalletStatus, WalletTransactionType } from "@/shared/types/common";

// =============================================================================
// WALLET DOMAIN TYPES
// =============================================================================

export interface StudentWallet {
  id: string;
  organizationId: string;
  studentId: string;
  status: WalletStatus;
  balance: number;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string | null;
  // denormalized
  studentName: string | null;
  studentCode: string | null;
}

export interface WalletTransaction {
  id: string;
  organizationId: string;
  studentWalletId: string;
  type: WalletTransactionType;
  amount: number;
  referenceType: string | null;
  referenceId: string | null;
  description: string | null;
  createdAt: Date;
  createdBy: string | null;
}

export interface CreditApplication {
  id: string;
  organizationId: string;
  studentId: string;
  studentWalletId: string;
  invoiceId: string;
  amount: number;
  notes: string | null;
  createdAt: Date;
  createdBy: string | null;
}

// =============================================================================
// LABEL MAPS (pt-PT)
// =============================================================================

export const WALLET_STATUS_LABELS: Record<string, string> = {
  ACTIVE: "Ativa",
  SUSPENDED: "Suspensa",
};

export const WALLET_TRANSACTION_TYPE_LABELS: Record<string, string> = {
  DEPOSIT: "Depósito",
  OVERPAYMENT: "Excesso de Pagamento",
  CREDIT_APPLIED: "Crédito Aplicado",
  REFUND: "Reembolso",
  ADJUSTMENT: "Ajuste",
  PROMOTIONAL_CREDIT: "Crédito Promocional",
};

export const WALLET_TRANSACTION_SIGN: Record<string, 1 | -1> = {
  DEPOSIT: 1,
  OVERPAYMENT: 1,
  PROMOTIONAL_CREDIT: 1,
  CREDIT_APPLIED: -1,
  REFUND: -1,
  ADJUSTMENT: 1, // can be either — check actual amount sign
};
