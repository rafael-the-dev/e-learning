import { describe, it, expect } from "vitest";
import {
  deriveSubjectAttendanceDisplayStatus,
  toSubjectAttendanceView,
  DEFAULT_DISPLAY_AT_RISK_BUFFER,
} from "../attendance-read-model.service";
import type { StudentSubjectAttendanceSummary } from "@/modules/attendance/types";

// =============================================================================
// Attendance read-model — pure derivation tests (Fix C1).
//
// These cover the source-of-truth mapping from a persisted
// StudentSubjectAttendanceSummary (or its ABSENCE) to the display view, WITHOUT
// any database. A missing summary must surface as NOT_STARTED / null /
// needsRecalculation — never as fabricated 0% / OK.
// =============================================================================

const ORG = "org-A";

function makeSummary(over: Partial<StudentSubjectAttendanceSummary> = {}): StudentSubjectAttendanceSummary {
  return {
    id: "sum-1",
    organizationId: ORG,
    enrollmentId: "enr-1",
    studentId: "stu-1",
    levelSubjectId: "ls-1",
    attendancePolicyId: null,
    totalSessions: 10,
    totalScheduledMinutes: 600,
    totalPresentMinutes: 540,
    totalAbsentMinutes: 60,
    totalLateMinutes: 0,
    totalExcusedMinutes: 0,
    attendancePercentage: 90,
    status: "SUFFICIENT",
    calculatedAt: new Date("2026-07-03"),
    ...over,
  };
}

const meta = {
  levelSubjectId: "ls-1",
  subjectId: "subj-1",
  subjectName: "Matemática",
  minimumAttendancePercentage: 75,
};

describe("deriveSubjectAttendanceDisplayStatus", () => {
  it("null percentage → NOT_STARTED", () => {
    expect(deriveSubjectAttendanceDisplayStatus(null, 75)).toBe("NOT_STARTED");
  });

  it("null threshold → OK (no requirement to fall below)", () => {
    expect(deriveSubjectAttendanceDisplayStatus(40, null)).toBe("OK");
  });

  it("below the minimum → BELOW_REQUIRED", () => {
    expect(deriveSubjectAttendanceDisplayStatus(70, 75)).toBe("BELOW_REQUIRED");
  });

  it("within the buffer of the minimum → AT_RISK", () => {
    expect(deriveSubjectAttendanceDisplayStatus(78, 75, 5)).toBe("AT_RISK");
  });

  it("comfortably above minimum + buffer → OK", () => {
    expect(deriveSubjectAttendanceDisplayStatus(95, 75, 5)).toBe("OK");
  });

  it("defaults to the standard display buffer", () => {
    // 75 + DEFAULT (5) = 80 → 79 is at-risk, 80 is OK.
    expect(deriveSubjectAttendanceDisplayStatus(79, 75)).toBe("AT_RISK");
    expect(deriveSubjectAttendanceDisplayStatus(75 + DEFAULT_DISPLAY_AT_RISK_BUFFER, 75)).toBe("OK");
  });
});

describe("toSubjectAttendanceView", () => {
  it("maps a persisted summary verbatim (no recomputation)", () => {
    const view = toSubjectAttendanceView({
      studentId: "stu-1",
      enrollmentId: "enr-1",
      meta,
      summary: makeSummary({ attendancePercentage: 90, status: "SUFFICIENT" }),
    });

    expect(view).toMatchObject({
      attendancePercentage: 90,
      totalSessions: 10,
      totalPresentMinutes: 540,
      status: "OK",
      needsRecalculation: false,
    });
  });

  it("a missing summary → NOT_STARTED / null / needsRecalculation, never 0%/OK", () => {
    const view = toSubjectAttendanceView({
      studentId: "stu-1",
      enrollmentId: "enr-1",
      meta,
      summary: null,
    });

    expect(view.attendancePercentage).toBeNull();
    expect(view.status).toBe("NOT_STARTED");
    expect(view.needsRecalculation).toBe(true);
    expect(view.calculatedAt).toBeNull();
    // Subject identity + threshold still come through even with no summary.
    expect(view.subjectName).toBe("Matemática");
    expect(view.minimumAttendancePercentage).toBe(75);
  });

  it("carries the LevelSubject threshold and derives BELOW_REQUIRED from the persisted percentage", () => {
    const view = toSubjectAttendanceView({
      studentId: "stu-1",
      enrollmentId: "enr-1",
      meta,
      summary: makeSummary({ attendancePercentage: 60, status: "BELOW_REQUIRED" }),
    });

    expect(view.status).toBe("BELOW_REQUIRED");
    expect(view.attendancePercentage).toBe(60);
  });
});
