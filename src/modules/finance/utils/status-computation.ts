// =============================================================================
// STATUS COMPUTATION — pure functions used by payment commands and daily billing job
// =============================================================================

/**
 * Determines the invoice status after a payment is applied.
 *
 * OVERDUE is preserved when the invoice has a remaining balance so that
 * a partial payment does not accidentally promote an overdue invoice to
 * PARTIALLY_PAID. Only a full payment (balance <= 0) clears OVERDUE → PAID.
 */
export function computeNewInvoiceStatus(
  currentStatus: string,
  newBalance: number,
  newPaid: number
): string {
  if (newBalance <= 0) return "PAID";
  if (currentStatus === "OVERDUE") return "OVERDUE";
  return newPaid > 0 ? "PARTIALLY_PAID" : "PENDING";
}

/**
 * Determines the invoice status after a payment is reversed (cancelled).
 *
 * Extends computeNewInvoiceStatus by also re-deriving OVERDUE from the
 * invoice's dueDate: cancelling a payment must never silently un-mark an
 * invoice that is legitimately past its due date.
 *
 * Priority:
 *   1. Full settlement (balance ≤ 0)            → PAID
 *   2. Was already OVERDUE before the payment   → OVERDUE (preserve)
 *   3. dueDate is in the past                   → OVERDUE (re-derive)
 *   4. Partial payment remains                  → PARTIALLY_PAID
 *   5. No payment at all                        → PENDING
 */
export function computeInvoiceStatusOnReversal(
  currentStatus: string,
  newBalance: number,
  newPaid: number,
  dueDate: Date | null
): string {
  if (newBalance <= 0) return "PAID";
  if (currentStatus === "OVERDUE") return "OVERDUE";
  if (dueDate !== null && dueDate < new Date()) return "OVERDUE";
  return newPaid > 0 ? "PARTIALLY_PAID" : "PENDING";
}

/**
 * Determines the installment status after a payment is applied.
 *
 * OVERDUE is preserved when the installment has a remaining balance.
 * Full payment (balance <= 0) always results in PAID.
 */
export function computeNewInstallmentStatus(
  currentStatus: string,
  newBalance: number
): string {
  if (newBalance <= 0) return "PAID";
  if (currentStatus === "OVERDUE") return "OVERDUE";
  return "PARTIALLY_PAID";
}
