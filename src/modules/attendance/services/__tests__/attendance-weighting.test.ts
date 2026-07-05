import { describe, it, expect } from "vitest";
import { weighAttendanceRecord, isExcusedEffect } from "../attendance-weighting";

// =============================================================================
// Attendance record weighting — Fix H2.
//
// Domain rule: an approved justification (and the legacy EXCUSED status) is an
// academic ACCOMMODATION layered on the recorded reality. It may only RAISE
// present-equivalent minutes, never lower them:
//
//     presentMinutes = max(presentByRealStatus, countExcusedAsPresent ? dur : 0)
//
// This is monotonic by construction, so approving a justification can NEVER
// worsen attendance under any policy combination.
// =============================================================================

interface Pol {
  countExcusedAsPresent: boolean;
  countRemoteAsPresent: boolean;
  countLateAsPartial: boolean;
}

function pol(over: Partial<Pol> = {}): Pol {
  return { countExcusedAsPresent: false, countRemoteAsPresent: true, countLateAsPartial: true, ...over };
}

function rec(over: {
  status: string;
  minutesAttended?: number;
  lateMinutes?: number | null;
  hasApprovedJustification?: boolean;
}) {
  return {
    status: over.status,
    minutesAttended: over.minutesAttended ?? 0,
    lateMinutes: over.lateMinutes ?? null,
    hasApprovedJustification: over.hasApprovedJustification ?? false,
  };
}

const DUR = 60;

describe("weighAttendanceRecord — LATE + justification (the H2 regression)", () => {
  it("LATE without justification counts partial minutes (baseline)", () => {
    const w = weighAttendanceRecord(
      rec({ status: "LATE", lateMinutes: 15 }),
      DUR,
      pol({ countLateAsPartial: true, countExcusedAsPresent: false })
    );
    expect(w.presentMinutes).toBe(45);
    expect(w.lateMinutesLost).toBe(15);
    expect(w.isExcusedEffect).toBe(false);
  });

  it("LATE WITH justification never drops below the partial minutes (was 0 pre-fix)", () => {
    const w = weighAttendanceRecord(
      rec({ status: "LATE", lateMinutes: 15, hasApprovedJustification: true }),
      DUR,
      pol({ countLateAsPartial: true, countExcusedAsPresent: false })
    );
    // The student attended 45 minutes — the justification must NOT erase them.
    expect(w.presentMinutes).toBe(45);
    expect(w.absentMinutes).toBe(0);
    expect(w.lateMinutesLost).toBe(0); // no penalty — the shortfall is excused
    expect(w.excusedMinutes).toBe(15); // 60 - 45
    expect(w.isExcusedEffect).toBe(true);
  });

  it("LATE + justification is UPGRADED to full when the policy counts excused as present", () => {
    const w = weighAttendanceRecord(
      rec({ status: "LATE", lateMinutes: 15, hasApprovedJustification: true }),
      DUR,
      pol({ countLateAsPartial: true, countExcusedAsPresent: true })
    );
    expect(w.presentMinutes).toBe(60); // max(45, 60)
    expect(w.excusedMinutes).toBe(0);
  });

  it("LATE with countLateAsPartial=false is full with or without justification", () => {
    const base = weighAttendanceRecord(
      rec({ status: "LATE", lateMinutes: 15 }),
      DUR,
      pol({ countLateAsPartial: false })
    );
    const justified = weighAttendanceRecord(
      rec({ status: "LATE", lateMinutes: 15, hasApprovedJustification: true }),
      DUR,
      pol({ countLateAsPartial: false })
    );
    expect(base.presentMinutes).toBe(60);
    expect(justified.presentMinutes).toBe(60);
  });
});

describe("weighAttendanceRecord — ABSENT + justification (policy-dependent)", () => {
  it("stays 0 present / fully excused when the policy does NOT count excused as present", () => {
    const w = weighAttendanceRecord(
      rec({ status: "ABSENT", hasApprovedJustification: true }),
      DUR,
      pol({ countExcusedAsPresent: false })
    );
    expect(w.presentMinutes).toBe(0);
    expect(w.absentMinutes).toBe(0); // reclassified as excused, not a penalty
    expect(w.excusedMinutes).toBe(60);
    expect(w.isExcusedEffect).toBe(true);
  });

  it("is credited full present when the policy counts excused as present", () => {
    const w = weighAttendanceRecord(
      rec({ status: "ABSENT", hasApprovedJustification: true }),
      DUR,
      pol({ countExcusedAsPresent: true })
    );
    expect(w.presentMinutes).toBe(60);
    expect(w.excusedMinutes).toBe(0);
  });
});

describe("weighAttendanceRecord — legacy EXCUSED ≡ ABSENT + justification (transitional parity)", () => {
  for (const countExcusedAsPresent of [false, true]) {
    it(`identical interpretation (countExcusedAsPresent=${countExcusedAsPresent})`, () => {
      const legacy = weighAttendanceRecord(
        rec({ status: "EXCUSED" }),
        DUR,
        pol({ countExcusedAsPresent })
      );
      const justifiedAbsence = weighAttendanceRecord(
        rec({ status: "ABSENT", hasApprovedJustification: true }),
        DUR,
        pol({ countExcusedAsPresent })
      );
      expect(legacy).toEqual(justifiedAbsence);
    });
  }

  it("isExcusedEffect is true for legacy EXCUSED and for justified ABSENT/LATE only", () => {
    expect(isExcusedEffect(rec({ status: "EXCUSED" }))).toBe(true);
    expect(isExcusedEffect(rec({ status: "ABSENT", hasApprovedJustification: true }))).toBe(true);
    expect(isExcusedEffect(rec({ status: "LATE", hasApprovedJustification: true }))).toBe(true);
    expect(isExcusedEffect(rec({ status: "ABSENT" }))).toBe(false);
    expect(isExcusedEffect(rec({ status: "PRESENT", hasApprovedJustification: true }))).toBe(false);
  });
});

describe("weighAttendanceRecord — property: a justification NEVER reduces present minutes", () => {
  const STATUSES = ["PRESENT", "ABSENT", "LATE", "REMOTE", "EXCUSED"];
  const BOOLS = [false, true];
  const DURATIONS = [60, 90, 45];
  const LATES = [0, 15, 30, 60];

  it("holds across every status × policy combination × duration × lateness", () => {
    let checked = 0;
    for (const status of STATUSES) {
      for (const countExcusedAsPresent of BOOLS) {
        for (const countRemoteAsPresent of BOOLS) {
          for (const countLateAsPartial of BOOLS) {
            for (const dur of DURATIONS) {
              for (const late of LATES) {
                const p = pol({ countExcusedAsPresent, countRemoteAsPresent, countLateAsPartial });
                const without = weighAttendanceRecord(
                  rec({ status, lateMinutes: late }),
                  dur,
                  p
                );
                const withJust = weighAttendanceRecord(
                  rec({ status, lateMinutes: late, hasApprovedJustification: true }),
                  dur,
                  p
                );
                // The core invariant: approving a justification can only keep or
                // raise present-equivalent minutes — never lower them.
                expect(withJust.presentMinutes).toBeGreaterThanOrEqual(without.presentMinutes);
                // And it is bounded by the session duration.
                expect(withJust.presentMinutes).toBeLessThanOrEqual(dur);
                checked++;
              }
            }
          }
        }
      }
    }
    expect(checked).toBe(STATUSES.length * 8 * DURATIONS.length * LATES.length);
  });
});
