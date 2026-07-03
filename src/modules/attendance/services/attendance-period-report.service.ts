import { getDb } from "@/server/db";
import type { PrismaClientOrTx } from "@/server/db";
import {
  findPeriodSummariesForOverview,
  findPeriodAttendanceSummaryByEnrollment,
} from "@/modules/attendance/repositories/student-period-attendance-summary.repository";
import { findSubjectAttendanceSummaryByEnrollment } from "@/modules/attendance/repositories/student-subject-attendance-summary.repository";
import type {
  AttendancePeriodOverviewDto,
  StudentAttendanceDashboardDto,
  StudentPeriodAttendanceSummary,
} from "@/modules/attendance/types";

// =============================================================================
// ATTENDANCE PERIOD REPORT SERVICE — Attendance Engine Phase 4
//
// Read-only DTO builders for reports / dashboards (student, guardian, executive).
// These aggregate the persisted read-models; they NEVER write and NEVER touch
// academic data. No UI is added by this phase.
// =============================================================================

/**
 * Executive/admin overview for an academic year (optionally a term). Pass
 * `academicTermId: null` for the year-rollup rows, a term id for that term, or
 * omit for every row in the year.
 */
export async function findAttendanceOverviewByAcademicYear(
  organizationId: string,
  academicYearId: string,
  academicTermId?: string | null,
  client?: PrismaClientOrTx
): Promise<AttendancePeriodOverviewDto> {
  const rows = await findPeriodSummariesForOverview(organizationId, academicYearId, academicTermId, client);
  return buildOverview(rows);
}

/** Convenience wrapper for a specific term overview. */
export async function findAttendanceOverviewByAcademicTerm(
  organizationId: string,
  academicYearId: string,
  academicTermId: string,
  client?: PrismaClientOrTx
): Promise<AttendancePeriodOverviewDto> {
  return findAttendanceOverviewByAcademicYear(organizationId, academicYearId, academicTermId, client);
}

function buildOverview(rows: StudentPeriodAttendanceSummary[]): AttendancePeriodOverviewDto {
  const totalStudents = rows.length;
  let goodCount = 0;
  let atRiskCount = 0;
  let belowRequiredCount = 0;
  let totalSessions = 0;
  let totalAbsences = 0;
  let totalLate = 0;
  let totalExcused = 0;
  let totalRemote = 0;
  let pctSum = 0;
  let pctCount = 0;

  for (const r of rows) {
    if (r.status === "GOOD") goodCount++;
    else if (r.status === "AT_RISK") atRiskCount++;
    else if (r.status === "BELOW_REQUIRED") belowRequiredCount++;
    totalSessions += r.totalSessions;
    totalAbsences += r.absentCount;
    totalLate += r.lateCount;
    totalExcused += r.excusedCount;
    totalRemote += r.remoteCount;
    if (r.attendancePercentage != null) {
      pctSum += r.attendancePercentage;
      pctCount++;
    }
  }

  return {
    totalStudents,
    averageAttendancePercentage: pctCount > 0 ? Math.round((pctSum / pctCount) * 100) / 100 : null,
    belowRequiredCount,
    atRiskCount,
    goodCount,
    totalSessions,
    totalAbsences,
    totalLate,
    totalExcused,
    totalRemote,
  };
}

/**
 * Per-student dashboard DTO for one enrolment in an academic year (optionally a
 * term). Combines the period rollup with subject-summary + justification signals.
 * Read-only.
 */
export async function buildStudentAttendanceDashboard(
  organizationId: string,
  enrollmentId: string,
  academicYearId: string,
  academicTermId?: string | null,
  client?: PrismaClientOrTx
): Promise<StudentAttendanceDashboardDto> {
  const db = client ?? (await getDb());

  const periods = await findPeriodAttendanceSummaryByEnrollment(enrollmentId, organizationId, client);
  const period =
    periods.find(
      (p) => p.academicYearId === academicYearId && p.academicTermId === (academicTermId ?? null)
    ) ?? null;

  const subjectSummaries = await findSubjectAttendanceSummaryByEnrollment(enrollmentId, organizationId, client);
  const subjectsBelowMinimum = subjectSummaries.filter((s) => s.status === "BELOW_REQUIRED").length;

  // Last absence date (most recent ABSENT record for this enrolment in the year/term).
  const lastAbsence = await db.attendanceRecord.findFirst({
    where: {
      enrollmentId,
      organizationId,
      deletedAt: null,
      status: "ABSENT",
      attendanceSession: {
        deletedAt: null,
        academicYearId,
        ...(academicTermId ? { academicTermId } : {}),
      },
    },
    select: { attendanceSession: { select: { sessionDate: true } } },
    orderBy: { attendanceSession: { sessionDate: "desc" } },
  });

  const pendingJustifications = await db.attendanceJustification.count({
    where: {
      organizationId,
      status: "PENDING",
      deletedAt: null,
      attendanceRecord: { enrollmentId },
    },
  });

  return {
    currentAcademicYearId: academicYearId,
    currentAcademicTermId: academicTermId ?? null,
    overallAttendancePercentage: period?.attendancePercentage ?? null,
    totalSessions: period?.totalSessions ?? 0,
    presentCount: period?.presentCount ?? 0,
    absentCount: period?.absentCount ?? 0,
    lateCount: period?.lateCount ?? 0,
    excusedCount: period?.excusedCount ?? 0,
    remoteCount: period?.remoteCount ?? 0,
    subjectsBelowMinimum,
    periodStatus: period?.status ?? null,
    lastAbsenceDate: lastAbsence?.attendanceSession.sessionDate ?? null,
    pendingJustifications,
  };
}
