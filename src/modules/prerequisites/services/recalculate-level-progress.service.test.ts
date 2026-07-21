import { describe, it, expect, vi, beforeEach } from "vitest";

// Verifies the wiring of the STABLE completedAt into StudentLevelProgress:
// recalculateStudentLevelProgress reads the prior row (in-tx) and resolves a
// stable completedAt from the FINAL level status. The transition matrix itself
// is exhaustively covered in shared/lib/completed-at.test.ts.

const mocks = vi.hoisted(() => ({
  enrollmentFindFirst: vi.fn(),
  levelSubjectFindMany: vi.fn(),
  subjectProgressFindMany: vi.fn(),
  levelProgressFindFirst: vi.fn(),
  upsertStudentLevelProgress: vi.fn(),
  evaluateLevelProgression: vi.fn(),
  evaluateCourseCompletion: vi.fn(),
}));

vi.mock("@/server/db", () => ({
  getDb: vi.fn(async () => ({
    enrollment: { findFirst: mocks.enrollmentFindFirst },
    levelSubject: { findMany: mocks.levelSubjectFindMany },
    studentSubjectProgress: { findMany: mocks.subjectProgressFindMany },
    studentLevelProgress: { findFirst: mocks.levelProgressFindFirst },
  })),
}));
vi.mock("@/modules/prerequisites/repositories/student-level-progress.repository", () => ({
  upsertStudentLevelProgress: mocks.upsertStudentLevelProgress,
}));
vi.mock("@/modules/prerequisites/engines/level-progression.engine", () => ({
  evaluateLevelProgression: mocks.evaluateLevelProgression,
  computeWeightedLevelGrade: () => null,
}));
vi.mock("@/modules/prerequisites/engines/course-completion.engine", () => ({
  evaluateCourseCompletion: mocks.evaluateCourseCompletion,
}));

import { recalculateStudentLevelProgress } from "@/modules/prerequisites/services/recalculate-level-progress.service";
import { PROGRESSION_OUTCOME } from "@/modules/prerequisites/types";

const D1 = new Date("2026-03-01T00:00:00Z");
const ORG = "org-1";
const ENR = "e1";
const LVL = "cl1";

const completedAtArg = () => mocks.upsertStudentLevelProgress.mock.calls[0][0].completedAt as Date | null;
const statusArg = () => mocks.upsertStudentLevelProgress.mock.calls[0][0].status as string;

function setSubjects(allPassed: boolean) {
  mocks.levelSubjectFindMany.mockResolvedValue([{ id: "ls1", isRequired: true, credits: 1, workloadHours: 10 }]);
  mocks.subjectProgressFindMany.mockResolvedValue([
    { levelSubjectId: "ls1", status: allPassed ? "PASSED" : "IN_PROGRESS", finalGrade: 80 },
  ]);
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.enrollmentFindFirst.mockResolvedValue({ studentId: "s1", courseId: "c1" });
  mocks.upsertStudentLevelProgress.mockResolvedValue(undefined);
  mocks.evaluateCourseCompletion.mockResolvedValue(undefined);
  // Default: no auto-promotion outcome (keeps the computed level status).
  mocks.evaluateLevelProgression.mockResolvedValue({ outcome: PROGRESSION_OUTCOME.BLOCKED, reason: "" });
});

describe("recalculateStudentLevelProgress — stable completedAt", () => {
  it("stamps completedAt when the level first becomes PASSED", async () => {
    setSubjects(true);
    mocks.levelProgressFindFirst.mockResolvedValue(null); // new row

    await recalculateStudentLevelProgress(ENR, LVL, ORG);

    expect(statusArg()).toBe("PASSED");
    expect(completedAtArg()).toBeInstanceOf(Date);
  });

  it("preserves the original completedAt when the level stays PASSED (idempotent recalc)", async () => {
    setSubjects(true);
    mocks.levelProgressFindFirst.mockResolvedValue({ status: "PASSED", completedAt: D1 });

    await recalculateStudentLevelProgress(ENR, LVL, ORG);

    expect(statusArg()).toBe("PASSED");
    expect(completedAtArg()).toEqual(D1); // NOT moved forward
  });

  it("does NOT set completedAt for PROMOTED_WITH_PENDING_SUBJECTS (not academically complete)", async () => {
    setSubjects(false); // some pending → IN_PROGRESS base status
    mocks.levelProgressFindFirst.mockResolvedValue(null);
    mocks.evaluateLevelProgression.mockResolvedValue({
      outcome: PROGRESSION_OUTCOME.PROMOTED_WITH_PENDING_SUBJECTS,
      reason: "Promovido com pendências",
    });

    await recalculateStudentLevelProgress(ENR, LVL, ORG);

    expect(statusArg()).toBe("PROMOTED_WITH_PENDING_SUBJECTS");
    expect(completedAtArg()).toBeNull();
  });

  it("sets completedAt when PROMOTED_WITH_PENDING_SUBJECTS becomes PROMOTED", async () => {
    setSubjects(true); // all passed → PASSED base status
    mocks.levelProgressFindFirst.mockResolvedValue({ status: "PROMOTED_WITH_PENDING_SUBJECTS", completedAt: null });
    mocks.evaluateLevelProgression.mockResolvedValue({ outcome: PROGRESSION_OUTCOME.PROMOTED, reason: "" });

    await recalculateStudentLevelProgress(ENR, LVL, ORG);

    expect(statusArg()).toBe("PROMOTED");
    expect(completedAtArg()).toBeInstanceOf(Date);
  });

  it("clears completedAt when a previously-completed level drops to a non-terminal status", async () => {
    setSubjects(false); // IN_PROGRESS
    mocks.levelProgressFindFirst.mockResolvedValue({ status: "PASSED", completedAt: D1 });

    await recalculateStudentLevelProgress(ENR, LVL, ORG);

    expect(statusArg()).toBe("IN_PROGRESS");
    expect(completedAtArg()).toBeNull();
  });
});

describe("recalculateStudentLevelProgress — recovery lifecycle", () => {
  function setRecovery() {
    mocks.levelSubjectFindMany.mockResolvedValue([{ id: "ls1", isRequired: true, credits: 1, workloadHours: 10 }]);
    mocks.subjectProgressFindMany.mockResolvedValue([
      { levelSubjectId: "ls1", status: "RECOVERY_REQUIRED", finalGrade: 45 },
    ]);
  }

  it("a required subject in RECOVERY_REQUIRED makes the level RECOVERY_REQUIRED (not FAILED)", async () => {
    setRecovery();
    mocks.levelProgressFindFirst.mockResolvedValue(null);

    await recalculateStudentLevelProgress(ENR, LVL, ORG);

    expect(statusArg()).toBe("RECOVERY_REQUIRED");
    expect(statusArg()).not.toBe("FAILED");
  });

  it("a RECOVERY_REQUIRED level has completedAt = null and does not evaluate progression", async () => {
    setRecovery();
    mocks.levelProgressFindFirst.mockResolvedValue(null);

    await recalculateStudentLevelProgress(ENR, LVL, ORG);

    expect(completedAtArg()).toBeNull();
    // Recovery pending → the level is not eligible for progression.
    expect(mocks.evaluateLevelProgression).not.toHaveBeenCalled();
  });

  it("after recovery passes, the level recalculates to PASSED", async () => {
    setSubjects(true); // all subjects PASSED
    mocks.levelProgressFindFirst.mockResolvedValue({ status: "RECOVERY_REQUIRED", completedAt: null });

    await recalculateStudentLevelProgress(ENR, LVL, ORG);

    expect(statusArg()).toBe("PASSED");
    expect(completedAtArg()).toBeInstanceOf(Date);
  });
});

describe("recalculateStudentLevelProgress — attendance INCOMPLETE (Phase 5)", () => {
  it("9. a required INCOMPLETE subject does NOT make the level FAILED", async () => {
    mocks.levelSubjectFindMany.mockResolvedValue([{ id: "ls1", isRequired: true, credits: 1, workloadHours: 10 }]);
    mocks.subjectProgressFindMany.mockResolvedValue([{ levelSubjectId: "ls1", status: "INCOMPLETE", finalGrade: 80 }]);
    mocks.levelProgressFindFirst.mockResolvedValue(null);

    await recalculateStudentLevelProgress(ENR, LVL, ORG);

    expect(statusArg()).toBe("IN_PROGRESS");
    expect(statusArg()).not.toBe("FAILED");
    expect(completedAtArg()).toBeNull();
  });

  it("10. an INCOMPLETE subject keeps the level out of PASSED (prevents completion)", async () => {
    mocks.levelSubjectFindMany.mockResolvedValue([
      { id: "ls1", isRequired: true, credits: 1, workloadHours: 10 },
      { id: "ls2", isRequired: true, credits: 1, workloadHours: 10 },
    ]);
    mocks.subjectProgressFindMany.mockResolvedValue([
      { levelSubjectId: "ls1", status: "PASSED", finalGrade: 80 },
      { levelSubjectId: "ls2", status: "INCOMPLETE", finalGrade: 80 },
    ]);
    mocks.levelProgressFindFirst.mockResolvedValue(null);

    await recalculateStudentLevelProgress(ENR, LVL, ORG);

    expect(statusArg()).not.toBe("PASSED");
    expect(statusArg()).toBe("IN_PROGRESS");
  });

  it("a genuine FAILED required subject still fails the level even with an INCOMPLETE sibling", async () => {
    mocks.levelSubjectFindMany.mockResolvedValue([
      { id: "ls1", isRequired: true, credits: 1, workloadHours: 10 },
      { id: "ls2", isRequired: true, credits: 1, workloadHours: 10 },
    ]);
    mocks.subjectProgressFindMany.mockResolvedValue([
      { levelSubjectId: "ls1", status: "FAILED", finalGrade: 20 },
      { levelSubjectId: "ls2", status: "INCOMPLETE", finalGrade: 80 },
    ]);
    mocks.levelProgressFindFirst.mockResolvedValue(null);

    await recalculateStudentLevelProgress(ENR, LVL, ORG);

    expect(statusArg()).toBe("FAILED"); // INCOMPLETE does not mask a real failure
  });
});

describe("recalculateStudentLevelProgress — F-H2 progression-changed event", () => {
  it("collects STUDENT_LEVEL_PROGRESSION_CHANGED when the level status actually changes", async () => {
    setSubjects(true); // → PASSED
    mocks.levelProgressFindFirst.mockResolvedValue({ status: "IN_PROGRESS", completedAt: null });
    const events: Array<{ eventType: string; payload: Record<string, unknown> }> = [];

    await recalculateStudentLevelProgress(ENR, LVL, ORG, { events });

    const evt = events.find((e) => e.eventType === "student_level_progression.changed");
    expect(evt).toBeDefined();
    expect(evt!.payload).toMatchObject({
      studentId: "s1",
      enrollmentId: ENR,
      courseLevelId: LVL,
      previousStatus: "IN_PROGRESS",
      currentStatus: "PASSED",
    });
  });

  it("does NOT emit when the level status is unchanged (no-op recompute)", async () => {
    setSubjects(true); // → PASSED
    mocks.levelProgressFindFirst.mockResolvedValue({ status: "PASSED", completedAt: D1 });
    const events: Array<{ eventType: string }> = [];

    await recalculateStudentLevelProgress(ENR, LVL, ORG, { events });

    expect(events.some((e) => e.eventType === "student_level_progression.changed")).toBe(false);
  });
});
