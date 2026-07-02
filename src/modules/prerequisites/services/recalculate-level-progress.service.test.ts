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
