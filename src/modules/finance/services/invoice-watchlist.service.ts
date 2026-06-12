import { findInvoiceWatchlist } from "@/modules/finance/repositories/invoice-dashboard.repository";
import type { InvoiceWatchlistItem } from "@/modules/finance/types";

export async function getInvoiceWatchlist(
  organizationId: string
): Promise<InvoiceWatchlistItem[]> {
  return findInvoiceWatchlist(organizationId);
}
