import { getDb } from "@/server/db";
import { getNextTransactionNumber } from "@/modules/finance/services/financial-sequence.service";
import type { PrismaClient } from "@prisma/client";
import type { FinancialTransaction, LedgerEntryInput, ListLedgerParams } from "@/modules/finance/ledger/types";

export type TxClient = Omit<
  PrismaClient,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends"
>;

type DecimalLike = { toNumber: () => number } | number;

function toNum(v: DecimalLike): number {
  return typeof v === "object" ? v.toNumber() : v;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapRow(row: any): FinancialTransaction {
  return {
    ...row,
    amount: toNum(row.amount),
  };
}

// =============================================================================
// WRITE — called only from FinancialTransactionService inside existing db.$transaction
// =============================================================================

/**
 * Appends a single journal entry inside the caller's transaction.
 * NEVER call this outside a $transaction — atomicity with the originating event
 * is the only thing that makes the ledger trustworthy.
 */
export async function appendLedgerEntry(
  tx: TxClient,
  organizationId: string,
  entry: LedgerEntryInput
): Promise<void> {
  const transactionNumber = await getNextTransactionNumber(tx);
  await tx.financialTransaction.create({
    data: {
      organizationId,
      transactionNumber,
      transactionType: entry.transactionType,
      direction: entry.direction,
      amount: entry.amount,
      sourceType: entry.sourceType,
      sourceId: entry.sourceId,
      invoiceId: entry.invoiceId ?? null,
      paymentId: entry.paymentId ?? null,
      receiptId: entry.receiptId ?? null,
      refundId: entry.refundId ?? null,
      studentId: entry.studentId ?? null,
      enrollmentId: entry.enrollmentId ?? null,
      description: entry.description ?? null,
      actorId: entry.actorId ?? null,
      occurredAt: entry.occurredAt ?? new Date(),
    },
  });
}

// =============================================================================
// READ — queries for reports, reconciliation, and diagnostics
// =============================================================================

export async function findLedgerEntries(
  params: ListLedgerParams
): Promise<FinancialTransaction[]> {
  const db = await getDb();
  const { organizationId, invoiceId, paymentId, studentId, transactionType, direction, dateFrom, dateTo, limit = 100, offset = 0 } = params;

  const rows = await db.financialTransaction.findMany({
    where: {
      organizationId,
      ...(invoiceId ? { invoiceId } : {}),
      ...(paymentId ? { paymentId } : {}),
      ...(studentId ? { studentId } : {}),
      ...(transactionType ? { transactionType } : {}),
      ...(direction ? { direction } : {}),
      ...(dateFrom || dateTo
        ? {
            occurredAt: {
              ...(dateFrom ? { gte: dateFrom } : {}),
              ...(dateTo ? { lte: dateTo } : {}),
            },
          }
        : {}),
    },
    orderBy: { occurredAt: "desc" },
    take: limit,
    skip: offset,
  });

  return rows.map(mapRow);
}

export async function findLedgerEntriesByInvoice(
  invoiceId: string,
  organizationId: string
): Promise<FinancialTransaction[]> {
  return findLedgerEntries({ organizationId, invoiceId });
}

export async function findLedgerEntriesByPayment(
  paymentId: string,
  organizationId: string
): Promise<FinancialTransaction[]> {
  return findLedgerEntries({ organizationId, paymentId });
}

export async function findLedgerEntriesByStudent(
  studentId: string,
  organizationId: string,
  limit = 50
): Promise<FinancialTransaction[]> {
  return findLedgerEntries({ organizationId, studentId, limit });
}

export async function getLedgerSummary(
  organizationId: string,
  dateFrom?: Date,
  dateTo?: Date
): Promise<{ totalCredits: number; totalDebits: number; net: number }> {
  const db = await getDb();

  const agg = await db.financialTransaction.groupBy({
    by: ["direction"],
    where: {
      organizationId,
      ...(dateFrom || dateTo
        ? {
            occurredAt: {
              ...(dateFrom ? { gte: dateFrom } : {}),
              ...(dateTo ? { lte: dateTo } : {}),
            },
          }
        : {}),
    },
    _sum: { amount: true },
  });

  let totalCredits = 0;
  let totalDebits = 0;
  for (const row of agg) {
    const sum = row._sum.amount ? toNum(row._sum.amount as DecimalLike) : 0;
    if (row.direction === "CREDIT") totalCredits = sum;
    else totalDebits = sum;
  }

  return { totalCredits, totalDebits, net: totalCredits - totalDebits };
}
