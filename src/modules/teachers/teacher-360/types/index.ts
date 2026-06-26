// =============================================================================
// TEACHER 360 — TYPES
// =============================================================================

export type HealthScoreLabel = "EXCELLENT" | "HEALTHY" | "NEEDS_ATTENTION" | "CRITICAL";

export type HealthScoreCategory = "execution" | "delivery" | "workload" | "quality";

export interface HealthScoreReason {
  category: HealthScoreCategory;
  message: string;
  impact: number;
}

export interface HealthScoreBreakdown {
  execution: number;
  delivery: number;
  workload: number;
  quality: number;
}

export interface TeacherHealthScore {
  score: number;
  label: HealthScoreLabel;
  breakdown: HealthScoreBreakdown;
  topReasons: HealthScoreReason[];
  recommendedAction: string;
}

export interface HealthScoreInput {
  completedSessionsLast30d: number;
  completedSessionsWithRecordsLast30d: number;
  overdueOpenAssessmentCount: number;
  pendingGradingOpenAssessmentCount: number;
  readyNotPublishedCount: number;
  activeClassGroupCount: number;
  passRate: number | null;
  avgStudentAttendance: number | null;
  now?: Date;
}

export const HEALTH_SCORE_LABELS: Record<HealthScoreLabel, string> = {
  EXCELLENT: "Excelente",
  HEALTHY: "Saudável",
  NEEDS_ATTENTION: "Atenção",
  CRITICAL: "Crítico",
};

export type AlertSeverity = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";

export interface TeacherAlert {
  id: string;
  severity: AlertSeverity;
  title: string;
  description: string;
  actionUrl?: string;
}

export const ALERT_SEVERITY_LABELS: Record<AlertSeverity, string> = {
  CRITICAL: "Crítico",
  HIGH: "Alto",
  MEDIUM: "Médio",
  LOW: "Baixo",
};

export interface TeacherAlertsInput {
  maxDaysOverdue: number;
  overdueOpenAssessmentCount: number;
  completedSessionsLast30d: number;
  activeClassGroupCount: number;
  pendingGradingResultsCount: number;
  subjectCount: number;
  readyNotPublishedCount: number;
  upcomingAssessmentCount: number;
  isActiveTeacher: boolean;
}

export interface TeacherSummaryCards {
  activeClassGroupCount: number;
  subjectCount: number;
  studentCount: number;
  weeklyHours: number;
  pendingAssessmentCount: number;
  completedAssessmentCount: number;
  passRate: number | null;
  avgStudentAttendance: number | null;
}

export type Teacher360TabKey =
  | "overview"
  | "schedule"
  | "classGroups"
  | "subjects"
  | "assessments"
  | "attendance"
  | "performance"
  | "timeline"
  | "documents";

export interface TeacherTimelineItem {
  id: string;
  eventType: string;
  title: string;
  description: string | null;
  occurredAt: Date;
}

export interface TeacherScheduleRow {
  id: string;
  dayOfWeek: string;
  startTime: string;
  endTime: string;
  classGroupId: string;
  classGroupName: string;
  courseName: string;
  courseLevelName: string | null;
  subjectNames: string[];
}
