import {
  aggregateOverdueInvoices,
  aggregatePendingPayments,
  aggregatePendingRefunds,
} from "@/modules/secretary-portal/repositories/secretary-portal.repository";
import type { SecretaryFinancialAttention } from "@/modules/secretary-portal/types";

// =============================================================================
// SECRETARY PORTAL — FINANCIAL ATTENTION
// Operational, not executive: only the queues that need an action today
// (overdue invoices, payments to confirm, refunds to process). No full
// finance analytics — that stays behind the finance reports permissions.
// =============================================================================

export async function getSecretaryFinancialAttention(
  organizationId: string,
  now: Date
): Promise<SecretaryFinancialAttention> {
  const [overdue, pendingPayments, pendingRefunds] = await Promise.all([
    aggregateOverdueInvoices(organizationId, now),
    aggregatePendingPayments(organizationId),
    aggregatePendingRefunds(organizationId),
  ]);

  return {
    overdueInvoiceCount: overdue.count,
    overdueAmount: overdue.amount,
    pendingPaymentCount: pendingPayments.count,
    pendingPaymentAmount: pendingPayments.amount,
    pendingRefundCount: pendingRefunds.count,
    pendingRefundAmount: pendingRefunds.amount,
  };
}
