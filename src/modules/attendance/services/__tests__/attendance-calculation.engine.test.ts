import { describe, it, expect } from "vitest";
import { calculateAttendanceSummary } from "../attendance-calculation.engine";
import { DEFAULT_ATTENDANCE_POLICY } from "@/modules/attendance/types";
import type { AttendanceCalcRecordInput, EffectiveAttendancePolicy } from "@/modules/attendance/types";

// =============================================================================
// Pure calculation engine — Phase 3 §10 tests 1–11 (+ parity).
// =============================================================================

function policy(over: Partial<EffectiveAttendancePolicy> = {}): EffectiveAttendancePolicy {
  return { ...DEFAULT_ATTENDANCE_POLICY, source: "FALLBACK", policyId: null, ...over };
}

function rec(over: Partial<AttendanceCalcRecordInput> & Pick<AttendanceCalcRecordInput, "attendanceSessionId" | "status">): AttendanceCalcRecordInput {
  return { minutesAttended: 0, lateMinutes: null, hasApprovedJustification: false, ...over };
}

const S1 = { id: "s1", durationMinutes: 60 };
const S2 = { id: "s2", durationMinutes: 60 };

describe("calculateAttendanceSummary — weighting (tests 1–8)", () => {
  it("1. PRESENT full session => 100%", () => {
    const r = calculateAttendanceSummary({
      sessions: [S1],
      records: [rec({ attendanceSessionId: "s1", status: "PRESENT" })],
      policy: policy(),
      minimumAttendancePercentage: 75,
    });
    expect(r.attendancePercentage).toBe(100);
    expect(r.totalPresentMinutes).toBe(60);
    expect(r.status).toBe("SUFFICIENT");
  });

  it("2. ABSENT full session => 0%", () => {
    const r = calculateAttendanceSummary({
      sessions: [S1],
      records: [rec({ attendanceSessionId: "s1", status: "ABSENT" })],
      policy: policy(),
      minimumAttendancePercentage: 75,
    });
    expect(r.attendancePercentage).toBe(0);
    expect(r.totalAbsentMinutes).toBe(60);
    expect(r.status).toBe("BELOW_REQUIRED");
  });

  it("3. LATE counts partial when policy allows", () => {
    const r = calculateAttendanceSummary({
      sessions: [S1],
      records: [rec({ attendanceSessionId: "s1", status: "LATE", lateMinutes: 15 })],
      policy: policy({ countLateAsPartial: true }),
      minimumAttendancePercentage: null,
    });
    expect(r.totalPresentMinutes).toBe(45); // 60 - 15
    expect(r.totalLateMinutes).toBe(15);
    expect(r.attendancePercentage).toBe(75);
  });

  it("4. LATE counts full when policy disables partial", () => {
    const r = calculateAttendanceSummary({
      sessions: [S1],
      records: [rec({ attendanceSessionId: "s1", status: "LATE", lateMinutes: 15 })],
      policy: policy({ countLateAsPartial: false }),
      minimumAttendancePercentage: null,
    });
    expect(r.totalPresentMinutes).toBe(60); // lateness ignored → full present
    expect(r.attendancePercentage).toBe(100);
  });

  it("5. REMOTE counts as present when policy allows", () => {
    const r = calculateAttendanceSummary({
      sessions: [S1],
      records: [rec({ attendanceSessionId: "s1", status: "REMOTE" })],
      policy: policy({ countRemoteAsPresent: true }),
      minimumAttendancePercentage: null,
    });
    expect(r.attendancePercentage).toBe(100);
    expect(r.remoteCount).toBe(1);
  });

  it("6. REMOTE excluded when policy disallows", () => {
    const r = calculateAttendanceSummary({
      sessions: [S1],
      records: [rec({ attendanceSessionId: "s1", status: "REMOTE" })],
      policy: policy({ countRemoteAsPresent: false }),
      minimumAttendancePercentage: null,
    });
    expect(r.attendancePercentage).toBe(0);
    expect(r.totalPresentMinutes).toBe(0);
  });

  it("7a. EXCUSED excluded by default (countExcusedAsPresent=false)", () => {
    const r = calculateAttendanceSummary({
      sessions: [S1],
      records: [rec({ attendanceSessionId: "s1", status: "EXCUSED" })],
      policy: policy({ countExcusedAsPresent: false }),
      minimumAttendancePercentage: null,
    });
    expect(r.totalExcusedMinutes).toBe(60);
    expect(r.totalPresentMinutes).toBe(0);
    expect(r.attendancePercentage).toBe(0);
  });

  it("7b. EXCUSED counts present when policy enables it (transitional)", () => {
    const r = calculateAttendanceSummary({
      sessions: [S1],
      records: [rec({ attendanceSessionId: "s1", status: "EXCUSED" })],
      policy: policy({ countExcusedAsPresent: true }),
      minimumAttendancePercentage: null,
    });
    expect(r.totalPresentMinutes).toBe(60);
    expect(r.attendancePercentage).toBe(100);
  });

  it("7c. ABSENT with an approved justification is treated as an excused effect", () => {
    const excludedByDefault = calculateAttendanceSummary({
      sessions: [S1],
      records: [rec({ attendanceSessionId: "s1", status: "ABSENT", hasApprovedJustification: true })],
      policy: policy({ countExcusedAsPresent: false }),
      minimumAttendancePercentage: null,
    });
    expect(excludedByDefault.totalExcusedMinutes).toBe(60);
    expect(excludedByDefault.totalAbsentMinutes).toBe(0);
    expect(excludedByDefault.attendancePercentage).toBe(0);

    const countedWhenPolicyAllows = calculateAttendanceSummary({
      sessions: [S1],
      records: [rec({ attendanceSessionId: "s1", status: "ABSENT", hasApprovedJustification: true })],
      policy: policy({ countExcusedAsPresent: true }),
      minimumAttendancePercentage: null,
    });
    expect(countedWhenPolicyAllows.attendancePercentage).toBe(100);
  });

  it("8. records for non-counted sessions are excluded", () => {
    const r = calculateAttendanceSummary({
      sessions: [S1], // only s1 is counted (COMPLETED); s2 is not passed in
      records: [
        rec({ attendanceSessionId: "s1", status: "PRESENT" }),
        rec({ attendanceSessionId: "s2", status: "PRESENT" }), // dangling → ignored
      ],
      policy: policy(),
      minimumAttendancePercentage: null,
    });
    expect(r.totalSessions).toBe(1);
    expect(r.totalScheduledMinutes).toBe(60);
    expect(r.totalPresentMinutes).toBe(60);
  });
});

describe("calculateAttendanceSummary — status (tests 9–11)", () => {
  it("9. no counted sessions => NOT_STARTED + null percentage", () => {
    const r = calculateAttendanceSummary({
      sessions: [],
      records: [],
      policy: policy(),
      minimumAttendancePercentage: 75,
    });
    expect(r.attendancePercentage).toBeNull();
    expect(r.status).toBe("NOT_STARTED");
  });

  it("10. percentage below required => BELOW_REQUIRED", () => {
    const r = calculateAttendanceSummary({
      sessions: [S1, S2],
      records: [
        rec({ attendanceSessionId: "s1", status: "PRESENT" }),
        rec({ attendanceSessionId: "s2", status: "ABSENT" }),
      ],
      policy: policy(),
      minimumAttendancePercentage: 75,
    });
    expect(r.attendancePercentage).toBe(50);
    expect(r.status).toBe("BELOW_REQUIRED");
  });

  it("11. percentage at/above required => SUFFICIENT", () => {
    const r = calculateAttendanceSummary({
      sessions: [S1, S2],
      records: [
        rec({ attendanceSessionId: "s1", status: "PRESENT" }),
        rec({ attendanceSessionId: "s2", status: "PRESENT" }),
      ],
      policy: policy(),
      minimumAttendancePercentage: 100,
    });
    expect(r.attendancePercentage).toBe(100);
    expect(r.status).toBe("SUFFICIENT");
  });

  it("SUFFICIENT when there are sessions but no minimum requirement", () => {
    const r = calculateAttendanceSummary({
      sessions: [S1],
      records: [rec({ attendanceSessionId: "s1", status: "ABSENT" })],
      policy: policy(),
      minimumAttendancePercentage: null,
    });
    expect(r.status).toBe("SUFFICIENT");
  });
});

describe("parity with the legacy on-read calculator (default policy)", () => {
  // Legacy math: numerator = PRESENT/REMOTE full + LATE (minutesAttended||dur-lateMin);
  // EXCUSED/ABSENT 0; denominator = Σ completed session minutes; round to 2dp.
  it("matches percentage for a mixed PRESENT/REMOTE/LATE/ABSENT/EXCUSED scenario", () => {
    const sessions = [
      { id: "s1", durationMinutes: 60 },
      { id: "s2", durationMinutes: 60 },
      { id: "s3", durationMinutes: 90 },
      { id: "s4", durationMinutes: 60 },
      { id: "s5", durationMinutes: 60 },
    ];
    const records = [
      rec({ attendanceSessionId: "s1", status: "PRESENT" }), // 60
      rec({ attendanceSessionId: "s2", status: "REMOTE" }), // 60 (countRemoteAsPresent)
      rec({ attendanceSessionId: "s3", status: "LATE", lateMinutes: 30 }), // 60
      rec({ attendanceSessionId: "s4", status: "ABSENT" }), // 0
      rec({ attendanceSessionId: "s5", status: "EXCUSED" }), // 0 (countExcusedAsPresent=false)
    ];
    // legacy numerator = 60 + 60 + 60 + 0 + 0 = 180; denominator = 330
    const legacyPct = Math.round((180 / 330) * 100 * 100) / 100;

    const r = calculateAttendanceSummary({ sessions, records, policy: policy(), minimumAttendancePercentage: 75 });
    expect(r.attendancePercentage).toBe(legacyPct);
    expect(r.totalPresentMinutes).toBe(180);
    expect(r.totalScheduledMinutes).toBe(330);
  });
});
