import { describe, it, expect } from "vitest";
import {
  detectSubjectProgressTransition,
  type SubjectProgressSnapshot,
} from "../subject-progress-transition";

// =============================================================================
// Sprint C — pure transition detection. Events + the `updated` audit must fire
// only on real transitions; identical recalculation must be silent.
// =============================================================================

function snap(
  over: Partial<Omit<SubjectProgressSnapshot, "status">> & { status?: string } = {}
): SubjectProgressSnapshot & { status: string } {
  return {
    status: "IN_PROGRESS",
    finalGrade: null,
    attendancePercentage: null,
    completedAt: null,
    progressReason: null,
    ...over,
  };
}

describe("detectSubjectProgressTransition — subject status transitions", () => {
  it("1. IN_PROGRESS → PASSED enters PASSED", () => {
    const t = detectSubjectProgressTransition(snap({ status: "IN_PROGRESS" }), snap({ status: "PASSED", finalGrade: 80 }));
    expect(t.enteredPassed).toBe(true);
    expect(t.enteredFailed).toBe(false);
    expect(t.hasMeaningfulChange).toBe(true);
  });

  it("2. PASSED → PASSED (identical) is silent", () => {
    const prev = snap({ status: "PASSED", finalGrade: 80, completedAt: new Date("2026-03-01") });
    const t = detectSubjectProgressTransition(prev, { ...prev });
    expect(t.enteredPassed).toBe(false);
    expect(t.hasStatusChanged).toBe(false);
    expect(t.hasMeaningfulChange).toBe(false);
  });

  it("3. FAILED → FAILED (identical) is silent", () => {
    const prev = snap({ status: "FAILED", finalGrade: 40, completedAt: new Date("2026-03-01") });
    const t = detectSubjectProgressTransition(prev, { ...prev });
    expect(t.enteredFailed).toBe(false);
    expect(t.hasMeaningfulChange).toBe(false);
  });

  it("4. FAILED → PASSED enters PASSED", () => {
    const t = detectSubjectProgressTransition(snap({ status: "FAILED", finalGrade: 40 }), snap({ status: "PASSED", finalGrade: 75 }));
    expect(t.enteredPassed).toBe(true);
  });

  it("5. PASSED → FAILED enters FAILED", () => {
    const t = detectSubjectProgressTransition(snap({ status: "PASSED", finalGrade: 80 }), snap({ status: "FAILED", finalGrade: 40 }));
    expect(t.enteredFailed).toBe(true);
    expect(t.enteredPassed).toBe(false);
  });

  it("6. INCOMPLETE → INCOMPLETE (identical) is silent", () => {
    const prev = snap({ status: "INCOMPLETE", attendancePercentage: 40 });
    const t = detectSubjectProgressTransition(prev, { ...prev });
    expect(t.hasStatusChanged).toBe(false);
    expect(t.hasMeaningfulChange).toBe(false);
  });

  it("7. INCOMPLETE → PASSED enters PASSED", () => {
    const t = detectSubjectProgressTransition(snap({ status: "INCOMPLETE", attendancePercentage: 40 }), snap({ status: "PASSED", finalGrade: 80, attendancePercentage: 90 }));
    expect(t.enteredPassed).toBe(true);
  });

  it("8. PASSED → INCOMPLETE changes status but enters neither terminal event", () => {
    const t = detectSubjectProgressTransition(snap({ status: "PASSED", finalGrade: 80 }), snap({ status: "INCOMPLETE", finalGrade: 80, attendancePercentage: 40 }));
    expect(t.hasStatusChanged).toBe(true);
    expect(t.enteredPassed).toBe(false);
    expect(t.enteredFailed).toBe(false);
  });

  it("a brand-new row (previous null) is always a meaningful change", () => {
    const t = detectSubjectProgressTransition(null, snap({ status: "PASSED", finalGrade: 80 }));
    expect(t.previousStatus).toBeNull();
    expect(t.enteredPassed).toBe(true);
    expect(t.hasMeaningfulChange).toBe(true);
  });
});

describe("detectSubjectProgressTransition — meaningful-field changes (audit gating)", () => {
  const base = snap({ status: "PASSED", finalGrade: 80, attendancePercentage: 90, progressReason: "ok", completedAt: new Date("2026-03-01") });

  it("10. a grade change is meaningful (no terminal re-entry)", () => {
    const t = detectSubjectProgressTransition(base, { ...base, finalGrade: 85 });
    expect(t.hasGradeChanged).toBe(true);
    expect(t.hasMeaningfulChange).toBe(true);
    expect(t.enteredPassed).toBe(false);
  });

  it("11. an attendance change is meaningful", () => {
    const t = detectSubjectProgressTransition(base, { ...base, attendancePercentage: 95 });
    expect(t.hasAttendanceChanged).toBe(true);
    expect(t.hasMeaningfulChange).toBe(true);
  });

  it("12. a reason change is meaningful", () => {
    const t = detectSubjectProgressTransition(base, { ...base, progressReason: "different" });
    expect(t.hasReasonChanged).toBe(true);
    expect(t.hasMeaningfulChange).toBe(true);
  });

  it("a completedAt change is meaningful; an equal instant is not", () => {
    const changed = detectSubjectProgressTransition(base, { ...base, completedAt: new Date("2026-04-01") });
    expect(changed.hasCompletionChanged).toBe(true);

    const sameInstant = detectSubjectProgressTransition(base, { ...base, completedAt: new Date("2026-03-01") });
    expect(sameInstant.hasCompletionChanged).toBe(false);
    expect(sameInstant.hasMeaningfulChange).toBe(false);
  });
});
