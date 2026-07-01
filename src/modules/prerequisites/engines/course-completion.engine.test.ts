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
