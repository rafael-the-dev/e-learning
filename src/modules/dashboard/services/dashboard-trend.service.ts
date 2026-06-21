import { getRevenueTrendReport } from "@/modules/reports/finance/services/revenue-trend-report.service";
import {
  getEnrollmentMonthlyTrend,
  getAttendanceMonthlyTrend,
  getAssessmentMonthlyTrend,
} from "@/modules/dashboard/repositories/dashboard-trend.repository";
import type { ExecutiveTrendData } from "@/modules/dashboard/types";

// =============================================================================
// EVOLUÇÃO ORGANIZACIONAL — 4-tab trend card
// Receitas reuses the Finance Reports module's Revenue Trend exactly
// (getRevenueTrendReport); Matrículas/Presenças/Avaliações come from the new
// dashboard-trend.repository.ts aggregates.
// =============================================================================

export async function getExecutiveTrendData(organizationId: string): Promise<ExecutiveTrendData> {
  const [revenueReport, enrollments, attendance, assessments] = await Promise.all([
    getRevenueTrendReport({ organizationId }),
    getEnrollmentMonthlyTrend(organizationId),
    getAttendanceMonthlyTrend(organizationId),
    getAssessmentMonthlyTrend(organizationId),
  ]);

  return {
    revenue: revenueReport.rows.map((r) => ({ month: r.month, invoiced: r.invoiced, collected: r.collected })),
    enrollments,
    attendance,
    assessments,
  };
}
