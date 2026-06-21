import { getClosingWatchlist } from "@/modules/reports/finance/repositories/closing.repository";
import type { FinancialWatchlistItem } from "@/modules/dashboard/types";

const WATCHLIST_LIMIT = 15;

// =============================================================================
// FINANCIAL WATCHLIST
// The Financial Closing Dashboard already assembles exactly this signal set
// (integrity criticals/highs, reconciliation mismatches, duplicate/orphan
// ledger entries, wallet liability concentration, refund exposure, overdue
// receivables) into one severity-ranked list — closing.repository.ts's
// getClosingWatchlist(). Reused verbatim rather than re-querying each source.
// =============================================================================

export async function getFinancialWatchlist(organizationId: string): Promise<FinancialWatchlistItem[]> {
  const items = await getClosingWatchlist({ organizationId });

  return items.slice(0, WATCHLIST_LIMIT).map((item) => ({
    severity: item.severity,
    reference: `${item.entityType} ${item.entityReference}`,
    amount: item.amount,
    issue: item.description,
    link: item.link,
  }));
}
