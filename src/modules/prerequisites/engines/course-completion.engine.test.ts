import { describe, it, expect } from "vitest";
import {
  decideCourseCompletion,
  type CourseLevelInput,
  type CourseLevelProgressInput,
} from "@/modules/prerequisites/engines/course-completion.engine";

function level(id: string, order: number): CourseLevelInput {
  return { id, order };
}

function lp(
  courseLevelId: string,
  status: string,
  finalGrade: number | null = null,
  earnedCredits: number | null = 0
): CourseLevelProgressInput {
  return { courseLevelId, status, finalGrade, earnedCredits };
}

describe("decideCourseCompletion", () => {
  const levels = [level("l1", 1), level("l2", 2)];

  it("all levels PASSED → COMPLETED", () => {
    const decision = decideCourseCompletion(levels, [
      lp("l1", "PASSED", 80, 10),
      lp("l2", "PASSED", 70, 10),
    ]);
    expect(decision.status).toBe("COMPLETED");
    expect(decision.completed).toBe(true);
    expect(decision.finalGrade).toBe(75);
    expect(decision.earnedCredits).toBe(20);
    // Engine wrapper surfaces the derived machine-readable reason.
    expect(decision.completionReason).toBe("ALL_LEVELS_COMPLETED");
  });

  it("clean PROMOTED levels also complete the course", () => {
    const decision = decideCourseCompletion(levels, [
      lp("l1", "PROMOTED", 80, 10),
      lp("l2", "COMPLETED", 70, 10),
    ]);
    expect(decision.status).toBe("COMPLETED");
    expect(decision.completed).toBe(true);
  });

  // ── Scenario 9 / regression: promoted-with-pending must not complete ──────────
  it("a PROMOTED_WITH_PENDING_SUBJECTS level does NOT complete the course", () => {
    const decision = decideCourseCompletion(levels, [
      lp("l1", "PROMOTED_WITH_PENDING_SUBJECTS", 65, 8),
      lp("l2", "PASSED", 80, 10),
    ]);
    expect(decision.status).toBe("IN_PROGRESS");
    expect(decision.completed).toBe(false);
  });

  it("a FAILED level with nothing in progress → FAILED", () => {
    const decision = decideCourseCompletion(levels, [
      lp("l1", "FAILED", 30, 0),
      lp("l2", "PASSED", 80, 10),
    ]);
    expect(decision.status).toBe("FAILED");
    expect(decision.completed).toBe(false);
  });

  it("a missing / NOT_STARTED level keeps the course IN_PROGRESS", () => {
    const decision = decideCourseCompletion(levels, [lp("l1", "PASSED", 80, 10)]);
    expect(decision.status).toBe("IN_PROGRESS");
    expect(decision.completed).toBe(false);
  });

  it("no level progress at all → NOT_STARTED", () => {
    const decision = decideCourseCompletion(levels, []);
    expect(decision.status).toBe("NOT_STARTED");
    expect(decision.completed).toBe(false);
  });

  it("no course levels defined → NOT_STARTED", () => {
    const decision = decideCourseCompletion([], []);
    expect(decision.status).toBe("NOT_STARTED");
  });
});

// ── Ambiguous level statuses must keep the course IN_PROGRESS ──────────────────
describe("decideCourseCompletion — ambiguous level statuses", () => {
  const levels = [level("l1", 1), level("l2", 2)];

  for (const status of [
    "ELIGIBLE_TO_PROGRESS",
    "RECOVERY_REQUIRED",
    "BLOCKED",
    "PROMOTED_WITH_PENDING_SUBJECTS",
  ]) {
    it(`${status} on a level → IN_PROGRESS, not COMPLETED`, () => {
      const decision = decideCourseCompletion(levels, [
        lp("l1", status, 60, 8),
        lp("l2", "PASSED", 80, 10),
      ]);
      expect(decision.status).toBe("IN_PROGRESS");
      expect(decision.completed).toBe(false);
    });
  }

  it("FAILED + IN_PROGRESS together → IN_PROGRESS, not FAILED", () => {
    const decision = decideCourseCompletion(levels, [
      lp("l1", "FAILED", 30, 0),
      lp("l2", "IN_PROGRESS", null, 0),
    ]);
    expect(decision.status).toBe("IN_PROGRESS");
    expect(decision.completed).toBe(false);
  });

  it("an unrecognised level status fails safe to IN_PROGRESS (never auto-completes)", () => {
    const decision = decideCourseCompletion(levels, [
      lp("l1", "SOME_NEW_STATUS", 90, 5),
      lp("l2", "PASSED", 80, 10),
    ]);
    expect(decision.status).toBe("IN_PROGRESS");
    expect(decision.completed).toBe(false);
  });
});

// ── Course finalGrade weighting ────────────────────────────────────────────────
describe("decideCourseCompletion — finalGrade weighting", () => {
  const w = (id: string, order: number, weight: number | null): CourseLevelInput => ({ id, order, weight });

  it("weights level grades by CourseLevel weight when every graded level has one", () => {
    const decision = decideCourseCompletion(
      [w("l1", 1, 100), w("l2", 2, 300)],
      [lp("l1", "PASSED", 80, 10), lp("l2", "PASSED", 60, 10)]
    );
    // (80*100 + 60*300) / 400 = 65
    expect(decision.finalGrade).toBe(65);
    expect(decision.status).toBe("COMPLETED");
  });

  it("falls back to a simple mean when no level has a usable weight", () => {
    const decision = decideCourseCompletion(
      [level("l1", 1), level("l2", 2)],
      [lp("l1", "PASSED", 80, 10), lp("l2", "PASSED", 60, 10)]
    );
    expect(decision.finalGrade).toBe(70);
  });

  it("falls back to a simple mean when weights are mixed (some missing)", () => {
    const decision = decideCourseCompletion(
      [w("l1", 1, 100), w("l2", 2, null)],
      [lp("l1", "PASSED", 80, 10), lp("l2", "PASSED", 60, 10)]
    );
    expect(decision.finalGrade).toBe(70); // simple mean, not weighted
  });

  it("ungraded levels do not contribute to finalGrade", () => {
    const decision = decideCourseCompletion(
      [w("l1", 1, 100), w("l2", 2, 100)],
      [lp("l1", "PASSED", 80, 10), lp("l2", "IN_PROGRESS", null, 0)]
    );
    expect(decision.finalGrade).toBe(80); // only the graded level
    expect(decision.status).toBe("IN_PROGRESS");
  });
});
