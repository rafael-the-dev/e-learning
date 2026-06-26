import {
  findTeacherCoreCounts,
  findTeacherAssessmentMetrics,
  findTeacherWorkloadMetrics,
  findTeacherScheduleRows,
} from "@/modules/teachers/teacher-360/repositories/teacher-360.repository";
import { getClassGroupsByOrganization } from "@/modules/class-groups/services/class-group.service";
import { getUnreadCount, getLatestForUser } from "@/modules/notifications/services/notification.service";
import {
  countTeacherAttendancePending,
  countTeacherPendingGradingResults,
  findTeacherClassGroupAttendanceRates,
} from "@/modules/teacher-portal/repositories/teacher-portal.repository";
import { getTeacherTodaySchedule, resolveNextSession, buildNextClassLabelsByGroup } from "@/modules/teacher-portal/services/teacher-portal-schedule.service";
import { getTeacherPendingWork } from "@/modules/teacher-portal/services/teacher-portal-pending-work.service";
import { getTeacherStudentRiskList } from "@/modules/teacher-portal/services/teacher-portal-risk.service";
import { getTeacherUpcomingDeadlines } from "@/modules/teacher-portal/services/teacher-portal-deadlines.service";
import {
  buildTeacherPortalKpis,
  buildTeacherTodayOverview,
  computeUrgentAlertCount,
  countActiveSessionsToday,
} from "@/modules/teacher-portal/services/teacher-portal-kpis.service";
import type { TeacherPortalData, TeacherClassGroupRow } from "@/modules/teacher-portal/types";

const MY_CLASSES_PAGE_SIZE = 8;

export type TeacherPortalBlockedReason = "NOT_LINKED" | "INACTIVE";

/** Pure gate — no Teacher record linked, or linked to a non-ACTIVE one (SUSPENDED/INACTIVE). */
export function resolveTeacherPortalBlockedReason(
  teacher: { status: string } | null
): TeacherPortalBlockedReason | null {
  if (!teacher) return "NOT_LINKED";
  if (teacher.status !== "ACTIVE") return "INACTIVE";
  return null;
}

export async function getTeacherPortalData(
  teacherId: string,
  teacherName: string,
  userId: string,
  organizationId: string
): Promise<TeacherPortalData> {
  const now = new Date();

  // Phase 1 — independently fetchable counts/metrics, plus everything that
  // only needs teacherId+organizationId (no dependency on phase 1's results).
  const [
    counts,
    assessmentMetrics,
    workload,
    todaySchedule,
    pendingWork,
    myClassesResult,
    attendanceRatesByGroup,
    scheduleRows,
    attendancePendingCount,
    pendingGradingResultsCount,
    unreadNotificationCount,
    latestNotifications,
    deadlines,
  ] = await Promise.all([
    findTeacherCoreCounts(teacherId, organizationId),
    findTeacherAssessmentMetrics(teacherId, organizationId, now),
    findTeacherWorkloadMetrics(teacherId, organizationId),
    getTeacherTodaySchedule(teacherId, organizationId, now),
    getTeacherPendingWork(teacherId, organizationId),
    getClassGroupsByOrganization(organizationId, { teacherId, status: "ACTIVE", page: 1, pageSize: MY_CLASSES_PAGE_SIZE }),
    findTeacherClassGroupAttendanceRates(teacherId, organizationId),
    findTeacherScheduleRows(teacherId, organizationId),
    countTeacherAttendancePending(teacherId, organizationId),
    countTeacherPendingGradingResults(teacherId, organizationId),
    getUnreadCount(organizationId, userId),
    getLatestForUser(organizationId, userId, 8),
    getTeacherUpcomingDeadlines(teacherId, organizationId),
  ]);

  // Phase 2 — depends on workload.activeClassGroupIds from phase 1.
  const riskList = await getTeacherStudentRiskList(teacherId, organizationId, workload.activeClassGroupIds);

  const kpis = buildTeacherPortalKpis({
    classesTodayCount: countActiveSessionsToday(todaySchedule),
    activeClassGroupCount: counts.activeClassGroupCount,
    distinctActiveStudentCount: workload.distinctActiveStudentCount,
    attendancePendingCount,
    pendingGradingResultsCount,
    overdueOpenAssessmentCount: assessmentMetrics.overdueOpenCount,
    unreadNotificationCount,
    studentsAtRiskCount: riskList.distinctStudentCount,
  });

  const urgentAlertCount = computeUrgentAlertCount(riskList.rows, assessmentMetrics.overdueOpenCount);
  const todayOverview = buildTeacherTodayOverview(resolveNextSession(todaySchedule, now), kpis, urgentAlertCount, now);

  const nextClassLabels = buildNextClassLabelsByGroup(scheduleRows, now);
  const myClasses: TeacherClassGroupRow[] = myClassesResult.data.map((cg) => ({
    id: cg.id,
    name: cg.name,
    courseName: cg.courseName ?? "—",
    courseLevelName: cg.courseLevelName ?? null,
    studentCount: cg.currentCount,
    capacity: cg.capacity,
    occupancyPercent: cg.capacity > 0 ? Math.round((cg.currentCount / cg.capacity) * 100) : 0,
    nextClassLabel: nextClassLabels.get(cg.id) ?? null,
    attendanceRate: attendanceRatesByGroup.get(cg.id) ?? null,
  }));

  return {
    teacherId,
    teacherName,
    kpis,
    todayOverview,
    todaySchedule,
    pendingWork,
    myClasses,
    myClassesTotal: counts.activeClassGroupCount,
    riskList: riskList.rows,
    notifications: latestNotifications,
    unreadNotificationCount,
    deadlines,
  };
}
