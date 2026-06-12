import { findPaymentWatchlist } from "@/modules/finance/repositories/payment-dashboard.repository";
import type { PaymentWatchlistItem } from "@/modules/finance/types";

export async function getPaymentWatchlist(
  organizationId: string
): Promise<PaymentWatchlistItem[]> {
  return findPaymentWatchlist(organizationId);
}
