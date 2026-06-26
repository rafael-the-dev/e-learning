import { getTeacherWithSubjects } from "@/modules/teachers/services/teacher.service";
import { getClassGroupsByOrganization } from "@/modules/class-groups/services/class-group.service";
import { findAssessmentsByOrganization } from "@/modules/assessments/repositories/assessment.repository";
import { getTeacherDocuments, getTeacherDocumentCount } from "@/modules/teacher-documents/services/teacher-document.service";
import {
  findTeacherCoreCounts,
  findTeacherAssessmentMetrics,
  findTeacherAttendanceExecution,
  findTaughtLevelSubjectIds,
  findTeacherQualityRaw,
  findTeacherWorkloadMetrics,
  findTeacherTimelineFeed,
  findTeacherScheduleRows,
  findTeacherAttendanceKPIs,
  findTeacherAttendanceMonthlyTrend,
  findTeacherAttendanceSessionRows,
  findTeacherSubjectPassRates,
  findTeacherGradeTrend,
  findOrganizationAveragePassRate,
  findTeacherSubjectsTabRows,
  type TeacherCoreCounts,
  type TeacherAssessmentMetrics,
  type TeacherAttendanceExecution,
  type TeacherQualityRaw,
  type TeacherWorkloadMetrics,
} from "@/modules/teachers/teacher-360/repositories/teacher-360.repository";
import type {
  HealthScoreInput,
  TeacherAlertsInput,
  TeacherSummaryCards,
  TeacherTimelineItem,
} from "@/modules/teachers/teacher-360/types";
import type { TeacherWithSubjects } from "@/modules/teachers/types";
import type { ListClassGroupsParams } from "@/modules/class-groups/repositories/class-group.repository";

export interface Teacher360Core {
  teacher: TeacherWithSubjects;
  counts: TeacherCoreCounts;
  assessmentMetrics: TeacherAssessmentMetrics;
  attendanceExecution: TeacherAttendanceExecution;
  qualityRaw: TeacherQualityRaw;
  workload: TeacherWorkloadMetrics;
  levelSubjectIds: string[];
  documentCount: number;
  recentTimeline: TeacherTimelineItem[];
}

export async function getTeacher360Core(
  teacherId: string,
  organizationId: string
): Promise<Teacher360Core> {
  const teacher = await getTeacherWithSubjects(teacherId, organizationId);

  const [counts, assessmentMetrics, attendanceExecution, workload, documentCount, timelineResult, levelSubjectIds] =
    await Promise.all([
      findTeacherCoreCounts(teacherId, organizationId),
      findTeacherAssessmentMetrics(teacherId, organizationId),
      findTeacherAttendanceExecution(teacherId, organizationId),
      findTeacherWorkloadMetrics(teacherId, organizationId),
      getTeacherDocumentCount(teacherId, organizationId),
      findTeacherTimelineFeed(teacherId, organizationId, 1, 10),
      findTaughtLevelSubjectIds(teacherId, organizationId),
    ]);

  const qualityRaw = await findTeacherQualityRaw(levelSubjectIds, organizationId);

  return {
    teacher,
    counts,
    assessmentMetrics,
    attendanceExecution,
    qualityRaw,
    workload,
    levelSubjectIds,
    documentCount,
    recentTimeline: timelineResult.items,
  };
}

function computePassRate(raw: TeacherQualityRaw): number | null {
  const denominator = raw.passedCount + raw.failedCount;
  return denominator > 0 ? Math.round((raw.passedCount / denominator) * 100) : null;
}

/**
 * Pure — `now` is a parameter (defaulted outside any component render path),
 * not an inline Date.now()/new Date() call inside the header component, so
 * Teacher360Header stays free of impure calls during render.
 */
export function computeYearsOfService(hireDate: Date | null, now: Date = new Date()): number | null {
  if (!hireDate) return null;
  return Math.max(0, Math.floor((now.getTime() - new Date(hireDate).getTime()) / (1000 * 60 * 60 * 24 * 365)));
}

export function buildHealthScoreInput(core: Teacher360Core): HealthScoreInput {
  return {
    completedSessionsLast30d: core.attendanceExecution.completedSessionsLast30d,
    completedSessionsWithRecordsLast30d: core.attendanceExecution.completedSessionsWithRecordsLast30d,
    overdueOpenAssessmentCount: core.assessmentMetrics.overdueOpenCount,
    pendingGradingOpenAssessmentCount: core.assessmentMetrics.pendingGradingOpenCount,
    readyNotPublishedCount: core.assessmentMetrics.readyNotPublishedCount,
    activeClassGroupCount: core.counts.activeClassGroupCount,
    passRate: computePassRate(core.qualityRaw),
    avgStudentAttendance: core.qualityRaw.avgAttendance,
  };
}

export function buildAlertsInput(core: Teacher360Core): TeacherAlertsInput {
  return {
    maxDaysOverdue: core.assessmentMetrics.maxDaysOverdue,
    overdueOpenAssessmentCount: core.assessmentMetrics.overdueOpenCount,
    completedSessionsLast30d: core.attendanceExecution.completedSessionsLast30d,
    activeClassGroupCount: core.counts.activeClassGroupCount,
    pendingGradingResultsCount: core.assessmentMetrics.pendingGradingResultsCount,
    subjectCount: core.counts.subjectCount,
    readyNotPublishedCount: core.assessmentMetrics.readyNotPublishedCount,
    upcomingAssessmentCount: core.assessmentMetrics.upcomingCount,
    isActiveTeacher: core.teacher.status === "ACTIVE",
  };
}

export function buildSummaryCards(core: Teacher360Core): TeacherSummaryCards {
  return {
    activeClassGroupCount: core.counts.activeClassGroupCount,
    subjectCount: core.counts.subjectCount,
    studentCount: core.workload.distinctActiveStudentCount,
    weeklyHours: core.workload.weeklyHours,
    pendingAssessmentCount: core.assessmentMetrics.openCount,
    completedAssessmentCount: core.assessmentMetrics.gradedCount,
    passRate: computePassRate(core.qualityRaw),
    avgStudentAttendance: core.qualityRaw.avgAttendance,
  };
}

// ── Tab data fetchers — only called for the active tab ────────────────────────

export async function getScheduleTabData(teacherId: string, organizationId: string) {
  return findTeacherScheduleRows(teacherId, organizationId);
}

export async function getSubjectsTabData(core: Teacher360Core, organizationId: string) {
  const subjectIds = core.teacher.teacherSubjects.map((ts) => ts.subjectId);
  return findTeacherSubjectsTabRows(core.teacher.id, organizationId, subjectIds);
}

export async function getClassGroupsTabData(
  teacherId: string,
  organizationId: string,
  page = 1,
  pageSize = 10
) {
  const params: ListClassGroupsParams = { teacherId, page, pageSize };
  return getClassGroupsByOrganization(organizationId, params);
}

export async function getAssessmentsTabData(
  teacherId: string,
  organizationId: string,
  page = 1,
  pageSize = 10
) {
  return findAssessmentsByOrganization(organizationId, { teacherId, page, pageSize });
}

export async function getAttendanceTabData(teacherId: string, organizationId: string, page = 1, pageSize = 10) {
  const [kpis, monthlyTrend, sessions] = await Promise.all([
    findTeacherAttendanceKPIs(teacherId, organizationId),
    findTeacherAttendanceMonthlyTrend(teacherId, organizationId),
    findTeacherAttendanceSessionRows(teacherId, organizationId, page, pageSize),
  ]);
  return { kpis, monthlyTrend, sessions };
}

export async function getPerformanceTabData(core: Teacher360Core, organizationId: string) {
  const [subjectPassRates, gradeTrend, organizationAveragePassRate] = await Promise.all([
    findTeacherSubjectPassRates(core.levelSubjectIds, organizationId),
    findTeacherGradeTrend(core.levelSubjectIds, organizationId),
    findOrganizationAveragePassRate(organizationId),
  ]);
  return { subjectPassRates, gradeTrend, organizationAveragePassRate };
}

export async function getTimelineTabData(
  teacherId: string,
  organizationId: string,
  page = 1,
  pageSize = 20
) {
  return findTeacherTimelineFeed(teacherId, organizationId, page, pageSize);
}

export async function getDocumentsTabData(teacherId: string, organizationId: string) {
  return getTeacherDocuments(teacherId, organizationId);
}
