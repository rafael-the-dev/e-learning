import type {
  AttendanceCalcRecordInput,
  AttendanceCalcSessionInput,
  AttendanceSummaryComputation,
  EffectiveAttendancePolicy,
  StudentSubjectAttendanceSummaryStatus,
} from "@/modules/attendance/types";
import { weighAttendanceRecord } from "@/modules/attendance/services/attendance-weighting";

// =============================================================================
// ATTENDANCE CALCULATION ENGINE (pure, no I/O) — Attendance Engine Phase 3
//
// Computes a per-enrolment+subject attendance summary from COMPLETED sessions and
// the student's marks, interpreted through the effective AttendancePolicy.
//
//   attendancePercentage = totalPresentMinutes / totalScheduledMinutes * 100
//   totalScheduledMinutes = Σ duration of the counted (COMPLETED) sessions
//
// Weighting (present-equivalent minutes → the numerator):
//   PRESENT          → full duration
//   REMOTE           → full duration IF policy.countRemoteAsPresent, else 0
//   LATE             → partial (minutesAttended, else duration − lateMinutes) IF
//                      policy.countLateAsPartial; otherwise counted full present
//   ABSENT           → 0
//   EXCUSED / approved-justification effect → full duration IF
//                      policy.countExcusedAsPresent, else 0 (tracked separately)
//
// Parity with the legacy on-read calculator holds for the PERCENTAGE under the
// default policy (REMOTE full, LATE partial, EXCUSED 0). Intentional differences:
//   • empty scheduled minutes → percentage `null` + NOT_STARTED (legacy: 0 + OK)
//   • approved justifications are honoured as an excused effect (legacy ignored them)
//   • status vocabulary is NOT_STARTED/SUFFICIENT/BELOW_REQUIRED (legacy OK/AT_RISK/…)
// See docs/attendance-engine.md → Phase 3.
// =============================================================================

function roundPct(value: number): number {
  return Math.round(value * 100) / 100;
}

export function calculateAttendanceSummary(input: {
  sessions: AttendanceCalcSessionInput[];
  records: AttendanceCalcRecordInput[];
  policy: EffectiveAttendancePolicy;
  minimumAttendancePercentage: number | null;
}): AttendanceSummaryComputation {
  const { sessions, records, policy, minimumAttendancePercentage } = input;

  const sessionMinutes = new Map(sessions.map((s) => [s.id, s.durationMinutes]));
  const totalScheduledMinutes = sessions.reduce((sum, s) => sum + s.durationMinutes, 0);

  let totalPresentMinutes = 0;
  let totalAbsentMinutes = 0;
  let totalLateMinutes = 0;
  let totalExcusedMinutes = 0;
  let presentCount = 0;
  let absentCount = 0;
  let lateCount = 0;
  let excusedCount = 0;
  let remoteCount = 0;

  for (const rec of records) {
    const dur = sessionMinutes.get(rec.attendanceSessionId);
    if (dur === undefined) continue; // record for a non-counted session — ignored

    const w = weighAttendanceRecord(rec, dur, policy);
    totalPresentMinutes += w.presentMinutes;
    totalAbsentMinutes += w.absentMinutes;
    totalLateMinutes += w.lateMinutesLost;
    totalExcusedMinutes += w.excusedMinutes;

    if (w.isExcusedEffect) {
      excusedCount++;
    } else {
      switch (rec.status) {
        case "PRESENT":
          presentCount++;
          break;
        case "REMOTE":
          remoteCount++;
          break;
        case "LATE":
          lateCount++;
          break;
        case "ABSENT":
        default:
          absentCount++;
          break;
      }
    }
  }

  const attendancePercentage =
    totalScheduledMinutes > 0 ? roundPct((totalPresentMinutes / totalScheduledMinutes) * 100) : null;

  let status: StudentSubjectAttendanceSummaryStatus;
  if (totalScheduledMinutes === 0) {
    status = "NOT_STARTED";
  } else if (minimumAttendancePercentage == null) {
    // A subject with no attendance requirement can never be "below required".
    status = "SUFFICIENT";
  } else {
    status =
      (attendancePercentage as number) >= minimumAttendancePercentage ? "SUFFICIENT" : "BELOW_REQUIRED";
  }

  return {
    totalSessions: sessions.length,
    totalScheduledMinutes,
    totalPresentMinutes,
    totalAbsentMinutes,
    totalLateMinutes,
    totalExcusedMinutes,
    attendancePercentage,
    status,
    presentCount,
    absentCount,
    lateCount,
    excusedCount,
    remoteCount,
  };
}
