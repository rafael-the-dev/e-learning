import { getOrganizationHealthScore } from "@/modules/dashboard/services/dashboard-health.service";
import { getExecutiveKpis, getQuickStats } from "@/modules/dashboard/services/dashboard-metrics.service";
import { getExecutiveTrendData } from "@/modules/dashboard/services/dashboard-trend.service";
import { getAcademicWatchlist } from "@/modules/dashboard/services/dashboard-academic.service";
import { getFinancialWatchlist } from "@/modules/dashboard/services/dashboard-financial.service";
import { getActivityFeed } from "@/modules/dashboard/services/dashboard-activity-feed.service";
import { getAlerts } from "@/modules/dashboard/services/dashboard-watchlist.service";
import { getUpcomingDeadlines } from "@/modules/dashboard/services/dashboard-deadlines.service";
import type { ExecutiveDashboardData } from "@/modules/dashboard/types";

// =============================================================================
// EXECUTIVE DASHBOARD — ORCHESTRATOR
// Every section is independent and fetched in parallel; nothing here blocks
// on anything else.
// =============================================================================

export async function getExecutiveDashboardData(organizationId: string): Promise<ExecutiveDashboardData> {
  const [health, kpis, quickStats, trend, academicWatchlist, financialWatchlist, activityFeed, alerts, deadlines] =
    await Promise.all([
      getOrganizationHealthScore(organizationId),
      getExecutiveKpis(organizationId),
      getQuickStats(organizationId),
      getExecutiveTrendData(organizationId),
      getAcademicWatchlist(organizationId),
      getFinancialWatchlist(organizationId),
      getActivityFeed(organizationId),
      getAlerts(organizationId),
      getUpcomingDeadlines(organizationId),
    ]);

  return { health, kpis, quickStats, trend, academicWatchlist, financialWatchlist, activityFeed, alerts, deadlines };
}
