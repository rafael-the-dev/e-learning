// =============================================================================
// STUDENT 360 — TYPES
// =============================================================================

// Which source-module sections the viewer is authorized to see. When a capability
// is false, the Student 360 aggregator MUST NOT query, compute, or return that
// section — absence of the section represents absence of authorization, never a
// masked/nulled value fetched anyway. Extend this as other sections are gated.
//
// Finance is split into two independent capabilities so the RBAC policy is explicit
// rather than "whoever sees invoices also sees the wallet": billing (invoices /
// payments / dívida) ← INVOICES_VIEW; wallet (saldo / movimentos / reembolsos) ←
// WALLETS_VIEW. Each half is fetched/derived/returned only when its capability holds.
export interface Student360Capabilities {
  canViewInvoices: boolean;
  canViewWallet: boolean;
}

export type HealthScoreLabel = "EXCELLENT" | "HEALTHY" | "NEEDS_ATTENTION" | "CRITICAL";

export type HealthScoreCategory = "academic" | "finance" | "attendance" | "enrollment" | "activity";

export interface HealthScoreReason {
  category: HealthScoreCategory;
  message: string;
  impact: number;
}

export interface HealthScoreBreakdown {
  academic: number;
  // null → axis excluded from the score and its weight redistributed:
  //  - finance: viewer lacks finance permission
  //  - attendance: the student has no scheduled sessions (no attendance data)
  finance: number | null;
  attendance: number | null;
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

export interface HealthScoreFinanceInput {
  outstandingBalance: number;
  hasOverdueInvoice: boolean;
}

export interface HealthScoreInput {
  subjectStatuses: string[];
  levelStatuses: string[];
  // null = finance not authorized → excluded from the score (weight redistributed).
  finance: HealthScoreFinanceInput | null;
  // Canonical overall attendance % (H5); null when no scheduled sessions → axis excluded.
  attendancePercentage: number | null;
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
  // Each null = the corresponding capability is absent → that alert is never emitted.
  overdueInvoiceCount: number | null; // billing (INVOICES_VIEW)
  pendingRefundCount: number | null; // wallet (WALLETS_VIEW)
  belowRequiredAttendanceSubjects: { subjectName: string; attendancePercentage: number }[];
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
  // Canonical "Média das Disciplinas" from the shared academic read model (H2).
  subjectAverage: number | null;
  // Each null = the corresponding capability is absent → that KPI card is not rendered.
  outstandingBalance: number | null; // billing (INVOICES_VIEW)
  walletBalance: number | null; // wallet (WALLETS_VIEW)
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
