import { getDb } from "@/server/db";
import {
  findCompletedSessionsForLevelSubject,
  findAttendanceSessionsByClassGroup,
} from "@/modules/attendance/repositories/attendance-session.repository";
import {
  findStudentRecordsForLevelSubject,
} from "@/modules/attendance/repositories/attendance-record.repository";
import type { StudentSubjectAttendance } from "@/modules/attendance/types";

// =============================================================================
// ATTENDANCE CALCULATOR SERVICE
//
// Formula:
//   attendancePercentage =
//     (totalMinutesAttended / totalCompletedSessionMinutesForLevelSubject) * 100
//
// Weights:
//   PRESENT  → full durationMinutes
//   REMOTE   → full durationMinutes
//   LATE     → durationMinutes - lateMinutes (or minutesAttended if provided)
//   EXCUSED  → counts 0 for percentage; tracked separately
//   ABSENT   → counts 0
//
// At-risk threshold: minimumAttendancePercentage + 5 (configurable)
// =============================================================================

const AT_RISK_BUFFER = 5; // percentage points above minimum

function calculateMinutesAttended(
  status: string,
  sessionMinutes: number,
  lateMinutes: number | null,
  minutesAttended: number
): number {
  switch (status) {
    case "PRESENT":
    case "REMOTE":
      return sessionMinutes;
    case "LATE":
      if (minutesAttended > 0) return minutesAttended;
      if (lateMinutes != null) return Math.max(0, sessionMinutes - lateMinutes);
      return sessionMinutes;
    case "ABSENT":
    case "EXCUSED":
    default:
      return 0;
  }
}

export async function calculateStudentSubjectAttendance(
  studentId: string,
  enrollmentId: string,
  classGroupId: string,
  levelSubjectId: string,
  organizationId: string
): Promise<StudentSubjectAttendance> {
  const db = await getDb();

  const [sessions, levelSubject] = await Promise.all([
    findCompletedSessionsForLevelSubject(classGroupId, levelSubjectId, organizationId),
    db.levelSubject.findFirst({
      where: { id: levelSubjectId, organizationId },
      select: {
        id: true,
        subjectId: true,
        minimumAttendancePercentage: true,
        subject: { select: { id: true, name: true } },
      },
    }),
  ]);

  if (!levelSubject) {
    throw new Error(`LevelSubject ${levelSubjectId} not found`);
  }

  const sessionIds = sessions.map((s) => s.id);
  const records = await findStudentRecordsForLevelSubject(studentId, sessionIds, organizationId);

  const totalSessionMinutes = sessions.reduce((sum, s) => sum + s.durationMinutes, 0);

  let totalMinutesAttended = 0;
  let totalExcusedMinutes = 0;
  let presentCount = 0;
  let absentCount = 0;
  let lateCount = 0;
  let excusedCount = 0;
  let remoteCount = 0;

  const sessionMinutesMap = new Map(sessions.map((s) => [s.id, s.durationMinutes]));

  // Build a map of sessionId → record for quick lookup (one record per student per session)
  for (const record of records) {
    const sessionMinutes = 0; // not available here; records don't carry sessionId in this query
    switch (record.status) {
      case "PRESENT":
        presentCount++;
        break;
      case "REMOTE":
        remoteCount++;
        break;
      case "LATE":
        lateCount++;
        break;
      case "EXCUSED":
        excusedCount++;
        break;
      case "ABSENT":
        absentCount++;
        break;
    }
  }

  // Re-calculate minutes properly using session durations
  const recordsWithSession = await db.attendanceRecord.findMany({
    where: {
      studentId,
      attendanceSessionId: { in: sessionIds },
      organizationId,
      deletedAt: null,
    },
    select: {
      status: true,
      minutesAttended: true,
      lateMinutes: true,
      attendanceSessionId: true,
    },
  });

  // Reset counts for accurate calculation
  presentCount = 0;
  absentCount = 0;
  lateCount = 0;
  excusedCount = 0;
  remoteCount = 0;

  for (const rec of recordsWithSession) {
    const sessionMin = sessionMinutesMap.get(rec.attendanceSessionId) ?? 0;
    const attended = calculateMinutesAttended(
      rec.status,
      sessionMin,
      rec.lateMinutes,
      rec.minutesAttended
    );
    totalMinutesAttended += attended;
    if (rec.status === "EXCUSED") totalExcusedMinutes += sessionMin;

    switch (rec.status) {
      case "PRESENT": presentCount++; break;
      case "REMOTE": remoteCount++; break;
      case "LATE": lateCount++; break;
      case "EXCUSED": excusedCount++; break;
      case "ABSENT": absentCount++; break;
    }
  }

  const attendancePercentage =
    totalSessionMinutes > 0
      ? Math.round((totalMinutesAttended / totalSessionMinutes) * 100 * 100) / 100
      : 0;

  const minPct = levelSubject.minimumAttendancePercentage
    ? Number(levelSubject.minimumAttendancePercentage)
    : null;

  let status: "OK" | "AT_RISK" | "BELOW_REQUIRED" = "OK";
  if (minPct !== null) {
    if (attendancePercentage < minPct) {
      status = "BELOW_REQUIRED";
    } else if (attendancePercentage < minPct + AT_RISK_BUFFER) {
      status = "AT_RISK";
    }
  }

  return {
    studentId,
    enrollmentId,
    levelSubjectId,
    subjectId: levelSubject.subjectId,
    subjectName: levelSubject.subject?.name ?? "",
    totalCompletedSessionMinutes: totalSessionMinutes,
    totalMinutesAttended,
    totalExcusedMinutes,
    attendancePercentage,
    minimumAttendancePercentage: minPct,
    status,
    presentCount,
    absentCount,
    lateCount,
    excusedCount,
    remoteCount,
    totalSessions: sessions.length,
  };
}

export async function calculateEnrollmentAttendanceSummary(
  studentId: string,
  enrollmentId: string,
  classGroupId: string,
  organizationId: string
): Promise<StudentSubjectAttendance[]> {
  const db = await getDb();

  const enrollment = await db.enrollment.findFirst({
    where: { id: enrollmentId, organizationId },
    select: { courseLevelId: true, classGroupId: true },
  });
  if (!enrollment?.courseLevelId) return [];

  const levelSubjects = await db.levelSubject.findMany({
    where: {
      courseLevelId: enrollment.courseLevelId,
      organizationId,
      status: "ACTIVE",
      deletedAt: null,
    },
    select: { id: true },
  });

  const results = await Promise.all(
    levelSubjects.map((ls) =>
      calculateStudentSubjectAttendance(
        studentId,
        enrollmentId,
        classGroupId,
        ls.id,
        organizationId
      ).catch(() => null)
    )
  );

  return results.filter((r): r is StudentSubjectAttendance => r !== null);
}

export async function checkMinimumAttendanceRequirement(
  studentId: string,
  enrollmentId: string,
  classGroupId: string,
  levelSubjectId: string,
  organizationId: string
): Promise<{ meetsRequirement: boolean; percentage: number; minimum: number | null }> {
  const summary = await calculateStudentSubjectAttendance(
    studentId,
    enrollmentId,
    classGroupId,
    levelSubjectId,
    organizationId
  );
  return {
    meetsRequirement: summary.status !== "BELOW_REQUIRED",
    percentage: summary.attendancePercentage,
    minimum: summary.minimumAttendancePercentage,
  };
}
