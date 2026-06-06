import { getDb } from "@/server/db";
import { buildSkipTake, buildPaginationMeta } from "@/shared/lib/pagination";
import { ITEM_TYPE_PRIORITY } from "@/modules/finance/types";
import type { PaginatedResult, PaginationParams } from "@/shared/types/common";
import type { Invoice, InvoiceItem } from "@/modules/finance/types";

type DecimalLike = { toNumber(): number };

// =============================================================================
// INVOICE REPOSITORY — all queries scoped to organizationId
// =============================================================================

export interface ListInvoicesParams extends PaginationParams {
  search?: string;
  status?: string;
  studentId?: string;
  branchId?: string;
  enrollmentId?: string;
}

const invoiceSelect = {
  id: true,
  organizationId: true,
  branchId: true,
  enrollmentId: true,
  studentId: true,
  invoiceNumber: true,
  issueDate: true,
  dueDate: true,
  subtotal: true,
  discountAmount: true,
  taxAmount: true,
  totalAmount: true,
  paidAmount: true,
  balanceAmount: true,
  status: true,
  notes: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
  createdBy: true,
  updatedBy: true,
  student: { select: { id: true, firstName: true, lastName: true } },
  branch: { select: { id: true, name: true } },
  enrollment: { select: { id: true, enrollmentNumber: true } },
  items: {
    select: {
      id: true,
      organizationId: true,
      invoiceId: true,
      feeDefinitionId: true,
      itemType: true,
      description: true,
      quantity: true,
      unitPrice: true,
      totalPrice: true,
      paidAmount: true,
      balanceAmount: true,
      priority: true,
      status: true,
      createdAt: true,
      updatedAt: true,
    },
    orderBy: [{ priority: "asc" as const }, { id: "asc" as const }] as object[],
  },
};

type ItemRow = {
  id: string;
  organizationId: string;
  invoiceId: string;
  feeDefinitionId: string | null;
  itemType: string;
  description: string;
  quantity: DecimalLike;
  unitPrice: DecimalLike;
  totalPrice: DecimalLike;
  paidAmount: DecimalLike;
  balanceAmount: DecimalLike;
  priority: number;
  status: string;
  createdAt: Date;
  updatedAt: Date;
};

type InvoiceRow = {
  id: string;
  organizationId: string;
  branchId: string | null;
  enrollmentId: string | null;
  studentId: string | null;
  invoiceNumber: string;
  issueDate: Date;
  dueDate: Date | null;
  subtotal: DecimalLike;
  discountAmount: DecimalLike;
  taxAmount: DecimalLike;
  totalAmount: DecimalLike;
  paidAmount: DecimalLike;
  balanceAmount: DecimalLike;
  status: string;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
  createdBy: string | null;
  updatedBy: string | null;
  student: { id: string; firstName: string; lastName: string } | null;
  branch: { id: string; name: string } | null;
  enrollment: { id: string; enrollmentNumber: string | null } | null;
  items: ItemRow[];
};

function mapItem(item: ItemRow): InvoiceItem {
  return {
    id: item.id,
    organizationId: item.organizationId,
    invoiceId: item.invoiceId,
    feeDefinitionId: item.feeDefinitionId,
    itemType: item.itemType as InvoiceItem["itemType"],
    description: item.description,
    quantity: item.quantity.toNumber(),
    unitPrice: item.unitPrice.toNumber(),
    totalPrice: item.totalPrice.toNumber(),
    paidAmount: item.paidAmount.toNumber(),
    balanceAmount: item.balanceAmount.toNumber(),
    priority: item.priority,
    status: item.status as InvoiceItem["status"],
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}

function mapToInvoice(row: InvoiceRow): Invoice {
  return {
    id: row.id,
    organizationId: row.organizationId,
    branchId: row.branchId,
    enrollmentId: row.enrollmentId,
    studentId: row.studentId,
    invoiceNumber: row.invoiceNumber,
    issueDate: row.issueDate,
    dueDate: row.dueDate,
    subtotal: row.subtotal.toNumber(),
    discountAmount: row.discountAmount.toNumber(),
    taxAmount: row.taxAmount.toNumber(),
    totalAmount: row.totalAmount.toNumber(),
    paidAmount: row.paidAmount.toNumber(),
    balanceAmount: row.balanceAmount.toNumber(),
    status: row.status as Invoice["status"],
    notes: row.notes,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    deletedAt: row.deletedAt,
    createdBy: row.createdBy,
    updatedBy: row.updatedBy,
    studentName: row.student ? `${row.student.firstName} ${row.student.lastName}` : null,
    branchName: row.branch?.name ?? null,
    enrollmentNumber: row.enrollment?.enrollmentNumber ?? null,
    items: row.items.map(mapItem),
  };
}

export async function findInvoicesByOrganization(
  organizationId: string,
  params: ListInvoicesParams
): Promise<PaginatedResult<Invoice>> {
  const db = await getDb();
  const { skip, take } = buildSkipTake(params);

  const where = {
    organizationId,
    deletedAt: null,
    ...(params.status && { status: params.status }),
    ...(params.studentId && { studentId: params.studentId }),
    ...(params.branchId && { branchId: params.branchId }),
    ...(params.enrollmentId && { enrollmentId: params.enrollmentId }),
    ...(params.search && {
      OR: [
        { invoiceNumber: { contains: params.search } },
        { student: { firstName: { contains: params.search } } },
        { student: { lastName: { contains: params.search } } },
      ],
    }),
  };

  const [rows, total] = await Promise.all([
    db.invoice.findMany({ where, select: invoiceSelect, skip, take, orderBy: { createdAt: "desc" } }),
    db.invoice.count({ where }),
  ]);

  return buildPaginationMeta(rows.map(mapToInvoice), total, params);
}

export async function findInvoiceById(id: string, organizationId: string): Promise<Invoice | null> {
  const db = await getDb();
  const row = await db.invoice.findFirst({
    where: { id, organizationId, deletedAt: null },
    select: invoiceSelect,
  });
  return row ? mapToInvoice(row) : null;
}

export async function invoiceNumberExists(invoiceNumber: string, organizationId: string): Promise<boolean> {
  const db = await getDb();
  const count = await db.invoice.count({ where: { invoiceNumber, organizationId } });
  return count > 0;
}

export async function getLastInvoiceNumber(organizationId: string): Promise<number> {
  const db = await getDb();
  const last = await db.invoice.findFirst({
    where: { organizationId },
    orderBy: { invoiceNumber: "desc" },
    select: { invoiceNumber: true },
  });
  if (!last?.invoiceNumber) return 0;
  const num = parseInt(last.invoiceNumber.replace(/\D/g, ""), 10);
  return isNaN(num) ? 0 : num;
}

export async function createInvoice(data: {
  organizationId: string;
  branchId?: string | null;
  enrollmentId?: string | null;
  studentId?: string | null;
  invoiceNumber: string;
  dueDate?: Date | null;
  subtotal: number;
  discountAmount: number;
  taxAmount: number;
  totalAmount: number;
  notes?: string | null;
  createdBy?: string | null;
  items: {
    description: string;
    quantity: number;
    unitPrice: number;
    totalPrice: number;
    itemType?: string;
    feeDefinitionId?: string | null;
  }[];
}): Promise<Invoice> {
  const db = await getDb();
  const row = await db.invoice.create({
    data: {
      organizationId: data.organizationId,
      branchId: data.branchId ?? null,
      enrollmentId: data.enrollmentId ?? null,
      studentId: data.studentId ?? null,
      invoiceNumber: data.invoiceNumber,
      dueDate: data.dueDate ?? null,
      subtotal: data.subtotal,
      discountAmount: data.discountAmount,
      taxAmount: data.taxAmount,
      totalAmount: data.totalAmount,
      balanceAmount: data.totalAmount,
      notes: data.notes ?? null,
      createdBy: data.createdBy ?? null,
      items: {
        create: data.items.map((item) => {
          const itemType = item.itemType ?? "OTHER";
          return {
            organizationId: data.organizationId,
            feeDefinitionId: item.feeDefinitionId ?? null,
            itemType,
            description: item.description,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            totalPrice: item.totalPrice,
            // balanceAmount initialized to totalPrice (item is fully unpaid)
            balanceAmount: item.totalPrice,
            priority: ITEM_TYPE_PRIORITY[itemType] ?? 7,
          };
        }),
      },
    },
    select: invoiceSelect,
  });
  return mapToInvoice(row);
}

export async function updateInvoice(
  id: string,
  organizationId: string,
  data: {
    dueDate?: Date | null;
    discountAmount?: number;
    taxAmount?: number;
    totalAmount?: number;
    balanceAmount?: number;
    notes?: string | null;
    updatedBy?: string | null;
  }
): Promise<Invoice> {
  const db = await getDb();
  const row = await db.invoice.update({
    where: { id, organizationId },
    data: { ...data, updatedAt: new Date() },
    select: invoiceSelect,
  });
  return mapToInvoice(row);
}

export async function updateInvoiceStatus(
  id: string,
  organizationId: string,
  status: string,
  updatedBy?: string | null
): Promise<Invoice> {
  const db = await getDb();
  const row = await db.invoice.update({
    where: { id, organizationId },
    data: { status, updatedBy: updatedBy ?? null },
    select: invoiceSelect,
  });
  return mapToInvoice(row);
}

export async function applyPaymentToInvoice(
  id: string,
  organizationId: string,
  amount: number
): Promise<Invoice> {
  const db = await getDb();
  const current = await db.invoice.findUniqueOrThrow({ where: { id, organizationId }, select: { paidAmount: true, totalAmount: true } });
  const newPaid = current.paidAmount.toNumber() + amount;
  const newBalance = current.totalAmount.toNumber() - newPaid;
  const newStatus = newBalance <= 0 ? "PAID" : "PARTIALLY_PAID";
  const row = await db.invoice.update({
    where: { id, organizationId },
    data: { paidAmount: newPaid, balanceAmount: newBalance, status: newStatus },
    select: invoiceSelect,
  });
  return mapToInvoice(row);
}

export async function reversePaymentOnInvoice(
  id: string,
  organizationId: string,
  amount: number
): Promise<Invoice> {
  const db = await getDb();
  const current = await db.invoice.findUniqueOrThrow({ where: { id, organizationId }, select: { paidAmount: true, totalAmount: true } });
  const newPaid = Math.max(0, current.paidAmount.toNumber() - amount);
  const newBalance = current.totalAmount.toNumber() - newPaid;
  const newStatus = newPaid <= 0 ? "PENDING" : "PARTIALLY_PAID";
  const row = await db.invoice.update({
    where: { id, organizationId },
    data: { paidAmount: newPaid, balanceAmount: newBalance, status: newStatus },
    select: invoiceSelect,
  });
  return mapToInvoice(row);
}

export interface OpenInvoiceForPayment {
  id: string;
  invoiceNumber: string;
  balanceAmount: number;
  studentId: string | null;
  studentName: string | null;
}

export async function findOpenInvoicesForPaymentForm(
  organizationId: string,
  limit = 100
): Promise<OpenInvoiceForPayment[]> {
  const db = await getDb();
  const rows = await db.invoice.findMany({
    where: {
      organizationId,
      deletedAt: null,
      status: { notIn: ["CANCELLED", "PAID"] },
    },
    select: {
      id: true,
      invoiceNumber: true,
      balanceAmount: true,
      studentId: true,
      student: { select: { firstName: true, lastName: true } },
    },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  return rows.map((row) => ({
    id: row.id,
    invoiceNumber: row.invoiceNumber,
    balanceAmount: (row.balanceAmount as DecimalLike).toNumber(),
    studentId: row.studentId,
    studentName: row.student ? `${row.student.firstName} ${row.student.lastName}` : null,
  }));
}

export async function countInvoicesByStatus(organizationId: string): Promise<Record<string, number>> {
  const db = await getDb();
  const rows = await db.invoice.groupBy({
    by: ["status"],
    where: { organizationId, deletedAt: null },
    _count: { _all: true },
  });
  const result: Record<string, number> = {};
  for (const row of rows) result[row.status] = row._count._all;
  return result;
}
