import { describe, it, expect } from "vitest";
import { calculateHealthScore } from "../services/student-health.service";
import type { HealthScoreInput } from "../types";

function baseInput(overrides: Partial<HealthScoreInput> = {}): HealthScoreInput {
  return {
    subjectStatuses: [],
    levelStatuses: [],
    finance: { outstandingBalance: 0, hasOverdueInvoice: false },
    attendancePercentage: 96.5,
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
  });

  it("penalizes finance score for outstanding balance and overdue invoices independently", () => {
    const outstandingOnly = calculateHealthScore(
      baseInput({ finance: { outstandingBalance: 500, hasOverdueInvoice: false } })
    );
    const overdueOnly = calculateHealthScore(
      baseInput({ finance: { outstandingBalance: 0, hasOverdueInvoice: true } })
    );
    const both = calculateHealthScore(
      baseInput({ finance: { outstandingBalance: 500, hasOverdueInvoice: true } })
    );
    expect(outstandingOnly.breakdown.finance).toBe(75);
    expect(overdueOnly.breakdown.finance).toBe(65);
    expect(both.breakdown.finance).toBe(40);
  });

  it("excludes the finance axis entirely when finance is not authorized (finance: null)", () => {
    // Fully healthy in every AUTHORIZED category (attendance 100 too).
    const result = calculateHealthScore(baseInput({ finance: null, attendancePercentage: 100 }));
    // The finance breakdown is null (not 0) — nothing computed, nothing shown.
    expect(result.breakdown.finance).toBeNull();
    // Weight is redistributed, so a perfect authorized-subset still scores 100 (not 75).
    expect(result.score).toBe(100);
  });

  it("does not let an unauthorized viewer infer finance state via the score", () => {
    const withFinanceHidden = calculateHealthScore(baseInput({ finance: null }));
    const wouldHaveDebtButHidden = calculateHealthScore(baseInput({ finance: null }));
    expect(withFinanceHidden.score).toBe(wouldHaveDebtButHidden.score);
    expect(withFinanceHidden.breakdown.finance).toBeNull();
  });

  it("caps attendance score at 50 when any subject is below the minimum requirement", () => {
    const result = calculateHealthScore(
      baseInput({ attendancePercentage: 96.5, hasBelowRequiredAttendance: true })
    );
    expect(result.breakdown.attendance).toBe(50);
  });

  it("excludes the attendance axis (null, not 100) when there is no attendance data", () => {
    const result = calculateHealthScore(baseInput({ attendancePercentage: null }));
    // No sessions → axis excluded and its weight redistributed, never assumed perfect.
    expect(result.breakdown.attendance).toBeNull();
    // Healthy in every other authorized category → still 100 after renormalization.
    expect(result.score).toBe(100);
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
      calculateHealthScore(
        baseInput({ finance: { outstandingBalance: 1, hasOverdueInvoice: false }, enrollmentStatuses: ["COMPLETED"] })
      ).label
    ).toBe("HEALTHY");
    expect(
      calculateHealthScore(
        baseInput({
          subjectStatuses: Array(5).fill("FAILED"),
          finance: { outstandingBalance: 100, hasOverdueInvoice: true },
          hasBelowRequiredAttendance: true,
        })
      ).label
    ).toBe("NEEDS_ATTENTION");
    expect(
      calculateHealthScore(
        baseInput({
          levelStatuses: ["BLOCKED"],
          finance: { outstandingBalance: 100, hasOverdueInvoice: true },
          enrollmentStatuses: [],
          lastActivityAt: null,
        })
      ).label
    ).toBe("CRITICAL");
  });
});
