import { getDb } from "@/server/db";
import { buildSkipTake, buildPaginationMeta } from "@/shared/lib/pagination";
import type { PaginatedResult, PaginationParams } from "@/shared/types/common";
import type { Receipt, PaymentSplit } from "@/modules/finance/types";

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
  student: { select: { id: true, firstName: true, lastName: true } },
  invoice: { select: { id: true, invoiceNumber: true } },
  payment: {
    select: {
      id: true,
      paymentNumber: true,
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
      creditApplications: {
        select: { id: true, amount: true },
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
  student: { id: string; firstName: string; lastName: string } | null;
  invoice: { id: string; invoiceNumber: string };
  payment: {
    id: string;
    paymentNumber: string;
    splits: SplitRow[];
    creditApplications: { id: string; amount: DecimalLike }[];
  };
  branch: { id: string; name: string } | null;
};

function mapToReceipt(row: ReceiptRow): Receipt {
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
    walletCreditAmount: row.payment.creditApplications.reduce(
      (sum, ca) => sum + ca.amount.toNumber(),
      0
    ),
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

export async function receiptNumberExists(receiptNumber: string, organizationId: string): Promise<boolean> {
  const db = await getDb();
  const count = await db.receipt.count({ where: { receiptNumber, organizationId } });
  return count > 0;
}

export async function getLastReceiptNumber(organizationId: string): Promise<number> {
  const db = await getDb();
  const last = await db.receipt.findFirst({
    where: { organizationId },
    orderBy: { receiptNumber: "desc" },
    select: { receiptNumber: true },
  });
  if (!last?.receiptNumber) return 0;
  const num = parseInt(last.receiptNumber.replace(/\D/g, ""), 10);
  return isNaN(num) ? 0 : num;
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
