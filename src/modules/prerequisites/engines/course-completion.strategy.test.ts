import { describe, it, expect } from "vitest";
import {
  getCourseCompletionStrategy,
  computeCourseFinalGrade,
  COURSE_COMPLETION_STRATEGY,
  COURSE_COMPLETION_REASON,
  COURSE_FINAL_GRADE_MODE,
  DEFAULT_COURSE_COMPLETION_POLICY,
  type CourseCompletionPolicy,
  type CourseLevelInput,
  type CourseLevelProgressInput,
} from "@/modules/prerequisites/engines/course-completion.strategy";

// Architecture tests for the extracted strategy / grade-policy layer. Behaviour
// must match the historical engine; these lock the contract + reason derivation.

function decide(
  levels: CourseLevelInput[],
  progress: CourseLevelProgressInput[],
  policy: CourseCompletionPolicy = DEFAULT_COURSE_COMPLETION_POLICY
) {
  return getCourseCompletionStrategy(policy).decide({ courseLevels: levels, levelProgress: progress, policy });
}

const L = (id: string, order: number, weight: number | null = null): CourseLevelInput => ({ id, order, weight });
const P = (
  courseLevelId: string,
  status: string,
  finalGrade: number | null = null,
  earnedCredits: number | null = 0
): CourseLevelProgressInput => ({ courseLevelId, status, finalGrade, earnedCredits });

describe("course completion policy defaults", () => {
  it("defaults to STANDARD strategy + WEIGHTED_BY_HOURS with all requirement gates off", () => {
    expect(DEFAULT_COURSE_COMPLETION_POLICY).toMatchObject({
      strategy: COURSE_COMPLETION_STRATEGY.STANDARD,
      finalGradeMode: COURSE_FINAL_GRADE_MODE.WEIGHTED_BY_HOURS,
      requireAttendance: false,
      requireFinancialClearance: false,
      requireInternship: false,
      requirePracticalLessons: false,
      requireCertificateApproval: false,
      requireManualCompletion: false,
    });
  });
});

describe("getCourseCompletionStrategy", () => {
  it("returns the STANDARD strategy by default", () => {
    expect(getCourseCompletionStrategy().name).toBe(COURSE_COMPLETION_STRATEGY.STANDARD);
  });

  it("throws for a not-yet-implemented strategy", () => {
    const policy = { ...DEFAULT_COURSE_COMPLETION_POLICY, strategy: COURSE_COMPLETION_STRATEGY.CREDIT_BASED };
    expect(() => getCourseCompletionStrategy(policy)).toThrow(/não está implementada/);
  });
});

describe("StandardCourseCompletionStrategy — status + completionReason", () => {
  const levels = [L("l1", 1), L("l2", 2)];

  it("all levels passed → COMPLETED / ALL_LEVELS_COMPLETED", () => {
    const d = decide(levels, [P("l1", "PASSED", 80, 10), P("l2", "PROMOTED", 70, 10)]);
    expect(d.status).toBe("COMPLETED");
    expect(d.completed).toBe(true);
    expect(d.completionReason).toBe(COURSE_COMPLETION_REASON.ALL_LEVELS_COMPLETED);
  });

  it("failed required level (nothing in progress) → FAILED / FAILED_REQUIRED_LEVEL", () => {
    const d = decide(levels, [P("l1", "FAILED", 30, 0), P("l2", "PASSED", 80, 10)]);
    expect(d.status).toBe("FAILED");
    expect(d.completionReason).toBe(COURSE_COMPLETION_REASON.FAILED_REQUIRED_LEVEL);
  });

  it("a RECOVERY_REQUIRED level → IN_PROGRESS / PENDING_RECOVERY", () => {
    const d = decide(levels, [P("l1", "RECOVERY_REQUIRED", 40, 0), P("l2", "PASSED", 80, 10)]);
    expect(d.status).toBe("IN_PROGRESS");
    expect(d.completionReason).toBe(COURSE_COMPLETION_REASON.PENDING_RECOVERY);
  });

  it("an ELIGIBLE_TO_PROGRESS level → IN_PROGRESS / PENDING_MANUAL_APPROVAL", () => {
    const d = decide(levels, [P("l1", "ELIGIBLE_TO_PROGRESS", 70, 8), P("l2", "PASSED", 80, 10)]);
    expect(d.status).toBe("IN_PROGRESS");
    expect(d.completionReason).toBe(COURSE_COMPLETION_REASON.PENDING_MANUAL_APPROVAL);
  });

  it("a PROMOTED_WITH_PENDING_SUBJECTS level → IN_PROGRESS / PENDING_MANUAL_APPROVAL", () => {
    const d = decide(levels, [P("l1", "PROMOTED_WITH_PENDING_SUBJECTS", 65, 8), P("l2", "PASSED", 80, 10)]);
    expect(d.status).toBe("IN_PROGRESS");
    expect(d.completionReason).toBe(COURSE_COMPLETION_REASON.PENDING_MANUAL_APPROVAL);
  });

  it("a plain IN_PROGRESS level → IN_PROGRESS / LEVEL_IN_PROGRESS", () => {
    const d = decide(levels, [P("l1", "IN_PROGRESS", null, 0), P("l2", "PASSED", 80, 10)]);
    expect(d.status).toBe("IN_PROGRESS");
    expect(d.completionReason).toBe(COURSE_COMPLETION_REASON.LEVEL_IN_PROGRESS);
  });

  it("PENDING_RECOVERY takes precedence over PENDING_MANUAL_APPROVAL", () => {
    const d = decide(levels, [P("l1", "RECOVERY_REQUIRED", 40, 0), P("l2", "ELIGIBLE_TO_PROGRESS", 70, 8)]);
    expect(d.completionReason).toBe(COURSE_COMPLETION_REASON.PENDING_RECOVERY);
  });

  it("no progress at all → NOT_STARTED / NOT_STARTED", () => {
    const d = decide(levels, []);
    expect(d.status).toBe("NOT_STARTED");
    expect(d.completionReason).toBe(COURSE_COMPLETION_REASON.NOT_STARTED);
  });
});

describe("computeCourseFinalGrade — grade policy modes", () => {
  const graded = [
    { grade: 80, weight: 100 },
    { grade: 60, weight: 300 },
  ];

  it("SIMPLE_AVERAGE → unweighted mean", () => {
    expect(computeCourseFinalGrade(graded, COURSE_FINAL_GRADE_MODE.SIMPLE_AVERAGE)).toBe(70);
  });

  it("WEIGHTED_BY_HOURS → weighted by level weight", () => {
    // (80*100 + 60*300) / 400 = 65
    expect(computeCourseFinalGrade(graded, COURSE_FINAL_GRADE_MODE.WEIGHTED_BY_HOURS)).toBe(65);
  });

  it("WEIGHTED_BY_HOURS falls back to simple mean when a weight is missing", () => {
    expect(
      computeCourseFinalGrade(
        [
          { grade: 80, weight: 100 },
          { grade: 60, weight: null },
        ],
        COURSE_FINAL_GRADE_MODE.WEIGHTED_BY_HOURS
      )
    ).toBe(70);
  });

  it("returns null when there are no graded levels", () => {
    expect(computeCourseFinalGrade([], COURSE_FINAL_GRADE_MODE.WEIGHTED_BY_HOURS)).toBeNull();
  });

  it("throws for a not-yet-implemented mode", () => {
    expect(() => computeCourseFinalGrade(graded, COURSE_FINAL_GRADE_MODE.WEIGHTED_BY_CREDITS)).toThrow(
      /não está implementado/
    );
  });

  it("the strategy honours policy.finalGradeMode (SIMPLE_AVERAGE ignores weights)", () => {
    const policy = { ...DEFAULT_COURSE_COMPLETION_POLICY, finalGradeMode: COURSE_FINAL_GRADE_MODE.SIMPLE_AVERAGE };
    const d = decide([L("l1", 1, 100), L("l2", 2, 300)], [P("l1", "PASSED", 80, 10), P("l2", "PASSED", 60, 10)], policy);
    expect(d.finalGrade).toBe(70); // simple mean despite weights present
  });
});
