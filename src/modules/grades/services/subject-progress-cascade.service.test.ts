import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  levelSubjectFindFirst: vi.fn(),
  findResultsByEnrollmentAndLevelSubject: vi.fn(),
  upsertStudentSubjectProgress: vi.fn(),
  findActivePolicyForLevelSubject: vi.fn(),
  findActiveComponentsByPolicy: vi.fn(),
  recalculateStudentLevelProgress: vi.fn(),
  auditLog: vi.fn(),
  publish: vi.fn(),
}));

vi.mock("@/server/db", () => ({
  getDb: vi.fn(async () => ({ levelSubject: { findFirst: mocks.levelSubjectFindFirst } })),
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
});

describe("recalculateSubjectProgressCascade", () => {
  it("derives progress from the canonical StudentAssessmentResult (single source of truth)", async () => {
    mocks.findResultsByEnrollmentAndLevelSubject.mockResolvedValue([
      { assessmentComponentId: "c1", grade: 80, normalizedGrade: 80 },
    ]);

    const progress = await recalculateSubjectProgressCascade(context, params);

    // Reads the canonical grade store, keyed by enrollment + level subject.
    expect(mocks.findResultsByEnrollmentAndLevelSubject).toHaveBeenCalledWith("e1", "ls1", "org-1");
    expect(progress.status).toBe("PASSED");
    expect(progress.finalGrade).toBe(80);
  });

  it("cascades to level progress (subject -> level -> course)", async () => {
    mocks.findResultsByEnrollmentAndLevelSubject.mockResolvedValue([
      { assessmentComponentId: "c1", grade: 80, normalizedGrade: 80 },
    ]);

    await recalculateSubjectProgressCascade(context, params);

    expect(mocks.recalculateStudentLevelProgress).toHaveBeenCalledWith("e1", "cl1", "org-1");
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
    expect(mocks.recalculateStudentLevelProgress).toHaveBeenCalledWith("e1", "cl1", "org-1");
  });
});
