import { getDb } from "@/server/db";
import { getAcademicRiskCounts, getApprovalRate, getOrgAverageAttendance } from "@/modules/dashboard/repositories/dashboard-academic.repository";
import { countOverdueInvoices, getOrgCurrencySymbol } from "@/modules/dashboard/repositories/dashboard-financial.repository";
import { getClassGroupKPIs } from "@/modules/class-groups/services/class-group-metrics.service";
import { getPaymentsReportKPIs } from "@/modules/reports/finance/repositories/payments-report.repository";
import { getAccountsReceivableKPIs } from "@/modules/reports/finance/repositories/accounts-receivable.repository";
import { getWalletLiabilityKPIs } from "@/modules/reports/finance/repositories/wallet-liability.repository";
import { getRevenueTrendReport } from "@/modules/reports/finance/services/revenue-trend-report.service";
import type { ExecutiveKpis, QuickStats } from "@/modules/dashboard/types";

// =============================================================================
// EXECUTIVE KPI GRID (8 cards) — 4 academic, 4 financial. Per spec, this
// dashboard deliberately excludes administrative totals (course/teacher/user
// counts); every figure here is a risk or money signal.
// =============================================================================

export async function getExecutiveKpis(organizationId: string): Promise<ExecutiveKpis> {
  const db = await getDb();
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const [
    activeStudents,
    classGroupKpis,
    openAssessments,
    academicRisk,
    paymentsKpis,
    receivableKpis,
    walletKpis,
    overdueInvoices,
    currencySymbol,
  ] = await Promise.all([
    db.student.count({ where: { organizationId, status: "ACTIVE", deletedAt: null } }),
    getClassGroupKPIs(organizationId),
    db.assessment.count({ where: { organizationId, deletedAt: null, status: "OPEN" } }),
    getAcademicRiskCounts(organizationId),
    getPaymentsReportKPIs({ organizationId, dateFrom: startOfMonth.toISOString(), dateTo: now.toISOString() }),
    getAccountsReceivableKPIs({ organizationId }),
    getWalletLiabilityKPIs({ organizationId }),
    countOverdueInvoices(organizationId),
    getOrgCurrencySymbol(organizationId),
  ]);

  return {
    activeStudents,
    activeClassGroups: classGroupKpis.activeCount,
    openAssessments,
    studentsAtRisk: academicRisk.studentsAtRisk,
    monthlyReceipts: paymentsKpis.kpis.totalReceived,
    outstandingBalance: receivableKpis.totalReceivable,
    overdueInvoices,
    walletLiability: walletKpis.totalLiability,
    currencySymbol,
  };
}

// =============================================================================
// QUICK STATS
// =============================================================================

export async function getQuickStats(organizationId: string): Promise<QuickStats> {
  const [approvalRate, revenueTrend, classGroupKpis, averageAttendance] = await Promise.all([
    getApprovalRate(organizationId),
    getRevenueTrendReport({ organizationId }),
    getClassGroupKPIs(organizationId),
    getOrgAverageAttendance(organizationId),
  ]);

  return {
    approvalRate,
    collectionRate: revenueTrend.kpis.collectionRate,
    occupancyRate: classGroupKpis.occupancyRate,
    averageAttendance,
  };
}
