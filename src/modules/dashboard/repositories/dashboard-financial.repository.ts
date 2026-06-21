import { getDb } from "@/server/db";

// =============================================================================
// DASHBOARD FINANCIAL REPOSITORY
// Thin, dashboard-specific reads that have no existing equivalent elsewhere.
// Everything else (receivables, wallet liability, payments, watchlist) is
// composed in dashboard-financial.service.ts directly from the Finance
// Reports module — see that file for the reused functions.
// =============================================================================

export async function countOverdueInvoices(organizationId: string): Promise<number> {
  const db = await getDb();
  return db.invoice.count({ where: { organizationId, status: "OVERDUE", deletedAt: null } });
}

// "Pendentes > 30 dias" — REQUESTED refunds (no decision yet) older than 30
// days. Distinct from the Refund Analysis Watchlist's own age/amount tiers
// (refund-analysis.repository.ts), which mixes APPROVED refunds and lower
// amount thresholds — this is the literal count the Health Score formula needs.
export async function countRefundsPendingOver30Days(organizationId: string): Promise<number> {
  const db = await getDb();
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 30);
  return db.refund.count({
    where: { organizationId, deletedAt: null, status: "REQUESTED", createdAt: { lt: cutoff } },
  });
}

export async function getOrgCurrencySymbol(organizationId: string): Promise<string> {
  const db = await getDb();
  const settings = await db.organizationSettings.findUnique({
    where: { organizationId },
    select: { currencySymbol: true },
  });
  return settings?.currencySymbol ?? "MT";
}
