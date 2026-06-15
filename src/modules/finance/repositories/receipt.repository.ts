import { getDb } from "@/server/db";
import { buildSkipTake, buildPaginationMeta } from "@/shared/lib/pagination";
import type { PaginatedResult, PaginationParams } from "@/shared/types/common";
import type { Receipt, PaymentSplit, PaymentAllocation } from "@/modules/finance/types";

type DecimalLike = { toNumber(): number };

// =============================================================================
// RECEIPT REPOSITORY — all queries scoped to organizationId
// =============================================================================

export interface ListReceiptsParams extends PaginationParams {
  search?: string;
  status?: string;
  studentId?: string;
  branchId?: string;
}

const receiptSelect = {
  id: true,
  organizationId: true,
  branchId: true,
  paymentId: true,
  invoiceId: true,
  studentId: true,
  receiptNumber: true,
  issueDate: true,
  amount: true,
  status: true,
  issuedBy: true,
  cancelledAt: true,
  cancelledBy: true,
  cancellationReason: true,
  student: { select: { id: true, firstName: true, lastName: true } },
  invoice: { select: { id: true, invoiceNumber: true } },
  payment: {
    select: {
      id: true,
      paymentNumber: true,
      totalAmount: true,
      splits: {
        select: {
          id: true,
          organizationId: true,
          method: true,
          amount: true,
          reference: true,
          notes: true,
          createdAt: true,
        },
        orderBy: { amount: "desc" as const },
      },
      allocations: {
        select: {
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
          invoiceItem: {
            select: { description: true, itemType: true },
          },
        },
        orderBy: { createdAt: "asc" as const },
      },
    },
  },
  branch: { select: { id: true, name: true } },
} as const;

type SplitRow = {
  id: string;
  organizationId: string;
  method: string;
  amount: DecimalLike;
  reference: string | null;
  notes: string | null;
  createdAt: Date;
};

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

type ReceiptRow = {
  id: string;
  organizationId: string;
  branchId: string | null;
  paymentId: string;
  invoiceId: string;
  studentId: string | null;
  receiptNumber: string;
  issueDate: Date;
  amount: DecimalLike;
  status: string;
  issuedBy: string | null;
  cancelledAt: Date | null;
  cancelledBy: string | null;
  cancellationReason: string | null;
  student: { id: string; firstName: string; lastName: string } | null;
  invoice: { id: string; invoiceNumber: string };
  payment: {
    id: string;
    paymentNumber: string;
    totalAmount: DecimalLike;
    splits: SplitRow[];
    allocations: AllocationRow[];
  };
  branch: { id: string; name: string } | null;
};

function mapToReceipt(row: ReceiptRow): Receipt {
  const allocations: PaymentAllocation[] = row.payment.allocations.map((a) => ({
    id: a.id,
    organizationId: a.organizationId,
    paymentId: a.paymentId,
    creditApplicationId: a.creditApplicationId,
    invoiceId: a.invoiceId,
    invoiceItemId: a.invoiceItemId,
    amount: a.amount.toNumber(),
    allocationType: a.allocationType as PaymentAllocation["allocationType"],
    createdAt: a.createdAt,
    createdBy: a.createdBy,
    itemDescription: a.invoiceItem?.description ?? null,
    itemType: a.invoiceItem?.itemType ?? null,
  }));

  const walletCreditAmount = allocations
    .filter((a) => a.allocationType === "WALLET_CREDIT")
    .reduce((sum, a) => sum + a.amount, 0);

  const paymentAllocatedSum = allocations
    .filter((a) => a.allocationType === "PAYMENT")
    .reduce((sum, a) => sum + a.amount, 0);

  const newMoneyReceived = row.payment.totalAmount.toNumber();
  // Only compute overpayment for receipts with allocation records (new-system payments).
  // Legacy receipts have no allocations; showing newMoneyReceived as overpayment would be wrong.
  const overpaymentAmount =
    allocations.length > 0 ? Math.max(0, newMoneyReceived - paymentAllocatedSum) : 0;

  return {
    id: row.id,
    organizationId: row.organizationId,
    branchId: row.branchId,
    paymentId: row.paymentId,
    invoiceId: row.invoiceId,
    studentId: row.studentId,
    receiptNumber: row.receiptNumber,
    issueDate: row.issueDate,
    amount: row.amount.toNumber(),
    status: row.status as Receipt["status"],
    issuedBy: row.issuedBy,
    cancelledAt: row.cancelledAt,
    cancelledBy: row.cancelledBy,
    cancellationReason: row.cancellationReason,
    studentName: row.student ? `${row.student.firstName} ${row.student.lastName}` : null,
    invoiceNumber: row.invoice.invoiceNumber,
    paymentNumber: row.payment.paymentNumber,
    branchName: row.branch?.name ?? null,
    splits: row.payment.splits.map(
      (s): PaymentSplit => ({
        id: s.id,
        organizationId: s.organizationId,
        paymentId: row.paymentId,
        method: s.method as PaymentSplit["method"],
        amount: s.amount.toNumber(),
        reference: s.reference,
        notes: s.notes,
        createdAt: s.createdAt,
      })
    ),
    allocations,
    walletCreditAmount,
    overpaymentAmount,
  };
}

export async function findReceiptsByOrganization(
  organizationId: string,
  params: ListReceiptsParams
): Promise<PaginatedResult<Receipt>> {
  const db = await getDb();
  const { skip, take } = buildSkipTake(params);

  const where = {
    organizationId,
    ...(params.status && { status: params.status }),
    ...(params.studentId && { studentId: params.studentId }),
    ...(params.branchId && { branchId: params.branchId }),
    ...(params.search && {
      OR: [
        { receiptNumber: { contains: params.search } },
        { student: { firstName: { contains: params.search } } },
        { student: { lastName: { contains: params.search } } },
        { invoice: { invoiceNumber: { contains: params.search } } },
      ],
    }),
  };

  const [rows, total] = await Promise.all([
    db.receipt.findMany({ where, select: receiptSelect, skip, take, orderBy: { issueDate: "desc" } }),
    db.receipt.count({ where }),
  ]);

  return buildPaginationMeta(rows.map(mapToReceipt), total, params);
}

export async function findReceiptById(id: string, organizationId: string): Promise<Receipt | null> {
  const db = await getDb();
  const row = await db.receipt.findFirst({ where: { id, organizationId }, select: receiptSelect });
  return row ? mapToReceipt(row) : null;
}

export async function findReceiptByPayment(paymentId: string, organizationId: string): Promise<Receipt | null> {
  const db = await getDb();
  const row = await db.receipt.findFirst({ where: { paymentId, organizationId }, select: receiptSelect });
  return row ? mapToReceipt(row) : null;
}

export async function hasIssuedReceiptForPayment(paymentId: string, organizationId: string): Promise<boolean> {
  const db = await getDb();
  const count = await db.receipt.count({ where: { paymentId, organizationId, status: "ISSUED" } });
  return count > 0;
}

export async function receiptNumberExists(receiptNumber: string, organizationId: string): Promise<boolean> {
  const db = await getDb();
  const count = await db.receipt.count({ where: { receiptNumber, organizationId } });
  return count > 0;
}

export async function createReceipt(data: {
  organizationId: string;
  branchId?: string | null;
  paymentId: string;
  invoiceId: string;
  studentId?: string | null;
  receiptNumber: string;
  amount: number;
  issuedBy?: string | null;
}): Promise<Receipt> {
  const db = await getDb();
  const row = await db.receipt.create({
    data: {
      organizationId: data.organizationId,
      branchId: data.branchId ?? null,
      paymentId: data.paymentId,
      invoiceId: data.invoiceId,
      studentId: data.studentId ?? null,
      receiptNumber: data.receiptNumber,
      amount: data.amount,
      issuedBy: data.issuedBy ?? null,
    },
    select: receiptSelect,
  });
  return mapToReceipt(row);
}

export async function updateReceiptStatus(
  id: string,
  organizationId: string,
  status: string
): Promise<Receipt> {
  const db = await getDb();
  const row = await db.receipt.update({
    where: { id, organizationId },
    data: { status },
    select: receiptSelect,
  });
  return mapToReceipt(row);
}

export async function countReceiptsByStatus(organizationId: string): Promise<Record<string, number>> {
  const db = await getDb();
  const rows = await db.receipt.groupBy({
    by: ["status"],
    where: { organizationId },
    _count: { _all: true },
  });
  const result: Record<string, number> = {};
  for (const row of rows) result[row.status] = row._count._all;
  return result;
}
