import type {
  PeriodCalcRecord,
  StudentPeriodAttendanceSummaryComputation,
  StudentPeriodAttendanceSummaryStatus,
} from "@/modules/attendance/types";
import { weighAttendanceRecord } from "@/modules/attendance/services/attendance-weighting";

// =============================================================================
// PERIOD ATTENDANCE CALCULATION ENGINE (pure) — Attendance Engine Phase 4
//
// Aggregates a student's COMPLETED-session attendance across MANY levelSubjects
// into one year/term reporting summary. Minutes are weighted PER record using
// that record's levelSubject policy (sessions may span subjects with different
// policy overrides), then totalled.
//
// Reporting-only: this NEVER drives academic progression. The subject summary
// (Phase 3) remains the academic source.
//
// Count semantics (reporting overlay — counts may overlap, they do NOT partition):
//   PRESENT/ABSENT/LATE/REMOTE → the matching raw count +1
//   EXCUSED (transitional)     → excusedCount +1
//   ABSENT/LATE WITH an approved justification → excusedCount +1 IN ADDITION to
//     its raw absent/late count (the original status count is preserved).
//
// Status uses a WEIGHTED baseline (Σ subjectMin × subjectScheduledMinutes ÷
// Σ scheduledMinutes over subjects that HAVE a threshold):
//   GOOD           pct ≥ baseline, or no baseline available, or pct is null
//   AT_RISK        baseline − buffer ≤ pct < baseline
//   BELOW_REQUIRED pct < baseline − buffer
// =============================================================================

function roundPct(value: number): number {
  return Math.round(value * 100) / 100;
}

export function calculatePeriodAttendanceSummary(input: {
  records: PeriodCalcRecord[];
  /** At-risk buffer (percentage points) from the org default policy, else fallback. */
  atRiskBufferPercentage: number;
}): StudentPeriodAttendanceSummaryComputation {
  const { records, atRiskBufferPercentage } = input;

  let totalScheduledMinutes = 0;
  let totalPresentMinutes = 0;
  let presentCount = 0;
  let absentCount = 0;
  let lateCount = 0;
  let excusedCount = 0;
  let remoteCount = 0;

  // Per-subject accumulation for the weighted baseline.
  const subjectMinutes = new Map<string, number>();
  const subjectThreshold = new Map<string, number | null>();

  for (const rec of records) {
    const w = weighAttendanceRecord(rec, rec.durationMinutes, rec.policy);
    totalScheduledMinutes += rec.durationMinutes;
    totalPresentMinutes += w.presentMinutes;

    // Raw status counts (evidence), independent of policy interpretation.
    switch (rec.status) {
      case "PRESENT":
        presentCount++;
        break;
      case "ABSENT":
        absentCount++;
        break;
      case "LATE":
        lateCount++;
        break;
      case "REMOTE":
        remoteCount++;
        break;
      case "EXCUSED":
        excusedCount++;
        break;
    }
    // Excused overlay for justified absences/latenesses (does not remove the raw count).
    if ((rec.status === "ABSENT" || rec.status === "LATE") && rec.hasApprovedJustification) {
      excusedCount++;
    }

    subjectMinutes.set(rec.levelSubjectId, (subjectMinutes.get(rec.levelSubjectId) ?? 0) + rec.durationMinutes);
    if (!subjectThreshold.has(rec.levelSubjectId)) {
      subjectThreshold.set(rec.levelSubjectId, rec.minimumAttendancePercentage);
    }
  }

  const totalSessions = records.length;

  const attendancePercentage =
    totalScheduledMinutes > 0 ? roundPct((totalPresentMinutes / totalScheduledMinutes) * 100) : null;

  // Weighted baseline across subjects that declare a threshold.
  let weightNum = 0;
  let weightDen = 0;
  for (const [lsId, minutes] of subjectMinutes) {
    const threshold = subjectThreshold.get(lsId);
    if (threshold != null && minutes > 0) {
      weightNum += threshold * minutes;
      weightDen += minutes;
    }
  }
  const baseline = weightDen > 0 ? roundPct(weightNum / weightDen) : null;

  let status: StudentPeriodAttendanceSummaryStatus;
  if (attendancePercentage == null || baseline == null) {
    // No sessions yet, or no subject threshold to judge against → GOOD (advisory).
    status = "GOOD";
  } else if (attendancePercentage >= baseline) {
    status = "GOOD";
  } else if (attendancePercentage >= baseline - atRiskBufferPercentage) {
    status = "AT_RISK";
  } else {
    status = "BELOW_REQUIRED";
  }

  return {
    totalSessions,
    presentCount,
    absentCount,
    lateCount,
    excusedCount,
    remoteCount,
    totalScheduledMinutes,
    totalPresentMinutes,
    attendancePercentage,
    status,
    baseline,
  };
}
