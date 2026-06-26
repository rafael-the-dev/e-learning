import type { TeacherPortalKpis, TeacherTodayOverview, TeacherTodaySession, StudentRiskRow } from "@/modules/teacher-portal/types";

export interface BuildKpisInput {
  classesTodayCount: number;
  activeClassGroupCount: number;
  distinctActiveStudentCount: number;
  attendancePendingCount: number;
  pendingGradingResultsCount: number;
  overdueOpenAssessmentCount: number;
  unreadNotificationCount: number;
  studentsAtRiskCount: number;
}

/** A CANCELLED session isn't actually happening today — excluded from every "aulas hoje" count/badge, though it still renders (labelled) in the Today Schedule list itself. */
export function countActiveSessionsToday(todaySchedule: TeacherTodaySession[]): number {
  return todaySchedule.filter((s) => s.status !== "CANCELLED").length;
}

export function buildTeacherPortalKpis(input: BuildKpisInput): TeacherPortalKpis {
  return {
    classesToday: input.classesTodayCount,
    activeClassGroupCount: input.activeClassGroupCount,
    studentCount: input.distinctActiveStudentCount,
    attendancePendingCount: input.attendancePendingCount,
    assessmentsToGradeCount: input.pendingGradingResultsCount,
    overdueAssessmentCount: input.overdueOpenAssessmentCount,
    unreadNotificationCount: input.unreadNotificationCount,
    studentsAtRiskCount: input.studentsAtRiskCount,
  };
}

/** Critical risk rows + overdue open assessments — each counted once, the "act now" surface for the Today Overview card. */
export function computeUrgentAlertCount(riskRows: StudentRiskRow[], overdueOpenAssessmentCount: number): number {
  const criticalCount = riskRows.filter((r) => r.severity === "CRITICAL").length;
  return criticalCount + overdueOpenAssessmentCount;
}

/** classesTodayCount is sourced from `kpis.classesToday` (not re-derived from todaySchedule.length) so the badge and the KPI card can never drift apart. */
export function buildTeacherTodayOverview(
  nextSession: TeacherTodaySession | null,
  kpis: TeacherPortalKpis,
  urgentAlertCount: number,
  now: Date = new Date()
): TeacherTodayOverview {
  return {
    today: now,
    classesTodayCount: kpis.classesToday,
    nextSession,
    attendancePendingCount: kpis.attendancePendingCount,
    assessmentsToGradeCount: kpis.assessmentsToGradeCount,
    urgentAlertCount,
  };
}
