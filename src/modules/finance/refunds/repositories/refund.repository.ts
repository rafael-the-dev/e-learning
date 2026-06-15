import { getDb } from "@/server/db";
import type { PrismaClient } from "@prisma/client";
import type { Refund } from "@/modules/finance/refunds/types";

export type TxClient = Omit<
  PrismaClient,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends"
>;

type DecimalLike = { toNumber: () => number } | number;

function toNum(v: DecimalLike): number {
  return typeof v === "object" ? v.toNumber() : v;
}

const REFUND_SELECT = {
  id: true,
  organizationId: true,
  branchId: true,
  paymentId: true,
  receiptId: true,
  studentId: true,
  enrollmentId: true,
  invoiceId: true,
  refundNumber: true,
  amount: true,
  reason: true,
  status: true,
  refundMethod: true,
  notes: true,
  rejectionReason: true,
  requestedBy: true,
  approvedBy: true,
  rejectedBy: true,
  completedBy: true,
  approvedAt: true,
  rejectedAt: true,
  completedAt: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
} as const;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapRow(row: any): Refund {
  return { ...row, amount: toNum(row.amount) };
}

export async function findRefundById(id: string, organizationId: string): Promise<Refund | null> {
  const db = await getDb();
  const row = await db.refund.findFirst({
    where: { id, organizationId, deletedAt: null },
    select: REFUND_SELECT,
  });
  return row ? mapRow(row) : null;
}

/**
 * Amount still available for new refund requests.
 * Subtracts REQUESTED + APPROVED + COMPLETED refunds so over-approval is prevented
 * even before any refund completes.
 */
export async function calculateAvailableToRequest(
  paymentId: string,
  organizationId: string
): Promise<number> {
  const db = await getDb();
  const payment = await db.payment.findFirst({
    where: { id: paymentId, organizationId },
    select: { totalAmount: true },
  });
  if (!payment) return 0;

  const agg = await db.refund.aggregate({
    where: {
      paymentId,
      organizationId,
      status: { in: ["REQUESTED", "APPROVED", "COMPLETED"] },
      deletedAt: null,
    },
    _sum: { amount: true },
  });

  const committed = agg._sum.amount ? toNum(agg._sum.amount as DecimalLike) : 0;
  return toNum(payment.totalAmount as DecimalLike) - committed;
}

/**
 * Amount that can still be refunded based on COMPLETED refunds only.
 * Called inside a transaction after the payment row is locked.
 */
export async function calculateRefundableAmountInTx(
  tx: TxClient,
  paymentId: string,
  paymentTotalAmount: number,
  organizationId: string
): Promise<number> {
  const agg = await tx.refund.aggregate({
    where: { paymentId, organizationId, status: "COMPLETED", deletedAt: null },
    _sum: { amount: true },
  });
  const completed = agg._sum.amount ? toNum(agg._sum.amount as DecimalLike) : 0;
  return paymentTotalAmount - completed;
}

export async function findRefundsByPayment(paymentId: string, organizationId: string): Promise<Refund[]> {
  const db = await getDb();
  const rows = await db.refund.findMany({
    where: { paymentId, organizationId, deletedAt: null },
    select: REFUND_SELECT,
    orderBy: { createdAt: "desc" },
  });
  return rows.map(mapRow);
}
