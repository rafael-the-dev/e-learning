import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mocks ────────────────────────────────────────────────────────────────────
// The service runs everything inside db.$transaction(fn). We stub $transaction
// to invoke the callback with a fake tx client whose model methods we control.

const { tx, getDbMock, auditCreate, publish } = vi.hoisted(() => {
  const auditCreate = vi.fn();
  const tx = {
    levelProgressionRequest: { findFirst: vi.fn(), update: vi.fn() },
    enrollment: { findFirst: vi.fn(), update: vi.fn(), create: vi.fn() },
    levelSubject: { findMany: vi.fn() },
    studentSubjectProgress: { findMany: vi.fn() },
    studentLevelProgress: { findUnique: vi.fn(), upsert: vi.fn(), findMany: vi.fn() },
    courseLevel: { findMany: vi.fn() },
    studentCourseProgress: { findFirst: vi.fn(), upsert: vi.fn() },
  };
  const db = {
    $transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
    // Post-commit side effects (auditService bypass) use getDb().auditLog.create.
    auditLog: { create: auditCreate },
  };
  return { tx, getDbMock: vi.fn(async () => db), auditCreate, publish: vi.fn() };
});

vi.mock("@/server/db", () => ({ getDb: getDbMock }));
vi.mock("@/server/events/event-publisher", () => ({ eventPublisher: { publish } }));

import {
  approveProgressionRequest,
  rejectProgressionRequest,
  ProgressionRequestError,
} from "@/modules/prerequisites/services/review-progression-request.service";

const REQUEST = {
  id: "req-1",
  enrollmentId: "e1",
  studentId: "s1",
  courseId: "c1",
  policyId: "p1",
  fromLevelId: "L1",
  toLevelId: "L2",
};

function primeApproveHappyPath() {
  tx.levelProgressionRequest.findFirst.mockResolvedValue(REQUEST);
  tx.enrollment.findFirst.mockResolvedValue({ id: "e1", status: "ACTIVE" });
  tx.levelProgressionRequest.update.mockResolvedValue({});
  tx.enrollment.update.mockResolvedValue({});
  tx.levelSubject.findMany.mockResolvedValue([]);
  tx.studentSubjectProgress.findMany.mockResolvedValue([]);
  tx.studentLevelProgress.findUnique.mockResolvedValue(null);
  tx.studentLevelProgress.upsert.mockResolvedValue({});
  tx.courseLevel.findMany.mockResolvedValue([]);
  tx.studentLevelProgress.findMany.mockResolvedValue([]);
  tx.studentCourseProgress.findFirst.mockResolvedValue(null);
  tx.studentCourseProgress.upsert.mockResolvedValue({ id: "scp-1", finalGrade: null, completedAt: null });
}

describe("approveProgressionRequest", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("promotes the EXISTING enrollment to toLevelId (no new enrollment created)", async () => {
    primeApproveHappyPath();

    const result = await approveProgressionRequest({
      requestId: "req-1",
      organizationId: "org-1",
      actorId: "admin-1",
      reviewNotes: "ok",
    });

    // Enrollment is UPDATED in place, never created.
    expect(tx.enrollment.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "e1" },
        data: { currentLevelId: "L2" },
      })
    );
    expect(tx.enrollment.create).not.toHaveBeenCalled();

    // Request marked APPROVED with reviewer identity.
    expect(tx.levelProgressionRequest.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "req-1" },
        data: expect.objectContaining({ decision: "APPROVED", reviewedBy: "admin-1", reviewNotes: "ok" }),
      })
    );

    // Course progress recalculated within the same transaction.
    expect(tx.studentCourseProgress.upsert).toHaveBeenCalled();

    expect(result.toLevelId).toBe("L2");
    expect(result.fromLevelStatus).toBe("PROMOTED");
  });

  it("records PROMOTED_WITH_PENDING_SUBJECTS when a required subject is still pending", async () => {
    primeApproveHappyPath();
    tx.levelSubject.findMany.mockResolvedValue([
      { id: "ls1", isRequired: true, credits: 10 },
      { id: "ls2", isRequired: true, credits: 10 },
    ]);
    tx.studentSubjectProgress.findMany.mockResolvedValue([
      { levelSubjectId: "ls1", status: "PASSED" },
      // ls2 has no progress → pending
    ]);

    const result = await approveProgressionRequest({
      requestId: "req-1",
      organizationId: "org-1",
      actorId: "admin-1",
    });

    expect(result.fromLevelStatus).toBe("PROMOTED_WITH_PENDING_SUBJECTS");
  });

  it("emits course-completion audit + event when the approval completes the course", async () => {
    primeApproveHappyPath();
    // Both levels passed → course COMPLETED; not previously completed → transition.
    tx.courseLevel.findMany.mockResolvedValue([
      { id: "L1", order: 1, totalHours: 100 },
      { id: "L2", order: 2, totalHours: 100 },
    ]);
    tx.studentLevelProgress.findMany.mockResolvedValue([
      { courseLevelId: "L1", finalGrade: 80, earnedCredits: 10, status: "PASSED" },
      { courseLevelId: "L2", finalGrade: 70, earnedCredits: 10, status: "PROMOTED" },
    ]);
    tx.studentCourseProgress.findFirst.mockResolvedValue(null);
    tx.studentCourseProgress.upsert.mockImplementation(
      async (args: { create: Record<string, unknown> }) => ({
        id: "scp-1",
        ...args.create,
        createdAt: new Date(),
        updatedAt: new Date(),
        course: null,
      })
    );

    await approveProgressionRequest({
      requestId: "req-1",
      organizationId: "org-1",
      actorId: "admin-1",
    });

    expect(auditCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: "course_completion.completed", actorId: "admin-1" }),
      })
    );
    expect(publish).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: "student_course.completed", aggregateId: "s1" })
    );
  });

  it("does NOT emit completion side effects when the course is not completed", async () => {
    primeApproveHappyPath(); // courseLevel.findMany = [] → NOT_STARTED

    await approveProgressionRequest({
      requestId: "req-1",
      organizationId: "org-1",
      actorId: "admin-1",
    });

    expect(auditCreate).not.toHaveBeenCalled();
    expect(publish).not.toHaveBeenCalled();
  });

  it("throws when the request is not PENDING (already processed)", async () => {
    tx.levelProgressionRequest.findFirst.mockResolvedValue(null);

    await expect(
      approveProgressionRequest({ requestId: "req-1", organizationId: "org-1", actorId: "admin-1" })
    ).rejects.toBeInstanceOf(ProgressionRequestError);
    expect(tx.enrollment.update).not.toHaveBeenCalled();
  });

  it("throws when the enrollment is CANCELLED (stale request must not promote)", async () => {
    tx.levelProgressionRequest.findFirst.mockResolvedValue(REQUEST);
    tx.enrollment.findFirst.mockResolvedValue({ id: "e1", status: "CANCELLED" });

    await expect(
      approveProgressionRequest({ requestId: "req-1", organizationId: "org-1", actorId: "admin-1" })
    ).rejects.toBeInstanceOf(ProgressionRequestError);
    expect(tx.enrollment.update).not.toHaveBeenCalled();
  });
});

describe("rejectProgressionRequest", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("marks the request REJECTED with the reason and does NOT change the enrollment level", async () => {
    tx.levelProgressionRequest.findFirst.mockResolvedValue(REQUEST);
    tx.levelProgressionRequest.update.mockResolvedValue({});

    const result = await rejectProgressionRequest({
      requestId: "req-1",
      organizationId: "org-1",
      actorId: "admin-1",
      reason: "Média insuficiente",
    });

    expect(tx.levelProgressionRequest.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "req-1" },
        data: expect.objectContaining({
          decision: "REJECTED",
          reason: "Média insuficiente",
          reviewedBy: "admin-1",
        }),
      })
    );
    // currentLevelId is never touched on rejection.
    expect(tx.enrollment.update).not.toHaveBeenCalled();
    expect(result.enrollmentId).toBe("e1");
  });

  it("throws when the request is not PENDING", async () => {
    tx.levelProgressionRequest.findFirst.mockResolvedValue(null);

    await expect(
      rejectProgressionRequest({ requestId: "req-1", organizationId: "org-1", actorId: "admin-1", reason: "x reasons" })
    ).rejects.toBeInstanceOf(ProgressionRequestError);
    expect(tx.levelProgressionRequest.update).not.toHaveBeenCalled();
  });
});
