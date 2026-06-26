import { describe, it, expect } from "vitest";
import { calculateTeacherHealthScore } from "../services/teacher-health.service";
import type { HealthScoreInput } from "../types";

function baseInput(overrides: Partial<HealthScoreInput> = {}): HealthScoreInput {
  return {
    completedSessionsLast30d: 10,
    completedSessionsWithRecordsLast30d: 10,
    overdueOpenAssessmentCount: 0,
    pendingGradingOpenAssessmentCount: 0,
    readyNotPublishedCount: 0,
    activeClassGroupCount: 2,
    passRate: 90,
    avgStudentAttendance: 95,
    ...overrides,
  };
}

describe("calculateTeacherHealthScore", () => {
  it("returns a high score and EXCELLENT label for a healthy teacher", () => {
    const result = calculateTeacherHealthScore(baseInput());
    expect(result.score).toBeGreaterThanOrEqual(90);
    expect(result.label).toBe("EXCELLENT");
    expect(result.topReasons).toHaveLength(0);
  });

  it("heavily penalizes execution when there are active groups but 0 sessions in 30 days", () => {
    const result = calculateTeacherHealthScore(
      baseInput({ completedSessionsLast30d: 0, completedSessionsWithRecordsLast30d: 0 })
    );
    expect(result.breakdown.execution).toBe(20);
    expect(result.topReasons[0].message).toContain("Sem aulas registadas");
  });

  it("does not penalize execution when the teacher has no active class groups at all", () => {
    const result = calculateTeacherHealthScore(
      baseInput({ activeClassGroupCount: 0, completedSessionsLast30d: 0, completedSessionsWithRecordsLast30d: 0 })
    );
    expect(result.breakdown.execution).toBe(100);
  });

  it("penalizes execution moderately when attendance records lag behind completed sessions", () => {
    const result = calculateTeacherHealthScore(
      baseInput({ completedSessionsLast30d: 10, completedSessionsWithRecordsLast30d: 5 })
    );
    expect(result.breakdown.execution).toBe(60);
  });

  it("deducts delivery score for overdue, pending-grading, and ready-not-published assessments independently", () => {
    const overdueOnly = calculateTeacherHealthScore(baseInput({ overdueOpenAssessmentCount: 2 }));
    const pendingOnly = calculateTeacherHealthScore(baseInput({ pendingGradingOpenAssessmentCount: 1 }));
    const readyOnly = calculateTeacherHealthScore(baseInput({ readyNotPublishedCount: 1 }));
    expect(overdueOnly.breakdown.delivery).toBe(70); // 100 - min(40, 2*15)
    expect(pendingOnly.breakdown.delivery).toBe(90); // 100 - min(30, 1*10)
    expect(readyOnly.breakdown.delivery).toBe(90); // 100 - min(20, 1*10)
  });

  it("caps delivery deductions at their respective maximums", () => {
    const result = calculateTeacherHealthScore(
      baseInput({ overdueOpenAssessmentCount: 10, pendingGradingOpenAssessmentCount: 10, readyNotPublishedCount: 10 })
    );
    expect(result.breakdown.delivery).toBe(10); // 100 - 40 - 30 - 20
  });

  it("scores workload by active-class-group thresholds: <5, 5-6, >=7", () => {
    expect(calculateTeacherHealthScore(baseInput({ activeClassGroupCount: 4 })).breakdown.workload).toBe(100);
    expect(calculateTeacherHealthScore(baseInput({ activeClassGroupCount: 5 })).breakdown.workload).toBe(70);
    expect(calculateTeacherHealthScore(baseInput({ activeClassGroupCount: 7 })).breakdown.workload).toBe(40);
  });

  it("defaults quality to 100 when there is no graded data yet (does not punish new teachers)", () => {
    const result = calculateTeacherHealthScore(baseInput({ passRate: null, avgStudentAttendance: null }));
    expect(result.breakdown.quality).toBe(100);
  });

  it("blends pass rate and student attendance for the quality score", () => {
    const result = calculateTeacherHealthScore(baseInput({ passRate: 80, avgStudentAttendance: 60 }));
    expect(result.breakdown.quality).toBe(72); // 0.6*80 + 0.4*60
  });

  it("clamps every breakdown category between 0 and 100", () => {
    const result = calculateTeacherHealthScore(
      baseInput({
        overdueOpenAssessmentCount: 100,
        pendingGradingOpenAssessmentCount: 100,
        readyNotPublishedCount: 100,
        activeClassGroupCount: 50,
        passRate: 0,
        avgStudentAttendance: 0,
      })
    );
    for (const value of Object.values(result.breakdown)) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(100);
    }
  });

  it("applies the correct label thresholds", () => {
    expect(calculateTeacherHealthScore(baseInput()).label).toBe("EXCELLENT");
    expect(calculateTeacherHealthScore(baseInput({ activeClassGroupCount: 7 })).label).toBe("HEALTHY");
    expect(
      calculateTeacherHealthScore(
        baseInput({ overdueOpenAssessmentCount: 2, activeClassGroupCount: 7, passRate: 40, avgStudentAttendance: 40 })
      ).label
    ).toBe("NEEDS_ATTENTION");
    expect(
      calculateTeacherHealthScore(
        baseInput({
          completedSessionsLast30d: 0,
          completedSessionsWithRecordsLast30d: 0,
          overdueOpenAssessmentCount: 5,
          activeClassGroupCount: 9,
          passRate: 10,
          avgStudentAttendance: 10,
        })
      ).label
    ).toBe("CRITICAL");
  });

  it("sorts top reasons by impact descending and caps at 3", () => {
    const result = calculateTeacherHealthScore(
      baseInput({
        completedSessionsLast30d: 0,
        completedSessionsWithRecordsLast30d: 0,
        overdueOpenAssessmentCount: 3,
        pendingGradingOpenAssessmentCount: 2,
        readyNotPublishedCount: 1,
        activeClassGroupCount: 7,
      })
    );
    expect(result.topReasons.length).toBeLessThanOrEqual(3);
    for (let i = 1; i < result.topReasons.length; i++) {
      expect(result.topReasons[i - 1].impact).toBeGreaterThanOrEqual(result.topReasons[i].impact);
    }
  });

  it("recommends an action tied to the worst-scoring category", () => {
    const executionWorst = calculateTeacherHealthScore(
      baseInput({ completedSessionsLast30d: 0, completedSessionsWithRecordsLast30d: 0 })
    );
    expect(executionWorst.recommendedAction).toMatch(/aulas|presenças/i);

    const workloadWorst = calculateTeacherHealthScore(baseInput({ activeClassGroupCount: 7 }));
    expect(workloadWorst.recommendedAction).toMatch(/turmas/i);
  });
});
