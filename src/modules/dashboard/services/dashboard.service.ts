import type { DashboardData, DashboardStats, FinancialOverview, RecentActivityItem, OperationalAlerts } from "@/modules/dashboard/types";
import {
  getStudentCounts,
  getActiveTeacherCount,
  getActiveEnrollmentCount,
  getMonthlyRevenue,
  getPendingPaymentsCount,
  getClassesToday,
  getPracticalLessonsToday,
  getFinancialSummary,
  getRecentActivity,
  getOperationalAlertCounts,
  getOrgCurrencySymbol,
} from "@/modules/dashboard/repositories/dashboard.repository";

export async function getDashboardData(organizationId: string): Promise<DashboardData> {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startOfNextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const dayOfWeek = now.getDay();

  const [
    studentCounts,
    activeTeachers,
    activeEnrollments,
    monthlyRevenue,
    pendingPaymentsCount,
    classesToday,
    practicalLessonsToday,
    financialSummary,
    recentActivityLogs,
    alertCounts,
    currencySymbol,
  ] = await Promise.all([
    getStudentCounts(organizationId),
    getActiveTeacherCount(organizationId),
    getActiveEnrollmentCount(organizationId),
    getMonthlyRevenue(organizationId, startOfMonth, startOfNextMonth),
    getPendingPaymentsCount(organizationId),
    getClassesToday(organizationId, dayOfWeek),
    getPracticalLessonsToday(organizationId, startOfToday, endOfToday),
    getFinancialSummary(organizationId, startOfMonth, startOfNextMonth, startOfToday, endOfToday),
    getRecentActivity(organizationId),
    getOperationalAlertCounts(organizationId, startOfToday),
    getOrgCurrencySymbol(organizationId),
  ]);

  const stats: DashboardStats = {
    totalStudents: studentCounts.total,
    activeStudents: studentCounts.active,
    activeTeachers,
    activeEnrollments,
    monthlyRevenue,
    pendingPaymentsCount,
    classesToday,
    practicalLessonsToday,
  };

  const financialOverview: FinancialOverview = {
    revenueThisMonth: monthlyRevenue,
    pendingAmount: financialSummary.pendingTotal - financialSummary.pendingPaidAmount,
    overdueAmount: financialSummary.overdueTotal - financialSummary.overduePaidAmount,
    paymentsToday: financialSummary.paymentsToday,
    currencySymbol,
  };

  const recentActivity: RecentActivityItem[] = recentActivityLogs.map((log) => ({
    id: log.id,
    entity: log.entity,
    action: log.action,
    actorName: log.actor?.name ?? null,
    createdAt: log.createdAt,
    newValues: log.newValues,
  }));

  const operationalAlerts: OperationalAlerts = alertCounts;

  return { stats, financialOverview, recentActivity, operationalAlerts };
}
