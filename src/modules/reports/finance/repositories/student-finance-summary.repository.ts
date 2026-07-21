import { getDb } from "@/server/db";
import {
  OPEN_INVOICE_STATUSES,
  resolveInvoiceTimezone,
  resolveOverdueBoundary,
  buildOverdueInvoiceWhere,
} from "@/modules/reports/finance/student-finance-semantics";

// =============================================================================
// STUDENT FINANCE SUMMARY (H3) — aggregate-only financial indicators for a student,
// computed with SQL COUNT / SUM / MIN / MAX. This NEVER loads the invoice / payment /
// receipt / refund lists into memory (that is the statement repository's job, paged
// per M2). It is the single source for the finance KPIs, the finance dimension of the
// risk engine, and the portals' finance summaries.
//
// Overdue uses the CANONICAL financial semantics (F-M1): a fact of open-status +
// balance > 0 + dueDate < the org's day boundary (timezone + grace) — NOT merely the
// materialized OVERDUE status. So the figures are correct even before the daily job flips
// statuses, and a paid-to-zero invoice never counts as overdue even if its status is stale.
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
  /** MIN dueDate over the canonical overdue set (null when none). */
  oldestOverdueDate: Date | null;
  unpaidInvoiceCount: number;
  paidInvoiceCount: number;
  nextDueDate: Date | null;
  lastPaymentDate: Date | null;
  // Wallet + credit + refunds
  walletBalance: number;
  creditApplied: number;
  totalRefunded: number;
  pendingRefundCount: number;
  /** Reference instant the overdue window was evaluated at (for parity/debugging). */
  asOf: Date;
}

type DecimalLike = { toNumber(): number };
function toNum(v: DecimalLike | number | null | undefined): number {
  if (v == null) return 0;
  return typeof v === "object" ? v.toNumber() : v;
}

export async function getStudentFinanceSummary(
  studentId: string,
  organizationId: string,
  asOf: Date = new Date()
): Promise<StudentFinanceSummary> {
  const db = await getDb();
  const scope = { organizationId, studentId };

  // The overdue boundary is the SAME one the daily-billing job uses: start of the org's day
  // (in its timezone) minus its grace days — so summary/risk and the job never disagree.
  const org = await db.organization.findUnique({
    where: { id: organizationId },
    select: { timezone: true, settings: { select: { overdueGraceDays: true } } },
  });
  const { timezone } = resolveInvoiceTimezone(org?.timezone);
  const overdueBoundary = resolveOverdueBoundary({
    timezone,
    graceDays: org?.settings?.overdueGraceDays ?? 0,
    now: asOf,
  });

  const [invoiceByStatus, overdueAgg, nextDue, paymentAgg, refundedAgg, pendingRefunds, walletAgg, creditAgg] =
    await Promise.all([
      // One grouped pass over the non-CANCELLED invoices → totals + per-status counts/balances.
      db.invoice.groupBy({
        by: ["status"],
        where: { ...scope, deletedAt: null, status: { not: "CANCELLED" } },
        _sum: { totalAmount: true, balanceAmount: true },
        _count: { _all: true },
      }),
      // Canonical OVERDUE aggregate (F-M1): open + balance > 0 + dueDate < boundary. Sums only
      // the still-owed balance (a partly-paid invoice contributes its remaining balance), and
      // MINs the dueDate for the oldest-overdue signal.
      db.invoice.aggregate({
        where: buildOverdueInvoiceWhere({ organizationId, studentId, boundary: overdueBoundary }),
        _sum: { balanceAmount: true },
        _min: { dueDate: true },
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
  let unpaidInvoiceCount = 0;
  let paidInvoiceCount = 0;
  for (const g of invoiceByStatus) {
    totalInvoiced += toNum(g._sum.totalAmount as DecimalLike);
    outstandingBalance += toNum(g._sum.balanceAmount as DecimalLike);
    if (UNPAID_INVOICE_STATUSES.includes(g.status)) unpaidInvoiceCount += g._count._all;
    if (g.status === "PAID") paidInvoiceCount += g._count._all;
  }

  return {
    totalInvoiced,
    totalPaid: toNum(paymentAgg._sum.totalAmount as DecimalLike),
    outstandingBalance,
    overdueAmount: toNum(overdueAgg._sum.balanceAmount as DecimalLike),
    overdueInvoiceCount: overdueAgg._count._all,
    oldestOverdueDate: overdueAgg._min.dueDate ?? null,
    unpaidInvoiceCount,
    paidInvoiceCount,
    nextDueDate: nextDue._min.dueDate ?? null,
    lastPaymentDate: paymentAgg._max.paymentDate ?? null,
    walletBalance: toNum(walletAgg._sum.amount as DecimalLike),
    creditApplied: toNum(creditAgg._sum.amount as DecimalLike),
    totalRefunded: toNum(refundedAgg._sum.amount as DecimalLike),
    pendingRefundCount: pendingRefunds,
    asOf,
  };
}

// Keep OPEN_INVOICE_STATUSES referenced for callers importing it from here (re-export).
export { OPEN_INVOICE_STATUSES };
