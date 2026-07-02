import { describe, it, expect, vi, beforeEach } from "vitest";
import type { CourseCompletionDecision } from "@/modules/prerequisites/engines/course-completion.engine";

// Covers the persistence path (completedAt stability + transition signal), the
// IO wrapper (enrollment lookup, active-only levels), and the audit/event side
// effects emitted ONLY on the not-completed → COMPLETED transition.

const mocks = vi.hoisted(() => ({
  enrollmentFindFirst: vi.fn(),
  courseLevelFindMany: vi.fn(),
  scpFindFirst: vi.fn(),
  scpUpsert: vi.fn(),
  auditCreate: vi.fn(),
  findLevelProgress: vi.fn(),
  publish: vi.fn(),
}));

vi.mock("@/server/db", () => ({
  getDb: vi.fn(async () => ({
    enrollment: { findFirst: mocks.enrollmentFindFirst },
    courseLevel: { findMany: mocks.courseLevelFindMany },
    studentCourseProgress: { findFirst: mocks.scpFindFirst, upsert: mocks.scpUpsert },
    auditLog: { create: mocks.auditCreate },
  })),
}));
vi.mock("@/modules/prerequisites/repositories/student-level-progress.repository", () => ({
  findLevelProgressByEnrollment: mocks.findLevelProgress,
}));
vi.mock("@/server/events/event-publisher", () => ({
  eventPublisher: { publish: mocks.publish },
}));

import {
  evaluateCourseCompletion,
  persistCourseCompletion,
} from "@/modules/prerequisites/engines/course-completion.engine";

// Echo the upserted row back as a persisted record so the mapper can read it.
function upsertEcho(args: { create: Record<string, unknown> }) {
  return {
    id: "scp-1",
    ...args.create,
    createdAt: new Date("2020-01-01"),
    updatedAt: new Date("2020-01-01"),
    course: null,
  };
}

// A fake Prisma-ish client for direct persistCourseCompletion tests.
function fakeClient(existing: { status: string; completedAt: Date | null } | null) {
  return {
    studentCourseProgress: {
      findFirst: vi.fn(async () => existing),
      upsert: vi.fn(async (args: { create: Record<string, unknown> }) => upsertEcho(args)),
    },
  };
}

const completed: CourseCompletionDecision = {
  status: "COMPLETED",
  finalGrade: 75,
  earnedCredits: 20,
  progressReason: "Todos os níveis concluídos",
  completionReason: "ALL_LEVELS_COMPLETED",
  completed: true,
};
const inProgress: CourseCompletionDecision = {
  status: "IN_PROGRESS",
  finalGrade: 40,
  earnedCredits: 5,
  progressReason: null,
  completionReason: "LEVEL_IN_PROGRESS",
  completed: false,
};

const baseParams = {
  organizationId: "org-1",
  enrollmentId: "e1",
  studentId: "s1",
  courseId: "c1",
};

describe("persistCourseCompletion — completedAt stability", () => {
  it("stamps completedAt = now on the first completion", async () => {
    const now = new Date("2026-07-01T10:00:00Z");
    const client = fakeClient(null);

    const res = await persistCourseCompletion(client as never, { ...baseParams, decision: completed, now });

    expect(res.progress.completedAt).toEqual(now);
    expect(res.transitionedToCompleted).toBe(true);
  });

  it("preserves the original completedAt on a repeated completion recalculation", async () => {
    const earlier = new Date("2026-06-01T00:00:00Z");
    const now = new Date("2026-07-01T10:00:00Z");
    const client = fakeClient({ status: "COMPLETED", completedAt: earlier });

    const res = await persistCourseCompletion(client as never, { ...baseParams, decision: completed, now });

    expect(res.progress.completedAt).toEqual(earlier); // NOT rewritten to now
    expect(res.transitionedToCompleted).toBe(false); // already completed → no transition
  });

  it("clears completedAt when the course reverts from completed", async () => {
    const earlier = new Date("2026-06-01T00:00:00Z");
    const now = new Date("2026-07-01T10:00:00Z");
    const client = fakeClient({ status: "COMPLETED", completedAt: earlier });

    const res = await persistCourseCompletion(client as never, { ...baseParams, decision: inProgress, now });

    expect(res.progress.completedAt).toBeNull();
    expect(res.transitionedToCompleted).toBe(false);
  });

  it("produces identical output regardless of client (base vs tx) — single writer, no drift", async () => {
    const now = new Date("2026-07-01T10:00:00Z");
    const existing = { status: "IN_PROGRESS", completedAt: null };

    const a = await persistCourseCompletion(fakeClient(existing) as never, { ...baseParams, decision: completed, now });
    const b = await persistCourseCompletion(fakeClient(existing) as never, { ...baseParams, decision: completed, now });

    expect(a.progress.completedAt).toEqual(b.progress.completedAt);
    expect(a.transitionedToCompleted).toBe(b.transitionedToCompleted);
    expect(a.progress.status).toBe(b.progress.status);
  });
});

describe("evaluateCourseCompletion — IO wrapper", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.enrollmentFindFirst.mockResolvedValue({ studentId: "s1", courseId: "c1" });
    mocks.courseLevelFindMany.mockResolvedValue([{ id: "l1", order: 1, totalHours: 100 }]);
    mocks.findLevelProgress.mockResolvedValue([
      { courseLevelId: "l1", finalGrade: 80, earnedCredits: 10, status: "PASSED" },
    ]);
    mocks.scpFindFirst.mockResolvedValue(null);
    mocks.scpUpsert.mockImplementation(async (args: { create: Record<string, unknown> }) => upsertEcho(args));
  });

  it("throws when the enrollment is not found", async () => {
    mocks.enrollmentFindFirst.mockResolvedValue(null);
    await expect(evaluateCourseCompletion("e-missing", "org-1")).rejects.toThrow("Matrícula não encontrada");
  });

  it("reads only ACTIVE course levels", async () => {
    await evaluateCourseCompletion("e1", "org-1");
    expect(mocks.courseLevelFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ courseId: "c1", status: "ACTIVE" }) })
    );
  });

  it("emits audit + domain event on the transition to COMPLETED", async () => {
    await evaluateCourseCompletion("e1", "org-1", "actor-1");

    expect(mocks.auditCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          entity: "StudentCourseProgress",
          action: "course_completion.completed",
          actorId: "actor-1",
        }),
      })
    );
    expect(mocks.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "student_course.completed",
        aggregateType: "STUDENT",
        aggregateId: "s1",
      })
    );
  });

  it("records actorId = null for a system-driven cascade (no actor supplied)", async () => {
    await evaluateCourseCompletion("e1", "org-1");
    expect(mocks.auditCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ actorId: null }) })
    );
  });

  it("does NOT emit when the course was already COMPLETED (no transition)", async () => {
    mocks.scpFindFirst.mockResolvedValue({ status: "COMPLETED", completedAt: new Date("2026-06-01") });

    await evaluateCourseCompletion("e1", "org-1");

    expect(mocks.auditCreate).not.toHaveBeenCalled();
    expect(mocks.publish).not.toHaveBeenCalled();
  });

  it("emits a reopened event when a completed course reverts to IN_PROGRESS", async () => {
    mocks.scpFindFirst.mockResolvedValue({ status: "COMPLETED", completedAt: new Date("2026-06-01") });
    mocks.findLevelProgress.mockResolvedValue([
      { courseLevelId: "l1", finalGrade: null, earnedCredits: 0, status: "IN_PROGRESS" },
    ]);

    await evaluateCourseCompletion("e1", "org-1", "actor-1");

    expect(mocks.auditCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: "course_completion.reopened" }) })
    );
    expect(mocks.publish).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: "student_course.reopened", aggregateId: "s1" })
    );
  });

  it("does NOT emit when the course is still IN_PROGRESS", async () => {
    mocks.findLevelProgress.mockResolvedValue([
      { courseLevelId: "l1", finalGrade: null, earnedCredits: 0, status: "IN_PROGRESS" },
    ]);

    await evaluateCourseCompletion("e1", "org-1");

    expect(mocks.auditCreate).not.toHaveBeenCalled();
    expect(mocks.publish).not.toHaveBeenCalled();
  });
});
