import type { PrismaClient } from "@prisma/client";

type TxClient = Omit<PrismaClient, "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends">;
type DecimalLike = { toNumber(): number };

export interface InstallmentRecalculationResult {
  installmentId: string;
  oldPaidAmount: number;
  oldBalanceAmount: number;
  oldStatus: string;
  newPaidAmount: number;
  newBalanceAmount: number;
  newStatus: string;
}

/**
 * Derives the installment status from its financial state.
 * CANCELLED is terminal — callers must guard before invoking this.
 */
export function calculateInstallmentStatus(amount: number, paidAmount: number, dueDate: Date): string {
  const balance = amount - paidAmount;
  if (balance <= 0) return "PAID";
  if (paidAmount > 0) return "PARTIALLY_PAID";
  return new Date() > dueDate ? "OVERDUE" : "PENDING";
}

/**
 * Reverses a payment's contribution to an installment and recalculates its state.
 *
 * `paymentReversalAmount` must be the sum of PAYMENT-type PaymentAllocations for
 * the cancelled payment. Wallet-credit allocations are excluded because
 * ConfirmPaymentCommand does not credit those to installment.paidAmount.
 *
 * Returns null when the installment is CANCELLED (terminal — left untouched).
 * Throws when the installment is not found in the organisation.
 */
export async function recalculateInstallmentAfterPaymentCancellation(
  tx: TxClient,
  installmentId: string,
  organizationId: string,
  paymentReversalAmount: number
): Promise<InstallmentRecalculationResult | null> {
  const inst = await tx.installment.findFirst({
    where: { id: installmentId, organizationId },
    select: { amount: true, paidAmount: true, balanceAmount: true, status: true, dueDate: true },
  });

  if (!inst) throw new Error(`Prestação ${installmentId} não encontrada na organização`);

  // CANCELLED is a terminal state — payment cancellation does not reopen it.
  if (inst.status === "CANCELLED") return null;

  const installmentAmount = (inst.amount as DecimalLike).toNumber();
  const oldPaidAmount = (inst.paidAmount as DecimalLike).toNumber();
  const oldBalanceAmount = (inst.balanceAmount as DecimalLike).toNumber();
  const oldStatus = inst.status;

  const newPaidAmount = Math.max(0, oldPaidAmount - paymentReversalAmount);
  const newBalanceAmount = installmentAmount - newPaidAmount;
  const newStatus = calculateInstallmentStatus(installmentAmount, newPaidAmount, inst.dueDate);

  await tx.installment.update({
    where: { id: installmentId },
    data: { paidAmount: newPaidAmount, balanceAmount: newBalanceAmount, status: newStatus },
  });

  return {
    installmentId,
    oldPaidAmount,
    oldBalanceAmount,
    oldStatus,
    newPaidAmount,
    newBalanceAmount,
    newStatus,
  };
}
