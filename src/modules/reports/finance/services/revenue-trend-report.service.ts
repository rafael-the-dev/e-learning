import { getInvoiceMonthlyAggregates, getRefundMonthlyAggregates } from "../repositories/revenue-trend.repository";
import type { RevenueTrendFilters, RevenueTrendKPIs, RevenueTrendMonthlyRow, RevenueTrendReport } from "../types";

// Zero-fill happens here, never in the repository — the SQL layer only ever
// returns the months that actually have rows.

function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

// Default window when no explicit date range is supplied: the trailing 12
// months, ending today — mirrors the Wallet Activity Report's monthly trend default.
function resolveDateRange(filters: Pick<RevenueTrendFilters, "dateFrom" | "dateTo">): { from: Date; to: Date } {
  const to = filters.dateTo ? new Date(filters.dateTo) : new Date();
  const from = filters.dateFrom ? new Date(filters.dateFrom) : new Date(to.getFullYear(), to.getMonth() - 11, 1);
  return { from, to };
}

function listMonths(from: Date, to: Date): string[] {
  const months: string[] = [];
  const cursor = new Date(from.getFullYear(), from.getMonth(), 1);
  const end = new Date(to.getFullYear(), to.getMonth(), 1);
  while (cursor <= end) {
    months.push(monthKey(cursor));
    cursor.setMonth(cursor.getMonth() + 1);
  }
  return months;
}

export async function getRevenueTrendReport(filters: RevenueTrendFilters): Promise<RevenueTrendReport> {
  const [invoiceRows, refundRows] = await Promise.all([
    getInvoiceMonthlyAggregates(filters),
    getRefundMonthlyAggregates(filters),
  ]);

  const invoiceByMonth = new Map(invoiceRows.map((r) => [r.month, r]));
  const refundedByMonth = new Map(refundRows.map((r) => [r.month, r.refunded]));

  const { from, to } = resolveDateRange(filters);
  const months = listMonths(from, to);

  const rows: RevenueTrendMonthlyRow[] = months.map((month) => {
    const inv = invoiceByMonth.get(month);
    const invoiced = inv?.invoiced ?? 0;
    const collected = inv?.collected ?? 0;
    const outstanding = inv?.outstanding ?? 0;
    const refunded = refundedByMonth.get(month) ?? 0;

    return {
      month,
      invoiced,
      collected,
      refunded,
      netCollected: collected - refunded,
      outstanding,
      collectionRate: invoiced > 0 ? (collected / invoiced) * 100 : 0,
    };
  });

  const totalInvoiced = rows.reduce((sum, r) => sum + r.invoiced, 0);
  const totalCollected = rows.reduce((sum, r) => sum + r.collected, 0);
  const totalRefunded = rows.reduce((sum, r) => sum + r.refunded, 0);
  const outstandingBalance = rows.reduce((sum, r) => sum + r.outstanding, 0);

  const kpis: RevenueTrendKPIs = {
    totalInvoiced,
    totalCollected,
    totalRefunded,
    netCollected: totalCollected - totalRefunded,
    collectionRate: totalInvoiced > 0 ? (totalCollected / totalInvoiced) * 100 : 0,
    outstandingBalance,
  };

  return { kpis, rows };
}
