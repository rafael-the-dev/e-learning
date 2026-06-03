export interface DashboardStats {
  totalStudents: number;
  activeStudents: number;
  activeTeachers: number;
  activeEnrollments: number;
  monthlyRevenue: number;
  pendingPaymentsCount: number;
  classesToday: number;
  practicalLessonsToday: number;
}

export interface FinancialOverview {
  revenueThisMonth: number;
  pendingAmount: number;
  overdueAmount: number;
  paymentsToday: number;
  currencySymbol: string;
}

export interface RecentActivityItem {
  id: string;
  entity: string;
  action: string;
  actorName: string | null;
  createdAt: Date;
  newValues: string | null;
}

export interface OperationalAlerts {
  overdueInvoicesCount: number;
  studentsWithoutEnrollmentCount: number;
  classesWithoutTeacherCount: number;
  practicalLessonsWithoutVehicleCount: number;
}

export interface DashboardData {
  stats: DashboardStats;
  financialOverview: FinancialOverview;
  recentActivity: RecentActivityItem[];
  operationalAlerts: OperationalAlerts;
}
