import type { PrismaClient } from "@prisma/client";

type TxClient = Omit<PrismaClient, "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends">;

export interface ReceiptCancellationResult {
  receiptId: string;
  receiptNumber: string;
  previousStatus: string;
  cancelledAt: Date;
}

/**
 * Cancels the ISSUED receipt linked to a payment.
 *
 * Must be called inside the same database transaction as the payment cancellation
 * so that receipt and payment status are reversed atomically. A rollback on either
 * operation rolls back both.
 *
 * Returns null when:
 * - No receipt exists for the payment.
 * - The receipt is already CANCELLED (idempotent — no double-cancel attempted).
 *
 * Throws when the receipt row update fails.
 */
export async function cancelReceiptForPayment(
  tx: TxClient,
  paymentId: string,
  organizationId: string,
  cancelledBy: string,
  reason?: string | null
): Promise<ReceiptCancellationResult | null> {
  const receipt = await tx.receipt.findFirst({
    where: { paymentId, organizationId, status: "ISSUED" },
    select: { id: true, receiptNumber: true, status: true },
  });

  if (!receipt) return null;

  const cancelledAt = new Date();

  await tx.receipt.update({
    where: { id: receipt.id, organizationId },
    data: {
      status: "CANCELLED",
      cancelledAt,
      cancelledBy,
      cancellationReason: reason ?? null,
    },
  });

  return {
    receiptId: receipt.id,
    receiptNumber: receipt.receiptNumber,
    previousStatus: receipt.status,
    cancelledAt,
  };
}
