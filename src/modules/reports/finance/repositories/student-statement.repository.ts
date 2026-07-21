import { getDb } from "@/server/db";
import { buildSkipTake, buildPaginationMeta } from "@/shared/lib/pagination";
import type { PaginationParams, PaginatedResult } from "@/shared/types/common";
import type {
  StudentStatementFilters,
  StudentStatementKPIs,
  StudentStatementInvoice,
  StudentStatementPayment,
  StudentStatementReceipt,
  StudentStatementWalletTransaction,
  StudentStatementRefund,
  StudentStatementLedgerEntry,
  StudentInfo,
} from "../types";

type DecimalLike = { toNumber(): number };

function toNum(v: DecimalLike | number | null | undefined): number {
  if (v == null) return 0;
  return typeof v === "object" ? v.toNumber() : v;
}

// =============================================================================
// SERVER-SIDE PAGINATED READS (M2) — one bounded page per finance dataset, scoped
// by organization + student, with a STABLE order ([date desc, id desc] — the id
// tiebreaker keeps pages deterministic when several rows share a date), a matching
// count, and soft-delete exclusion where the model supports it. The whole history is
// never loaded; the caller pages in the repository, not in memory/JS.
// =============================================================================

export async function getStudentInvoicesPage(
  filters: StudentStatementFilters,
  pagination: PaginationParams
): Promise<PaginatedResult<StudentStatementInvoice>> {
  const db = await getDb();
  const { skip, take } = buildSkipTake(pagination);
  const where = { organizationId: filters.organizationId, studentId: filters.studentId, deletedAt: null };
  const [rows, total] = await db.$transaction([
    db.invoice.findMany({
      where,
      orderBy: [{ issueDate: "desc" }, { id: "desc" }],
      skip,
      take,
      select: {
        id: true, invoiceNumber: true, issueDate: true, dueDate: true,
        totalAmount: true, paidAmount: true, balanceAmount: true, status: true,
      },
    }),
    db.invoice.count({ where }),
  ]);
  const data: StudentStatementInvoice[] = rows.map((r) => ({
    invoiceId: r.id,
    invoiceNumber: r.invoiceNumber,
    issueDate: r.issueDate,
    dueDate: r.dueDate,
    totalAmount: toNum(r.totalAmount as DecimalLike),
    paidAmount: toNum(r.paidAmount as DecimalLike),
    balanceAmount: toNum(r.balanceAmount as DecimalLike),
    status: r.status,
  }));
  return buildPaginationMeta(data, total, pagination);
}

export async function getStudentPaymentsPage(
  filters: StudentStatementFilters,
  pagination: PaginationParams
): Promise<PaginatedResult<StudentStatementPayment>> {
  const db = await getDb();
  const { skip, take } = buildSkipTake(pagination);
  const where = { organizationId: filters.organizationId, studentId: filters.studentId };
  const [rows, total] = await db.$transaction([
    db.payment.findMany({
      where,
      orderBy: [{ paymentDate: "desc" }, { id: "desc" }],
      skip,
      take,
      select: {
        id: true, paymentNumber: true, paymentDate: true, totalAmount: true, status: true,
        splits: { select: { method: true } },
        invoice: { select: { invoiceNumber: true } },
        receipt: { select: { receiptNumber: true } },
      },
    }),
    db.payment.count({ where }),
  ]);
  const data: StudentStatementPayment[] = rows.map((r) => ({
    paymentId: r.id,
    paymentNumber: r.paymentNumber,
    paymentDate: r.paymentDate,
    totalAmount: toNum(r.totalAmount as DecimalLike),
    status: r.status,
    paymentMethods: [...new Set(r.splits.map((s) => s.method))],
    invoiceNumber: r.invoice?.invoiceNumber ?? null,
    receiptNumber: r.receipt?.receiptNumber ?? null,
  }));
  return buildPaginationMeta(data, total, pagination);
}

export async function getStudentReceiptsPage(
  filters: StudentStatementFilters,
  pagination: PaginationParams
): Promise<PaginatedResult<StudentStatementReceipt>> {
  const db = await getDb();
  const { skip, take } = buildSkipTake(pagination);
  const where = { organizationId: filters.organizationId, studentId: filters.studentId };
  const [rows, total] = await db.$transaction([
    db.receipt.findMany({
      where,
      orderBy: [{ issueDate: "desc" }, { id: "desc" }],
      skip,
      take,
      select: {
        id: true, receiptNumber: true, issueDate: true, amount: true, refundedAmount: true, status: true,
        invoice: { select: { invoiceNumber: true } },
        payment: { select: { paymentNumber: true } },
      },
    }),
    db.receipt.count({ where }),
  ]);
  const data: StudentStatementReceipt[] = rows.map((r) => ({
    receiptId: r.id,
    receiptNumber: r.receiptNumber,
    issueDate: r.issueDate,
    amount: toNum(r.amount as DecimalLike),
    refundedAmount: toNum(r.refundedAmount as DecimalLike),
    status: r.status,
    invoiceNumber: r.invoice?.invoiceNumber ?? null,
    paymentNumber: r.payment?.paymentNumber ?? null,
  }));
  return buildPaginationMeta(data, total, pagination);
}

export async function getStudentRefundsPage(
  filters: StudentStatementFilters,
  pagination: PaginationParams
): Promise<PaginatedResult<StudentStatementRefund>> {
  const db = await getDb();
  const { skip, take } = buildSkipTake(pagination);
  const where = { organizationId: filters.organizationId, studentId: filters.studentId, deletedAt: null };
  const [rows, total] = await db.$transaction([
    db.refund.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip,
      take,
      select: {
        id: true, refundNumber: true, amount: true, refundMethod: true, status: true,
        createdAt: true, completedAt: true,
        payment: { select: { paymentNumber: true } },
      },
    }),
    db.refund.count({ where }),
  ]);
  const data: StudentStatementRefund[] = rows.map((r) => ({
    refundId: r.id,
    refundNumber: r.refundNumber,
    amount: toNum(r.amount as DecimalLike),
    refundMethod: r.refundMethod,
    status: r.status,
    requestedAt: r.createdAt,
    completedAt: r.completedAt,
    paymentNumber: r.payment?.paymentNumber ?? null,
  }));
  return buildPaginationMeta(data, total, pagination);
}

export async function getStudentInfo(
  studentId: string,
  organizationId: string
): Promise<StudentInfo | null> {
  const db = await getDb();
  const student = await db.student.findFirst({
    where: { id: studentId, organizationId, deletedAt: null },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      code: true,
      _count: { select: { enrollments: { where: { deletedAt: null } } } },
    },
  });
  if (!student) return null;
  return {
    studentId: student.id,
    studentName: `${student.firstName} ${student.lastName}`,
    studentCode: student.code ?? null,
    enrollmentCount: student._count.enrollments,
  };
}

export async function getStudentStatementKPIs(
  filters: StudentStatementFilters
): Promise<StudentStatementKPIs> {
  const db = await getDb();
  const { studentId, organizationId, dateFrom, dateTo } = filters;

  const dateWhere = dateFrom || dateTo
    ? { gte: dateFrom ? new Date(dateFrom) : undefined, lte: dateTo ? new Date(dateTo) : undefined }
    : undefined;

  const [invoices, payments, refunds, walletAgg, creditAgg] = await Promise.all([
    db.invoice.findMany({
      where: {
        organizationId,
        studentId,
        deletedAt: null,
        status: { not: "CANCELLED" },
        ...(dateWhere ? { issueDate: dateWhere } : {}),
      },
      select: { totalAmount: true, balanceAmount: true },
    }),
    db.payment.findMany({
      where: {
        organizationId,
        studentId,
        status: { in: ["CONFIRMED", "PARTIALLY_REFUNDED", "REFUNDED"] },
        ...(dateWhere ? { paymentDate: dateWhere } : {}),
      },
      select: { totalAmount: true },
    }),
    db.refund.findMany({
      where: {
        organizationId,
        studentId,
        status: "COMPLETED",
        deletedAt: null,
        ...(dateWhere ? { createdAt: dateWhere } : {}),
      },
      select: { amount: true },
    }),
    // StudentWallet has no stored balance column — compute from signed transaction sum
    db.studentWalletTransaction.aggregate({
      where: { organizationId, wallet: { studentId } },
      _sum: { amount: true },
    }),
    // Wallet credits applied directly to invoices (no Payment record created)
    db.creditApplication.aggregate({
      where: {
        organizationId,
        studentId,
        ...(dateWhere ? { createdAt: dateWhere } : {}),
      },
      _sum: { amount: true },
    }),
  ]);

  const totalInvoiced = invoices.reduce((s, i) => s + toNum(i.totalAmount as DecimalLike), 0);
  const totalPaid = payments.reduce((s, p) => s + toNum(p.totalAmount as DecimalLike), 0);
  const totalRefunded = refunds.reduce((s, r) => s + toNum(r.amount as DecimalLike), 0);
  const walletBalance = toNum(walletAgg._sum.amount as DecimalLike);
  const outstandingBalance = invoices.reduce((s, i) => s + toNum(i.balanceAmount as DecimalLike), 0);
  const creditApplied = toNum(creditAgg._sum.amount as DecimalLike);

  return { totalInvoiced, totalPaid, totalRefunded, walletBalance, outstandingBalance, creditApplied };
}

export async function getStudentInvoices(
  filters: StudentStatementFilters
): Promise<StudentStatementInvoice[]> {
  const db = await getDb();
  const dateWhere = filters.dateFrom || filters.dateTo
    ? {
        gte: filters.dateFrom ? new Date(filters.dateFrom) : undefined,
        lte: filters.dateTo ? new Date(filters.dateTo) : undefined,
      }
    : undefined;

  const rows = await db.invoice.findMany({
    where: {
      organizationId: filters.organizationId,
      studentId: filters.studentId,
      deletedAt: null,
      ...(dateWhere ? { issueDate: dateWhere } : {}),
    },
    orderBy: { issueDate: "desc" },
    select: {
      id: true,
      invoiceNumber: true,
      issueDate: true,
      dueDate: true,
      totalAmount: true,
      paidAmount: true,
      balanceAmount: true,
      status: true,
    },
  });

  return rows.map((r) => ({
    invoiceId: r.id,
    invoiceNumber: r.invoiceNumber,
    issueDate: r.issueDate,
    dueDate: r.dueDate,
    totalAmount: toNum(r.totalAmount as DecimalLike),
    paidAmount: toNum(r.paidAmount as DecimalLike),
    balanceAmount: toNum(r.balanceAmount as DecimalLike),
    status: r.status,
  }));
}

export async function getStudentPayments(
  filters: StudentStatementFilters
): Promise<StudentStatementPayment[]> {
  const db = await getDb();
  const dateWhere = filters.dateFrom || filters.dateTo
    ? {
        gte: filters.dateFrom ? new Date(filters.dateFrom) : undefined,
        lte: filters.dateTo ? new Date(filters.dateTo) : undefined,
      }
    : undefined;

  const rows = await db.payment.findMany({
    where: {
      organizationId: filters.organizationId,
      studentId: filters.studentId,
      ...(dateWhere ? { paymentDate: dateWhere } : {}),
    },
    orderBy: { paymentDate: "desc" },
    select: {
      id: true,
      paymentNumber: true,
      paymentDate: true,
      totalAmount: true,
      status: true,
      splits: { select: { method: true } },
      invoice: { select: { invoiceNumber: true } },
      receipt: { select: { receiptNumber: true } },
    },
  });

  return rows.map((r) => ({
    paymentId: r.id,
    paymentNumber: r.paymentNumber,
    paymentDate: r.paymentDate,
    totalAmount: toNum(r.totalAmount as DecimalLike),
    status: r.status,
    paymentMethods: [...new Set(r.splits.map((s) => s.method))],
    invoiceNumber: r.invoice?.invoiceNumber ?? null,
    receiptNumber: r.receipt?.receiptNumber ?? null,
  }));
}

export async function getStudentReceipts(
  filters: StudentStatementFilters
): Promise<StudentStatementReceipt[]> {
  const db = await getDb();
  const dateWhere = filters.dateFrom || filters.dateTo
    ? {
        gte: filters.dateFrom ? new Date(filters.dateFrom) : undefined,
        lte: filters.dateTo ? new Date(filters.dateTo) : undefined,
      }
    : undefined;

  const rows = await db.receipt.findMany({
    where: {
      organizationId: filters.organizationId,
      studentId: filters.studentId,
      ...(dateWhere ? { issueDate: dateWhere } : {}),
    },
    orderBy: { issueDate: "desc" },
    select: {
      id: true,
      receiptNumber: true,
      issueDate: true,
      amount: true,
      refundedAmount: true,
      status: true,
      invoice: { select: { invoiceNumber: true } },
      payment: { select: { paymentNumber: true } },
    },
  });

  return rows.map((r) => ({
    receiptId: r.id,
    receiptNumber: r.receiptNumber,
    issueDate: r.issueDate,
    amount: toNum(r.amount as DecimalLike),
    refundedAmount: toNum(r.refundedAmount as DecimalLike),
    status: r.status,
    invoiceNumber: r.invoice?.invoiceNumber ?? null,
    paymentNumber: r.payment?.paymentNumber ?? null,
  }));
}

export async function getStudentWalletTransactions(
  filters: StudentStatementFilters
): Promise<StudentStatementWalletTransaction[]> {
  const db = await getDb();
  const dateWhere = filters.dateFrom || filters.dateTo
    ? {
        gte: filters.dateFrom ? new Date(filters.dateFrom) : undefined,
        lte: filters.dateTo ? new Date(filters.dateTo) : undefined,
      }
    : undefined;

  const wallet = await db.studentWallet.findFirst({
    where: { organizationId: filters.organizationId, studentId: filters.studentId },
    select: { id: true },
  });
  if (!wallet) return [];

  const rows = await db.studentWalletTransaction.findMany({
    where: {
      organizationId: filters.organizationId,
      studentWalletId: wallet.id,
      ...(dateWhere ? { createdAt: dateWhere } : {}),
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      type: true,
      amount: true,
      description: true,
      createdAt: true,
      referenceType: true,
    },
  });

  return rows.map((r) => ({
    transactionId: r.id,
    type: r.type,
    amount: toNum(r.amount as DecimalLike),
    description: r.description,
    createdAt: r.createdAt,
    referenceType: r.referenceType,
  }));
}

export async function getStudentRefunds(
  filters: StudentStatementFilters
): Promise<StudentStatementRefund[]> {
  const db = await getDb();
  const dateWhere = filters.dateFrom || filters.dateTo
    ? {
        gte: filters.dateFrom ? new Date(filters.dateFrom) : undefined,
        lte: filters.dateTo ? new Date(filters.dateTo) : undefined,
      }
    : undefined;

  const rows = await db.refund.findMany({
    where: {
      organizationId: filters.organizationId,
      studentId: filters.studentId,
      deletedAt: null,
      ...(dateWhere ? { createdAt: dateWhere } : {}),
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      refundNumber: true,
      amount: true,
      refundMethod: true,
      status: true,
      createdAt: true,
      completedAt: true,
      payment: { select: { paymentNumber: true } },
    },
  });

  return rows.map((r) => ({
    refundId: r.id,
    refundNumber: r.refundNumber,
    amount: toNum(r.amount as DecimalLike),
    refundMethod: r.refundMethod,
    status: r.status,
    requestedAt: r.createdAt,
    completedAt: r.completedAt,
    paymentNumber: r.payment?.paymentNumber ?? null,
  }));
}

export async function getStudentLedger(
  filters: StudentStatementFilters
): Promise<StudentStatementLedgerEntry[]> {
  const db = await getDb();
  const dateWhere = filters.dateFrom || filters.dateTo
    ? {
        gte: filters.dateFrom ? new Date(filters.dateFrom) : undefined,
        lte: filters.dateTo ? new Date(filters.dateTo) : undefined,
      }
    : undefined;

  const rows = await db.financialTransaction.findMany({
    where: {
      organizationId: filters.organizationId,
      studentId: filters.studentId,
      ...(dateWhere ? { occurredAt: dateWhere } : {}),
    },
    orderBy: { occurredAt: "desc" },
    take: 200,
    select: {
      id: true,
      transactionType: true,
      direction: true,
      amount: true,
      description: true,
      transactionNumber: true,
      occurredAt: true,
    },
  });

  return rows.map((r) => ({
    id: r.id,
    transactionType: r.transactionType,
    direction: r.direction,
    amount: toNum(r.amount as DecimalLike),
    description: r.description,
    referenceNumber: r.transactionNumber,
    occurredAt: r.occurredAt,
  }));
}
