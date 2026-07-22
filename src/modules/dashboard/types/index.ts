// =============================================================================
// EXECUTIVE DASHBOARD — TYPES
// =============================================================================

import type { RiskMetric } from "@/modules/students/services/risk-projection-readiness.service";

export type DashboardSeverity = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";

export const DASHBOARD_SEVERITY_LABELS: Record<DashboardSeverity, string> = {
  CRITICAL: "Crítico",
  HIGH: "Alto",
  MEDIUM: "Médio",
  LOW: "Baixo",
};

export type HealthTrend = "UP" | "DOWN" | "STABLE";

export type HealthRating = "EXCELLENT" | "HEALTHY" | "ATTENTION" | "CRITICAL";

export const HEALTH_RATING_LABELS: Record<HealthRating, string> = {
  EXCELLENT: "Excelente",
  HEALTHY: "Saudável",
  ATTENTION: "Atenção",
  CRITICAL: "Crítico",
};

// =============================================================================
// ORGANIZATION HEALTH SCORE
// =============================================================================

export interface HealthCategoryScore {
  score: number;
  weight: number;
}

export interface OrganizationHealthScore {
  score: number;
  rating: HealthRating;
  trend: HealthTrend;
  summary: string;
  financial: HealthCategoryScore;
  academic: HealthCategoryScore;
  attendance: HealthCategoryScore;
  operational: HealthCategoryScore;
}

// =============================================================================
// EXECUTIVE KPI GRID (8 cards)
// =============================================================================

export interface ExecutiveKpis {
  activeStudents: number;
  activeClassGroups: number;
  openAssessments: number;
  // F-M8: canonical risk KPI — UNAVAILABLE (never 0, never legacy) when the projection is
  // not ready for this org.
  studentsAtRisk: RiskMetric<number>;
  monthlyReceipts: number;
  outstandingBalance: number;
  overdueInvoices: number;
  walletLiability: number;
  currencySymbol: string;
}

// =============================================================================
// QUICK STATS
// =============================================================================

export interface QuickStats {
  approvalRate: number;
  collectionRate: number;
  occupancyRate: number;
  averageAttendance: number;
}

// =============================================================================
// EVOLUÇÃO ORGANIZACIONAL (4-tab trend card)
// =============================================================================

export interface RevenueTrendPoint {
  month: string;
  invoiced: number;
  collected: number;
}

export interface EnrollmentTrendPoint {
  month: string;
  count: number;
}

export interface AttendanceTrendPoint {
  month: string;
  attendancePct: number;
}

export interface AssessmentTrendPoint {
  month: string;
  graded: number;
}

export interface ExecutiveTrendData {
  revenue: RevenueTrendPoint[];
  enrollments: EnrollmentTrendPoint[];
  attendance: AttendanceTrendPoint[];
  assessments: AssessmentTrendPoint[];
}

// =============================================================================
// ACADEMIC WATCHLIST
// =============================================================================

export interface AcademicWatchlistItem {
  id: string;
  severity: DashboardSeverity;
  studentId: string | null;
  studentName: string | null;
  courseName: string | null;
  issue: string;
  link: string;
}

// =============================================================================
// FINANCIAL WATCHLIST
// =============================================================================

export interface FinancialWatchlistItem {
  severity: DashboardSeverity;
  reference: string;
  amount: number | null;
  issue: string;
  link: string;
}

// =============================================================================
// ACTIVITY FEED
// =============================================================================

export type ActivityFeedEventType =
  | "ENROLLMENT_CREATED"
  | "PAYMENT_CONFIRMED"
  | "INVOICE_CREATED"
  | "INVOICE_PAID"
  | "REFUND_COMPLETED"
  | "ASSESSMENT_RESULTS_PUBLISHED"
  | "SUBJECT_PASSED"
  | "SUBJECT_FAILED"
  | "LEVEL_PROMOTED";

export interface ActivityFeedItem {
  id: string;
  eventType: ActivityFeedEventType;
  title: string;
  studentName: string | null;
  actorName: string | null;
  occurredAt: Date;
}

// =============================================================================
// ALERTS (quick summary)
// =============================================================================

export interface DashboardAlert {
  id: string;
  message: string;
  severity: DashboardSeverity;
  link?: string;
}

// =============================================================================
// UPCOMING DEADLINES
// =============================================================================

export type UpcomingDeadlineType = "ASSESSMENT" | "INSTALLMENT" | "CLASS_GROUP_END" | "ACADEMIC_EVENT";

export interface UpcomingDeadline {
  id: string;
  type: UpcomingDeadlineType;
  title: string;
  date: Date;
  link: string;
}

// =============================================================================
// FULL DASHBOARD PAYLOAD
// =============================================================================

export interface ExecutiveDashboardData {
  health: OrganizationHealthScore;
  kpis: ExecutiveKpis;
  quickStats: QuickStats;
  trend: ExecutiveTrendData;
  academicWatchlist: AcademicWatchlistItem[];
  financialWatchlist: FinancialWatchlistItem[];
  activityFeed: ActivityFeedItem[];
  alerts: DashboardAlert[];
  deadlines: UpcomingDeadline[];
}
