import { getDb } from "@/server/db";
import type { PaymentAllocation } from "@/modules/finance/types";

type DecimalLike = { toNumber(): number };

// =============================================================================
// PAYMENT ALLOCATION REPOSITORY — all queries scoped to organizationId
// =============================================================================

type AllocationRow = {
  id: string;
  organizationId: string;
  paymentId: string | null;
  creditApplicationId: string | null;
  invoiceId: string;
  invoiceItemId: string;
  amount: DecimalLike;
  allocationType: string;
  createdAt: Date;
  createdBy: string | null;
  invoiceItem: { description: string; itemType: string } | null;
};

const allocationSelect = {
  id: true,
  organizationId: true,
  paymentId: true,
  creditApplicationId: true,
  invoiceId: true,
  invoiceItemId: true,
  amount: true,
  allocationType: true,
  createdAt: true,
  createdBy: true,
  invoiceItem: { select: { description: true, itemType: true } },
} as const;

function mapToAllocation(row: AllocationRow): PaymentAllocation {
  return {
    id: row.id,
    organizationId: row.organizationId,
    paymentId: row.paymentId,
    creditApplicationId: row.creditApplicationId,
    invoiceId: row.invoiceId,
    invoiceItemId: row.invoiceItemId,
    amount: row.amount.toNumber(),
    allocationType: row.allocationType as PaymentAllocation["allocationType"],
    createdAt: row.createdAt,
    createdBy: row.createdBy,
    itemDescription: row.invoiceItem?.description ?? null,
    itemType: row.invoiceItem?.itemType ?? null,
  };
}

export async function findAllocationsByPayment(
  paymentId: string,
  organizationId: string
): Promise<PaymentAllocation[]> {
  const db = await getDb();
  const rows = await db.paymentAllocation.findMany({
    where: { paymentId, organizationId },
    select: allocationSelect,
    orderBy: { createdAt: "asc" },
  });
  return rows.map(mapToAllocation);
}

export async function findAllocationsByInvoice(
  invoiceId: string,
  organizationId: string
): Promise<PaymentAllocation[]> {
  const db = await getDb();
  const rows = await db.paymentAllocation.findMany({
    where: { invoiceId, organizationId },
    select: allocationSelect,
    orderBy: { createdAt: "asc" },
  });
  return rows.map(mapToAllocation);
}

export async function sumAllocationsByPayment(
  paymentId: string,
  organizationId: string
): Promise<number> {
  const db = await getDb();
  const result = await db.paymentAllocation.aggregate({
    where: { paymentId, organizationId },
    _sum: { amount: true },
  });
  return (result._sum.amount as DecimalLike | null)?.toNumber() ?? 0;
}
