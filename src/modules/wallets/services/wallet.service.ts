import {
  findWalletsByOrganization,
  findWalletById,
  findWalletByStudentId,
  getWalletBalance,
  findTransactionsByWallet,
  findRecentTransactions,
  findCreditApplicationsByInvoice,
  findWalletBalancesByStudentIds,
  type ListWalletsParams,
  type ListTransactionsParams,
} from "@/modules/wallets/repositories/wallet.repository";
import { NotFoundError } from "@/shared/lib/command";
import type { StudentWallet, WalletTransaction, CreditApplication } from "@/modules/wallets/types";
import type { PaginatedResult } from "@/shared/types/common";

export async function getWalletsByOrganization(
  organizationId: string,
  params: ListWalletsParams
): Promise<PaginatedResult<StudentWallet>> {
  return findWalletsByOrganization(organizationId, params);
}

export async function getWalletById(id: string, organizationId: string): Promise<StudentWallet> {
  const wallet = await findWalletById(id, organizationId);
  if (!wallet) throw new NotFoundError("Carteira", id);
  return wallet;
}

export async function getWalletByStudentId(
  studentId: string,
  organizationId: string
): Promise<StudentWallet | null> {
  return findWalletByStudentId(studentId, organizationId);
}

export async function getBalance(walletId: string): Promise<number> {
  return getWalletBalance(walletId);
}

export async function getTransactionsByWallet(
  walletId: string,
  organizationId: string,
  params: ListTransactionsParams
): Promise<PaginatedResult<WalletTransaction>> {
  return findTransactionsByWallet(walletId, organizationId, params);
}

export async function getRecentTransactions(
  walletId: string,
  organizationId: string,
  limit = 5
): Promise<WalletTransaction[]> {
  return findRecentTransactions(walletId, organizationId, limit);
}

export async function getCreditApplicationsByInvoice(
  invoiceId: string,
  organizationId: string
): Promise<CreditApplication[]> {
  return findCreditApplicationsByInvoice(invoiceId, organizationId);
}

export async function getWalletBalancesByStudentIds(
  organizationId: string,
  studentIds: string[]
): Promise<Record<string, number>> {
  return findWalletBalancesByStudentIds(organizationId, studentIds);
}
