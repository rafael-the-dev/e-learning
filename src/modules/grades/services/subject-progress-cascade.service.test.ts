import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  levelSubjectFindFirst: vi.fn(),
  subjectProgressFindFirst: vi.fn(),
  findResultsByEnrollmentAndLevelSubject: vi.fn(),
  upsertStudentSubjectProgress: vi.fn(),
  findActivePolicyForLevelSubject: vi.fn(),
  findActiveComponentsByPolicy: vi.fn(),
  recalculateStudentLevelProgress: vi.fn(),
  auditLog: vi.fn(),
  publish: vi.fn(),
}));

vi.mock("@/server/db", () => ({
  getDb: vi.fn(async () => ({
    levelSubject: { findFirst: mocks.levelSubjectFindFirst },
    studentSubjectProgress: { findFirst: mocks.subjectProgressFindFirst },
  })),
}));
vi.mock("@/modules/grades/repositories/student-assessment-result.repository", () => ({
  findResultsByEnrollmentAndLevelSubject: mocks.findResultsByEnrollmentAndLevelSubject,
}));
vi.mock("@/modules/assessments/repositories/student-subject-progress.repository", () => ({
  upsertStudentSubjectProgress: mocks.upsertStudentSubjectProgress,
}));
vi.mock("@/modules/assessments/repositories/assessment-policy.repository", () => ({
  findActivePolicyForLevelSubject: mocks.findActivePolicyForLevelSubject,
}));
vi.mock("@/modules/assessments/repositories/assessment-component.repository", () => ({
  findActiveComponentsByPolicy: mocks.findActiveComponentsByPolicy,
}));
vi.mock("@/modules/prerequisites/services/recalculate-level-progress.service", () => ({
  recalculateStudentLevelProgress: mocks.recalculateStudentLevelProgress,
}));
vi.mock("@/modules/audit-logs/services/audit.service", () => ({
  auditService: { log: mocks.auditLog },
}));
vi.mock("@/server/events/event-publisher", () => ({
  eventPublisher: { publish: mocks.publish },
}));

import { recalculateSubjectProgressCascade } from "@/modules/grades/services/subject-progress-cascade.service";
import type { AuthContext } from "@/server/auth/context";

const context = { organizationId: "org-1", userId: "u1" } as AuthContext;
const params = { studentId: "s1", enrollmentId: "e1", levelSubjectId: "ls1" };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.levelSubjectFindFirst.mockResolvedValue({
    minimumPassingGrade: 50,
    minimumAttendancePercentage: null,
    courseLevelId: "cl1",
  });
  mocks.findActivePolicyForLevelSubject.mockResolvedValue({
    id: "p1",
    calculationMethod: "SIMPLE_AVERAGE",
    roundingMethod: "NONE",
    minimumPassingGrade: 50,
    allowRecovery: false,
  });
  mocks.findActiveComponentsByPolicy.mockResolvedValue([
    { id: "c1", weight: 1, maxGrade: 100, isRequired: true },
  ]);
  mocks.upsertStudentSubjectProgress.mockImplementation(async (data: any) => ({
    id: "prog-1",
    ...data,
  }));
  mocks.recalculateStudentLevelProgress.mockResolvedValue(undefined);
  mocks.subjectProgressFindFirst.mockResolvedValue(null); // new row by default
});

describe("recalculateSubjectProgressCascade", () => {
  it("derives progress from the canonical StudentAssessmentResult (single source of truth)", async () => {
    mocks.findResultsByEnrollmentAndLevelSubject.mockResolvedValue([
      { assessmentComponentId: "c1", grade: 80, normalizedGrade: 80 },
    ]);

    const progress = await recalculateSubjectProgressCascade(context, params);

    // Reads the canonical grade store, keyed by enrollment + level subject.
    // A 4th arg (the db/tx client) is now threaded through for transactionality.
    expect(mocks.findResultsByEnrollmentAndLevelSubject).toHaveBeenCalledWith(
      "e1", "ls1", "org-1", expect.anything()
    );
    expect(progress.status).toBe("PASSED");
    expect(progress.finalGrade).toBe(80);
  });

  it("cascades to level progress (subject -> level -> course)", async () => {
    mocks.findResultsByEnrollmentAndLevelSubject.mockResolvedValue([
      { assessmentComponentId: "c1", grade: 80, normalizedGrade: 80 },
    ]);

    await recalculateSubjectProgressCascade(context, params);

    expect(mocks.recalculateStudentLevelProgress).toHaveBeenCalledWith("e1", "cl1", "org-1", undefined);
  });

  it("publishes STUDENT_SUBJECT_PASSED when the subject is passed", async () => {
    mocks.findResultsByEnrollmentAndLevelSubject.mockResolvedValue([
      { assessmentComponentId: "c1", grade: 90, normalizedGrade: 90 },
    ]);

    await recalculateSubjectProgressCascade(context, params);

    expect(mocks.publish).toHaveBeenCalledWith(
      expect.objectContaining({ payload: expect.objectContaining({ levelSubjectId: "ls1" }) })
    );
  });

  it("progression changes when a required grade is removed (invalidation/cancel path)", async () => {
    // With no canonical result (the grade was cancelled/invalidated and thus
    // excluded from the read), a required component is missing -> BLOCKED, not PASSED.
    mocks.findResultsByEnrollmentAndLevelSubject.mockResolvedValue([]);

    const progress = await recalculateSubjectProgressCascade(context, params);

    expect(progress.status).toBe("BLOCKED");
    expect(progress.finalGrade).toBeNull();
    // Still cascades so level/course progress reflect the removal.
    expect(mocks.recalculateStudentLevelProgress).toHaveBeenCalledWith("e1", "cl1", "org-1", undefined);
  });

  // completedAt wiring: the cascade reads the prior row and resolves a STABLE
  // completedAt (helper unit-tested exhaustively in completed-at.test.ts).
  describe("stable completedAt", () => {
    const D1 = new Date("2026-03-01T00:00:00Z");
    const passingResults = [{ assessmentComponentId: "c1", grade: 80, normalizedGrade: 80 }];
    const completedAtArg = () => mocks.upsertStudentSubjectProgress.mock.calls[0][0].completedAt as Date | null;

    it("stamps completedAt when a subject first becomes PASSED", async () => {
      mocks.subjectProgressFindFirst.mockResolvedValue(null); // new row
      mocks.findResultsByEnrollmentAndLevelSubject.mockResolvedValue(passingResults);

      await recalculateSubjectProgressCascade(context, params);

      expect(completedAtArg()).toBeInstanceOf(Date);
    });

    it("preserves the original completedAt when the subject stays PASSED (idempotent recalc)", async () => {
      mocks.subjectProgressFindFirst.mockResolvedValue({ status: "PASSED", completedAt: D1 });
      mocks.findResultsByEnrollmentAndLevelSubject.mockResolvedValue(passingResults);

      await recalculateSubjectProgressCascade(context, params);

      // A later recalculation must NOT move the date forward.
      expect(completedAtArg()).toEqual(D1);
    });

    it("clears completedAt when a previously-completed subject drops to a non-terminal status", async () => {
      mocks.subjectProgressFindFirst.mockResolvedValue({ status: "PASSED", completedAt: D1 });
      // No canonical results → required component missing → BLOCKED (non-terminal).
      mocks.findResultsByEnrollmentAndLevelSubject.mockResolvedValue([]);

      await recalculateSubjectProgressCascade(context, params);

      expect(completedAtArg()).toBeNull();
    });
  });
});
