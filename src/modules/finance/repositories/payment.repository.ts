import { getDb } from "@/server/db";
import { buildSkipTake, buildPaginationMeta } from "@/shared/lib/pagination";
import type { PaginatedResult, PaginationParams } from "@/shared/types/common";
import type { Payment, PaymentSplit } from "@/modules/finance/types";

type DecimalLike = { toNumber(): number };

// =============================================================================
// PAYMENT REPOSITORY — all queries scoped to organizationId
// =============================================================================

export interface ListPaymentsParams extends PaginationParams {
  search?: string;
  status?: string;
  invoiceId?: string;
  studentId?: string;
  branchId?: string;
}

const paymentSelect = {
  id: true,
  organizationId: true,
  branchId: true,
  invoiceId: true,
  installmentId: true,
  studentId: true,
  enrollmentId: true,
  paymentNumber: true,
  paymentDate: true,
  totalAmount: true,
  status: true,
  notes: true,
  createdAt: true,
  updatedAt: true,
  createdBy: true,
  student: { select: { id: true, firstName: true, lastName: true } },
  invoice: { select: { id: true, invoiceNumber: true } },
  branch: { select: { id: true, name: true } },
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

type PaymentRow = {
  id: string;
  organizationId: string;
  branchId: string | null;
  invoiceId: string | null;
  installmentId: string | null;
  studentId: string | null;
  enrollmentId: string | null;
  paymentNumber: string;
  paymentDate: Date;
  totalAmount: DecimalLike;
  status: string;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string | null;
  student: { id: string; firstName: string; lastName: string } | null;
  invoice: { id: string; invoiceNumber: string } | null;
  branch: { id: string; name: string } | null;
  splits: SplitRow[];
};

function mapSplit(row: SplitRow, paymentId: string): PaymentSplit {
  return {
    id: row.id,
    organizationId: row.organizationId,
    paymentId,
    method: row.method as PaymentSplit["method"],
    amount: row.amount.toNumber(),
    reference: row.reference,
    notes: row.notes,
    createdAt: row.createdAt,
  };
}

function mapToPayment(row: PaymentRow): Payment {
  return {
    id: row.id,
    organizationId: row.organizationId,
    branchId: row.branchId,
    invoiceId: row.invoiceId,
    installmentId: row.installmentId,
    studentId: row.studentId,
    enrollmentId: row.enrollmentId,
    paymentNumber: row.paymentNumber,
    paymentDate: row.paymentDate,
    totalAmount: row.totalAmount.toNumber(),
    status: row.status as Payment["status"],
    notes: row.notes,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    createdBy: row.createdBy,
    studentName: row.student ? `${row.student.firstName} ${row.student.lastName}` : null,
    invoiceNumber: row.invoice?.invoiceNumber ?? null,
    branchName: row.branch?.name ?? null,
    splits: row.splits.map((s) => mapSplit(s, row.id)),
  };
}

export async function findPaymentsByOrganization(
  organizationId: string,
  params: ListPaymentsParams
): Promise<PaginatedResult<Payment>> {
  const db = await getDb();
  const { skip, take } = buildSkipTake(params);

  const where = {
    organizationId,
    ...(params.status && { status: params.status }),
    ...(params.invoiceId && { invoiceId: params.invoiceId }),
    ...(params.studentId && { studentId: params.studentId }),
    ...(params.branchId && { branchId: params.branchId }),
    ...(params.search && {
      OR: [
        { paymentNumber: { contains: params.search } },
        { student: { firstName: { contains: params.search } } },
        { student: { lastName: { contains: params.search } } },
      ],
    }),
  };

  const [rows, total] = await Promise.all([
    db.payment.findMany({ where, select: paymentSelect, skip, take, orderBy: { createdAt: "desc" } }),
    db.payment.count({ where }),
  ]);

  return buildPaginationMeta(rows.map(mapToPayment), total, params);
}

export async function findPaymentById(id: string, organizationId: string): Promise<Payment | null> {
  const db = await getDb();
  const row = await db.payment.findFirst({ where: { id, organizationId }, select: paymentSelect });
  return row ? mapToPayment(row) : null;
}

export async function paymentNumberExists(paymentNumber: string, organizationId: string): Promise<boolean> {
  const db = await getDb();
  const count = await db.payment.count({ where: { paymentNumber, organizationId } });
  return count > 0;
}

export async function getLastPaymentNumber(organizationId: string): Promise<number> {
  const db = await getDb();
  const last = await db.payment.findFirst({
    where: { organizationId },
    orderBy: { paymentNumber: "desc" },
    select: { paymentNumber: true },
  });
  if (!last?.paymentNumber) return 0;
  const num = parseInt(last.paymentNumber.replace(/\D/g, ""), 10);
  return isNaN(num) ? 0 : num;
}

export async function updatePaymentStatus(
  id: string,
  organizationId: string,
  status: string
): Promise<Payment> {
  const db = await getDb();
  const row = await db.payment.update({
    where: { id, organizationId },
    data: { status },
    select: paymentSelect,
  });
  return mapToPayment(row);
}

export async function countPaymentsByStatus(organizationId: string): Promise<Record<string, number>> {
  const db = await getDb();
  const rows = await db.payment.groupBy({
    by: ["status"],
    where: { organizationId },
    _count: { _all: true },
  });
  const result: Record<string, number> = {};
  for (const row of rows) result[row.status] = row._count._all;
  return result;
}
