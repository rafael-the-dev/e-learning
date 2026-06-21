// =============================================================================
// STUDENT 360 — TYPES
// =============================================================================

export type HealthScoreLabel = "EXCELLENT" | "HEALTHY" | "NEEDS_ATTENTION" | "CRITICAL";

export type HealthScoreCategory = "academic" | "finance" | "attendance" | "enrollment" | "activity";

export interface HealthScoreReason {
  category: HealthScoreCategory;
  message: string;
  impact: number;
}

export interface HealthScoreBreakdown {
  academic: number;
  finance: number;
  attendance: number;
  enrollment: number;
  activity: number;
}

export interface StudentHealthScore {
  score: number;
  label: HealthScoreLabel;
  breakdown: HealthScoreBreakdown;
  topReasons: HealthScoreReason[];
  recommendedAction: string;
}

export interface HealthScoreInput {
  subjectStatuses: string[];
  levelStatuses: string[];
  outstandingBalance: number;
  hasOverdueInvoice: boolean;
  attendancePercentages: number[];
  hasBelowRequiredAttendance: boolean;
  enrollmentStatuses: string[];
  lastActivityAt: Date | null;
  now?: Date;
}

export const HEALTH_SCORE_LABELS: Record<HealthScoreLabel, string> = {
  EXCELLENT: "Excelente",
  HEALTHY: "Saudável",
  NEEDS_ATTENTION: "Requer Atenção",
  CRITICAL: "Crítico",
};

export type AlertSeverity = "CRITICAL" | "HIGH" | "MEDIUM";

export interface StudentAlert {
  id: string;
  severity: AlertSeverity;
  message: string;
  recommendedAction: string;
  href?: string;
}

export const ALERT_SEVERITY_LABELS: Record<AlertSeverity, string> = {
  CRITICAL: "Crítico",
  HIGH: "Alto",
  MEDIUM: "Médio",
};

export interface StudentAlertsInput {
  blockedLevelCount: number;
  recoveryRequiredCount: number;
  failedSubjectCount: number;
  outstandingBalance: number;
  overdueInvoiceCount: number;
  belowRequiredAttendanceSubjects: { subjectName: string; attendancePercentage: number }[];
  pendingRefundCount: number;
  pendingJustificationCount: number;
  documentCount: number;
  incompleteAssessmentCount: number;
  hasActiveEnrollment: boolean;
  hasAnyEnrollment: boolean;
}

export interface StudentSummaryCards {
  activeEnrollments: number;
  currentCourseName: string | null;
  academicStatusLabel: string;
  attendancePercentage: number | null;
  finalAverage: number | null;
  outstandingBalance: number;
  walletBalance: number;
  openAlertsCount: number;
}

export interface AttendanceRecordRow {
  id: string;
  sessionDate: Date;
  subjectName: string;
  classGroupName: string;
  status: string;
  teacherName: string | null;
  notes: string | null;
}

export type Student360TabKey =
  | "overview"
  | "enrollments"
  | "finance"
  | "attendance"
  | "grades"
  | "progress"
  | "documents"
  | "timeline";
