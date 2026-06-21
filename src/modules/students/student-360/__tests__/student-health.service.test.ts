import { describe, it, expect } from "vitest";
import { calculateHealthScore } from "../services/student-health.service";
import type { HealthScoreInput } from "../types";

function baseInput(overrides: Partial<HealthScoreInput> = {}): HealthScoreInput {
  return {
    subjectStatuses: [],
    levelStatuses: [],
    outstandingBalance: 0,
    hasOverdueInvoice: false,
    attendancePercentages: [95, 98],
    hasBelowRequiredAttendance: false,
    enrollmentStatuses: ["ACTIVE"],
    lastActivityAt: new Date("2026-06-10"),
    now: new Date("2026-06-21"),
    ...overrides,
  };
}

describe("calculateHealthScore", () => {
  it("returns a perfect-ish score and EXCELLENT label for a healthy student", () => {
    const result = calculateHealthScore(baseInput());
    expect(result.score).toBeGreaterThanOrEqual(90);
    expect(result.label).toBe("EXCELLENT");
    expect(result.topReasons).toHaveLength(0);
  });

  it("deducts academic score per failed subject, capped at 40", () => {
    const oneFailed = calculateHealthScore(baseInput({ subjectStatuses: ["FAILED"] }));
    const fiveFailed = calculateHealthScore(
      baseInput({ subjectStatuses: Array(5).fill("FAILED") })
    );
    expect(oneFailed.breakdown.academic).toBe(90);
    expect(fiveFailed.breakdown.academic).toBe(60); // 100 - min(40, 5*10)
  });

  it("heavily penalizes a blocked level", () => {
    const result = calculateHealthScore(baseInput({ levelStatuses: ["BLOCKED"] }));
    expect(result.breakdown.academic).toBe(60);
    expect(result.topReasons[0].message).toContain("bloqueada");
  });

  it("penalizes finance score for outstanding balance and overdue invoices independently", () => {
    const outstandingOnly = calculateHealthScore(baseInput({ outstandingBalance: 500 }));
    const overdueOnly = calculateHealthScore(baseInput({ hasOverdueInvoice: true }));
    const both = calculateHealthScore(baseInput({ outstandingBalance: 500, hasOverdueInvoice: true }));
    expect(outstandingOnly.breakdown.finance).toBe(75);
    expect(overdueOnly.breakdown.finance).toBe(65);
    expect(both.breakdown.finance).toBe(40);
  });

  it("caps attendance score at 50 when any subject is below the minimum requirement", () => {
    const result = calculateHealthScore(
      baseInput({ attendancePercentages: [95, 98], hasBelowRequiredAttendance: true })
    );
    expect(result.breakdown.attendance).toBe(50);
  });

  it("does not penalize attendance when there is no attendance data at all", () => {
    const result = calculateHealthScore(baseInput({ attendancePercentages: [] }));
    expect(result.breakdown.attendance).toBe(100);
  });

  it("scores enrollment status by tier: active > completed > suspended > none", () => {
    expect(calculateHealthScore(baseInput({ enrollmentStatuses: ["ACTIVE"] })).breakdown.enrollment).toBe(100);
    expect(calculateHealthScore(baseInput({ enrollmentStatuses: ["COMPLETED"] })).breakdown.enrollment).toBe(60);
    expect(calculateHealthScore(baseInput({ enrollmentStatuses: ["SUSPENDED"] })).breakdown.enrollment).toBe(30);
    expect(calculateHealthScore(baseInput({ enrollmentStatuses: [] })).breakdown.enrollment).toBe(0);
  });

  it("scores activity by recency: <=30d, <=90d, >90d, never", () => {
    const recent = calculateHealthScore(
      baseInput({ lastActivityAt: new Date("2026-06-01"), now: new Date("2026-06-20") })
    );
    const stale = calculateHealthScore(
      baseInput({ lastActivityAt: new Date("2026-04-01"), now: new Date("2026-06-20") })
    );
    const veryStale = calculateHealthScore(
      baseInput({ lastActivityAt: new Date("2026-01-01"), now: new Date("2026-06-20") })
    );
    const never = calculateHealthScore(baseInput({ lastActivityAt: null }));

    expect(recent.breakdown.activity).toBe(100);
    expect(stale.breakdown.activity).toBe(60);
    expect(veryStale.breakdown.activity).toBe(20);
    expect(never.breakdown.activity).toBe(20);
  });

  it("applies the correct label thresholds", () => {
    expect(calculateHealthScore(baseInput()).label).toBe("EXCELLENT");
    expect(
      calculateHealthScore(baseInput({ outstandingBalance: 1, enrollmentStatuses: ["COMPLETED"] })).label
    ).toBe("HEALTHY");
    expect(
      calculateHealthScore(
        baseInput({
          subjectStatuses: Array(5).fill("FAILED"),
          hasOverdueInvoice: true,
          outstandingBalance: 100,
          hasBelowRequiredAttendance: true,
        })
      ).label
    ).toBe("NEEDS_ATTENTION");
    expect(
      calculateHealthScore(
        baseInput({
          levelStatuses: ["BLOCKED"],
          hasOverdueInvoice: true,
          outstandingBalance: 100,
          enrollmentStatuses: [],
          lastActivityAt: null,
        })
      ).label
    ).toBe("CRITICAL");
  });

  it("sorts top reasons by impact descending and caps at 3", () => {
    const result = calculateHealthScore(
      baseInput({
        subjectStatuses: ["FAILED", "FAILED", "FAILED", "FAILED"],
        levelStatuses: ["BLOCKED", "RECOVERY_REQUIRED"],
        outstandingBalance: 100,
        hasOverdueInvoice: true,
        enrollmentStatuses: [],
      })
    );
    expect(result.topReasons).toHaveLength(3);
    for (let i = 1; i < result.topReasons.length; i++) {
      expect(result.topReasons[i - 1].impact).toBeGreaterThanOrEqual(result.topReasons[i].impact);
    }
  });

  it("recommends an action tied to the worst-scoring category", () => {
    const financeWorst = calculateHealthScore(baseInput({ outstandingBalance: 100, hasOverdueInvoice: true }));
    expect(financeWorst.recommendedAction).toMatch(/financeira/i);

    const academicWorst = calculateHealthScore(baseInput({ levelStatuses: ["BLOCKED"] }));
    expect(academicWorst.recommendedAction).toMatch(/académico/i);
  });
});
