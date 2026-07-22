import type { Notification } from "@/modules/notifications/types";
import type { RiskMetric } from "@/modules/students/services/risk-projection-readiness.service";

// =============================================================================
// TEACHER PORTAL — TYPES
// Operational workspace for the logged-in teacher. Distinct from Teacher 360
// (the profile) — see docs/teacher-portal.md.
// =============================================================================

export interface TeacherPortalKpis {
  classesToday: number;
  activeClassGroupCount: number;
  studentCount: number;
  attendancePendingCount: number;
  assessmentsToGradeCount: number;
  overdueAssessmentCount: number;
  unreadNotificationCount: number;
  studentsAtRiskCount: number;
}

export interface TeacherTodaySession {
  id: string;
  startTime: string;
  endTime: string;
  classGroupId: string;
  classGroupName: string;
  subjectName: string;
  classroomName: string | null;
  status: string;
}

export interface TeacherTodayOverview {
  today: Date;
  classesTodayCount: number;
  nextSession: TeacherTodaySession | null;
  attendancePendingCount: number;
  assessmentsToGradeCount: number;
  urgentAlertCount: number;
}

export interface AttendancePendingRow {
  sessionId: string;
  classGroupId: string;
  classGroupName: string;
  subjectName: string;
  sessionDate: Date;
  startTime: string;
  missingCount: number;
}

export interface AssessmentToGradeRow {
  assessmentId: string;
  title: string;
  classGroupName: string;
  subjectName: string;
  submittedCount: number;
  pendingCount: number;
  dueDate: Date;
}

export interface ResultToPublishRow {
  assessmentId: string;
  title: string;
  classGroupName: string;
  subjectName: string;
  readyCount: number;
}

export interface TeacherPendingWork {
  attendancePending: AttendancePendingRow[];
  assessmentsToGrade: AssessmentToGradeRow[];
  resultsToPublish: ResultToPublishRow[];
}

export interface TeacherClassGroupRow {
  id: string;
  name: string;
  courseName: string;
  courseLevelName: string | null;
  studentCount: number;
  capacity: number;
  occupancyPercent: number;
  nextClassLabel: string | null;
  attendanceRate: number | null;
}

export type RiskSeverity = "CRITICAL" | "HIGH" | "MEDIUM";

export type RiskType =
  | "BLOCKED"
  | "RECOVERY_REQUIRED"
  | "FAILED_SUBJECT"
  | "LOW_ATTENDANCE"
  | "ATTENDANCE_TREND"
  | "MISSING_ASSESSMENTS";

export const RISK_TYPE_LABELS: Record<RiskType, string> = {
  BLOCKED: "Progresso bloqueado",
  RECOVERY_REQUIRED: "Recuperação necessária",
  FAILED_SUBJECT: "Disciplina reprovada",
  LOW_ATTENDANCE: "Presença abaixo do mínimo",
  ATTENDANCE_TREND: "Tendência de presença em queda",
  MISSING_ASSESSMENTS: "Avaliações em falta",
};

export const RISK_SEVERITY_LABELS: Record<RiskSeverity, string> = {
  CRITICAL: "Crítico",
  HIGH: "Alto",
  MEDIUM: "Médio",
};

export interface StudentRiskRow {
  studentId: string;
  studentName: string;
  classGroupName: string;
  riskType: RiskType;
  severity: RiskSeverity;
  detail: string;
}

export type TeacherDeadlineType = "ASSESSMENT" | "CLASS_GROUP_END" | "ACADEMIC_EVENT";

export interface TeacherDeadline {
  id: string;
  type: TeacherDeadlineType;
  title: string;
  date: Date;
  link: string;
}

export interface TeacherPortalData {
  teacherId: string;
  teacherName: string;
  kpis: TeacherPortalKpis;
  todayOverview: TeacherTodayOverview;
  todaySchedule: TeacherTodaySession[];
  pendingWork: TeacherPendingWork;
  myClasses: TeacherClassGroupRow[];
  myClassesTotal: number;
  riskList: StudentRiskRow[];
  // F-M8: availability of the canonical attendance-risk dimension in the risk list.
  riskAttendance: RiskMetric<number>;
  notifications: Notification[];
  unreadNotificationCount: number;
  deadlines: TeacherDeadline[];
}
