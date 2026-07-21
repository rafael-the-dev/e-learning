import { getDb } from "@/server/db";

// =============================================================================
// STUDENT FINANCE SUMMARY (H3) — aggregate-only financial indicators for a student,
// computed with SQL COUNT / SUM / MIN / MAX. This NEVER loads the invoice / payment /
// receipt / refund lists into memory (that is the statement repository's job, paged
// per M2). It is the single source for the finance KPIs, the finance dimension of the
// risk engine, and the portals' finance summaries — separated from the statement
// because they have different lifecycles (the summary changes rarely and is cacheable;
// the statement history changes often).
//
// Semantics match the previous getStudentStatementKPIs exactly (status filters, the
// non-CANCELLED invoice base, the CONFIRMED/…-refunded payment base, COMPLETED refunds,
// signed wallet-transaction sum) so no figure changes — only how it is computed.
// =============================================================================

const UNPAID_INVOICE_STATUSES = ["PENDING", "OVERDUE", "PARTIALLY_PAID"];
const COUNTED_PAYMENT_STATUSES = ["CONFIRMED", "PARTIALLY_REFUNDED", "REFUNDED"];
const PENDING_REFUND_STATUSES = ["REQUESTED", "APPROVED"];

export interface StudentFinanceSummary {
  // Billing (invoices + payments)
  totalInvoiced: number;
  totalPaid: number;
  outstandingBalance: number;
  overdueAmount: number;
  overdueInvoiceCount: number;
  unpaidInvoiceCount: number;
  paidInvoiceCount: number;
  nextDueDate: Date | null;
  lastPaymentDate: Date | null;
  // Wallet + credit + refunds
  walletBalance: number;
  creditApplied: number;
  totalRefunded: number;
  pendingRefundCount: number;
}

type DecimalLike = { toNumber(): number };
function toNum(v: DecimalLike | number | null | undefined): number {
  if (v == null) return 0;
  return typeof v === "object" ? v.toNumber() : v;
}

export async function getStudentFinanceSummary(
  studentId: string,
  organizationId: string
): Promise<StudentFinanceSummary> {
  const db = await getDb();
  const scope = { organizationId, studentId };

  const [invoiceByStatus, nextDue, paymentAgg, refundedAgg, pendingRefunds, walletAgg, creditAgg] =
    await Promise.all([
      // One grouped pass over the non-CANCELLED invoices → totals + per-status counts/balances.
      db.invoice.groupBy({
        by: ["status"],
        where: { ...scope, deletedAt: null, status: { not: "CANCELLED" } },
        _sum: { totalAmount: true, balanceAmount: true },
        _count: { _all: true },
      }),
      // Earliest upcoming/unpaid due date (MIN over unpaid invoices with a due date).
      db.invoice.aggregate({
        where: { ...scope, deletedAt: null, status: { in: UNPAID_INVOICE_STATUSES }, dueDate: { not: null } },
        _min: { dueDate: true },
      }),
      db.payment.aggregate({
        where: { ...scope, status: { in: COUNTED_PAYMENT_STATUSES } },
        _sum: { totalAmount: true },
        _max: { paymentDate: true },
      }),
      db.refund.aggregate({
        where: { ...scope, deletedAt: null, status: "COMPLETED" },
        _sum: { amount: true },
      }),
      db.refund.count({ where: { ...scope, deletedAt: null, status: { in: PENDING_REFUND_STATUSES } } }),
      // StudentWallet has no stored balance — signed sum of its transactions.
      db.studentWalletTransaction.aggregate({ where: { organizationId, wallet: { studentId } }, _sum: { amount: true } }),
      db.creditApplication.aggregate({ where: scope, _sum: { amount: true } }),
    ]);

  let totalInvoiced = 0;
  let outstandingBalance = 0;
  let overdueAmount = 0;
  let overdueInvoiceCount = 0;
  let unpaidInvoiceCount = 0;
  let paidInvoiceCount = 0;
  for (const g of invoiceByStatus) {
    totalInvoiced += toNum(g._sum.totalAmount as DecimalLike);
    outstandingBalance += toNum(g._sum.balanceAmount as DecimalLike);
    if (g.status === "OVERDUE") {
      overdueInvoiceCount += g._count._all;
      overdueAmount += toNum(g._sum.balanceAmount as DecimalLike);
    }
    if (UNPAID_INVOICE_STATUSES.includes(g.status)) unpaidInvoiceCount += g._count._all;
    if (g.status === "PAID") paidInvoiceCount += g._count._all;
  }

  return {
    totalInvoiced,
    totalPaid: toNum(paymentAgg._sum.totalAmount as DecimalLike),
    outstandingBalance,
    overdueAmount,
    overdueInvoiceCount,
    unpaidInvoiceCount,
    paidInvoiceCount,
    nextDueDate: nextDue._min.dueDate ?? null,
    lastPaymentDate: paymentAgg._max.paymentDate ?? null,
    walletBalance: toNum(walletAgg._sum.amount as DecimalLike),
    creditApplied: toNum(creditAgg._sum.amount as DecimalLike),
    totalRefunded: toNum(refundedAgg._sum.amount as DecimalLike),
    pendingRefundCount: pendingRefunds,
  };
}
