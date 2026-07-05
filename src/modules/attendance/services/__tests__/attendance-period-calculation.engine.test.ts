import { describe, it, expect } from "vitest";
import { calculatePeriodAttendanceSummary } from "../attendance-period-calculation.engine";
import { calculateAttendanceSummary } from "../attendance-calculation.engine";
import { DEFAULT_ATTENDANCE_POLICY } from "@/modules/attendance/types";
import type { EffectiveAttendancePolicy, PeriodCalcRecord } from "@/modules/attendance/types";

// =============================================================================
// Pure period engine — Phase 4 §12 tests 1, 4–9 (aggregation / counts / baseline).
// =============================================================================

function pol(over: Partial<EffectiveAttendancePolicy> = {}): EffectiveAttendancePolicy {
  return { ...DEFAULT_ATTENDANCE_POLICY, source: "FALLBACK", policyId: null, ...over };
}

function rec(over: Partial<PeriodCalcRecord> & Pick<PeriodCalcRecord, "levelSubjectId" | "status">): PeriodCalcRecord {
  return {
    durationMinutes: 60,
    minutesAttended: 0,
    lateMinutes: null,
    hasApprovedJustification: false,
    policy: pol(),
    minimumAttendancePercentage: null,
    ...over,
  };
}

describe("calculatePeriodAttendanceSummary — aggregation & counts", () => {
  it("1. aggregates multiple subjects into one summary", () => {
    const r = calculatePeriodAttendanceSummary({
      records: [
        rec({ levelSubjectId: "ls-A", status: "PRESENT" }),
        rec({ levelSubjectId: "ls-A", status: "ABSENT" }),
        rec({ levelSubjectId: "ls-B", status: "PRESENT" }),
        rec({ levelSubjectId: "ls-B", status: "PRESENT" }),
      ],
      atRiskBufferPercentage: 5,
    });
    expect(r.totalSessions).toBe(4);
    expect(r.totalScheduledMinutes).toBe(240);
    expect(r.totalPresentMinutes).toBe(180); // 3 present of 4
    expect(r.attendancePercentage).toBe(75);
  });

  it("4. counts PRESENT/ABSENT/LATE/REMOTE/EXCUSED", () => {
    const r = calculatePeriodAttendanceSummary({
      records: [
        rec({ levelSubjectId: "ls", status: "PRESENT" }),
        rec({ levelSubjectId: "ls", status: "ABSENT" }),
        rec({ levelSubjectId: "ls", status: "LATE", lateMinutes: 10 }),
        rec({ levelSubjectId: "ls", status: "REMOTE" }),
        rec({ levelSubjectId: "ls", status: "EXCUSED" }),
      ],
      atRiskBufferPercentage: 5,
    });
    expect(r.presentCount).toBe(1);
    expect(r.absentCount).toBe(1);
    expect(r.lateCount).toBe(1);
    expect(r.remoteCount).toBe(1);
    expect(r.excusedCount).toBe(1);
  });

  it("5. an approved justification increments excusedCount without dropping the raw count", () => {
    const r = calculatePeriodAttendanceSummary({
      records: [rec({ levelSubjectId: "ls", status: "ABSENT", hasApprovedJustification: true })],
      atRiskBufferPercentage: 5,
    });
    expect(r.absentCount).toBe(1); // original status preserved
    expect(r.excusedCount).toBe(1); // excused overlay added
  });

  it("6. applies policy per levelSubject (REMOTE counted for one subject, not the other)", () => {
    const r = calculatePeriodAttendanceSummary({
      records: [
        rec({ levelSubjectId: "ls-A", status: "REMOTE", policy: pol({ countRemoteAsPresent: true }) }),
        rec({ levelSubjectId: "ls-B", status: "REMOTE", policy: pol({ countRemoteAsPresent: false }) }),
      ],
      atRiskBufferPercentage: 5,
    });
    expect(r.totalScheduledMinutes).toBe(120);
    expect(r.totalPresentMinutes).toBe(60); // only ls-A's remote counts
    expect(r.attendancePercentage).toBe(50);
  });
});

describe("calculatePeriodAttendanceSummary — baseline & status", () => {
  it("7. weighted baseline across subjects with thresholds", () => {
    // ls-A: min 80, 60 min ; ls-B: min 60, 180 min → baseline = (80*60 + 60*180)/240 = 65
    const r = calculatePeriodAttendanceSummary({
      records: [
        rec({ levelSubjectId: "ls-A", status: "PRESENT", minimumAttendancePercentage: 80 }),
        rec({ levelSubjectId: "ls-B", status: "PRESENT", minimumAttendancePercentage: 60 }),
        rec({ levelSubjectId: "ls-B", status: "PRESENT", minimumAttendancePercentage: 60 }),
        rec({ levelSubjectId: "ls-B", status: "PRESENT", minimumAttendancePercentage: 60 }),
      ],
      atRiskBufferPercentage: 5,
    });
    expect(r.baseline).toBe(65);
    expect(r.attendancePercentage).toBe(100);
    expect(r.status).toBe("GOOD");
  });

  it("8. fallback: no subject threshold → baseline null → GOOD", () => {
    const r = calculatePeriodAttendanceSummary({
      records: [rec({ levelSubjectId: "ls", status: "ABSENT", minimumAttendancePercentage: null })],
      atRiskBufferPercentage: 5,
    });
    expect(r.baseline).toBeNull();
    expect(r.status).toBe("GOOD");
    expect(r.attendancePercentage).toBe(0);
  });

  it("9. GOOD / AT_RISK / BELOW_REQUIRED around the baseline ± buffer", () => {
    // baseline 75, buffer 5 → GOOD ≥75, AT_RISK 70–74.99, BELOW_REQUIRED <70
    const mk = (present: number, total: number) => {
      const records: PeriodCalcRecord[] = [];
      for (let i = 0; i < total; i++)
        records.push(rec({ levelSubjectId: "ls", status: i < present ? "PRESENT" : "ABSENT", minimumAttendancePercentage: 75 }));
      return calculatePeriodAttendanceSummary({ records, atRiskBufferPercentage: 5 });
    };
    expect(mk(80, 100).status).toBe("GOOD"); // 80%
    expect(mk(72, 100).status).toBe("AT_RISK"); // 72%
    expect(mk(60, 100).status).toBe("BELOW_REQUIRED"); // 60%
  });

  it("no sessions → null percentage + GOOD (not-started represented by null)", () => {
    const r = calculatePeriodAttendanceSummary({ records: [], atRiskBufferPercentage: 5 });
    expect(r.attendancePercentage).toBeNull();
    expect(r.status).toBe("GOOD");
    expect(r.totalSessions).toBe(0);
  });
});

describe("Fix H2 — justified records & subject-engine parity (no divergence)", () => {
  it("a justified LATE keeps its partial minutes in the period rollup too (default policy)", () => {
    const r = calculatePeriodAttendanceSummary({
      records: [rec({ levelSubjectId: "ls", status: "LATE", lateMinutes: 15, hasApprovedJustification: true })],
      atRiskBufferPercentage: 5,
    });
    expect(r.totalPresentMinutes).toBe(45); // not 0
    expect(r.attendancePercentage).toBe(75);
  });

  it("period and subject engines weigh a justified LATE IDENTICALLY across policy combos", () => {
    const bools = [false, true];
    for (const countExcusedAsPresent of bools) {
      for (const countLateAsPartial of bools) {
        const p = pol({ countExcusedAsPresent, countLateAsPartial });

        const subject = calculateAttendanceSummary({
          sessions: [{ id: "s1", durationMinutes: 60 }],
          records: [
            {
              attendanceSessionId: "s1",
              status: "LATE",
              minutesAttended: 0,
              lateMinutes: 15,
              hasApprovedJustification: true,
            },
          ],
          policy: p,
          minimumAttendancePercentage: 75,
        });

        const period = calculatePeriodAttendanceSummary({
          records: [rec({ levelSubjectId: "ls", status: "LATE", lateMinutes: 15, hasApprovedJustification: true, policy: p })],
          atRiskBufferPercentage: 5,
        });

        // Same present-equivalent minutes and percentage in both engines.
        expect(period.totalPresentMinutes).toBe(subject.totalPresentMinutes);
        expect(period.attendancePercentage).toBe(subject.attendancePercentage);
      }
    }
  });
});
