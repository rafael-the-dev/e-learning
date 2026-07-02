import { describe, it, expect, vi, beforeEach } from "vitest";

// =============================================================================
// TRANSACTIONAL GRADE CASCADE — mid-cascade failure / rollback contract
//
// Every grade mutation must be atomic: the canonical StudentAssessmentResult
// write, the GradeChangeLog and the subject/level/course cascade either all
// commit or none do, and NO domain event is published for a rolled-back change.
//
// These are unit tests, so there is no real database. Instead a fake
// `$transaction` models commit/rollback faithfully: repository write-mocks push
// a label into a STAGED buffer; on success the buffer is flushed to a COMMITTED
// store, on a thrown error the buffer is discarded (rollback). Asserting the
// committed store is empty after a failure therefore proves the writes were
// rolled back, and asserting `publish` was never called proves no event escaped
// for a rolled-back change.
//
// The failure is injected at the cascade entry (recalculateSubjectProgressCascade
// throws). Because the entire cascade — subject, level AND course recalculation —
// runs on the one transaction client, a throw at any depth has the identical
// rollback effect; the per-command tests below stand in for "failure after the
// canonical write", "level-progress failure", "course-progress failure", etc.
// =============================================================================

const mocks = vi.hoisted(() => {
  const state = { staged: [] as string[], committed: [] as string[] };
  return {
    state,
    // db / tx
    levelSubjectFindFirst: vi.fn(),
    // canonical + change log
    createGradeChangeLog: vi.fn(async () => {
      state.staged.push("grade_change_log");
      return { id: "log-1" };
    }),
    recalculateSubjectProgressCascade: vi.fn(),
    upsertStudentAssessmentResult: vi.fn(async (d: Record<string, unknown>) => {
      state.staged.push("student_assessment_result");
      return { id: "sar-1", ...d };
    }),
    updateStudentAssessmentResult: vi.fn(async (_id: string, _org: string, d: Record<string, unknown>) => {
      state.staged.push("student_assessment_result");
      return { id: "sar-1", grade: 40, normalizedGrade: 40, status: "GRADED", ...d };
    }),
    findResultById: vi.fn(),
    findResultByEnrollmentAndComponent: vi.fn(),
    // assessment config
    findComponentById: vi.fn(),
    findAssessmentPolicyById: vi.fn(),
    findAssessmentById: vi.fn(),
    // sidecar / retake / bulk
    updateAssessmentResult: vi.fn(async () => {
      state.staged.push("assessment_result_sidecar");
      return { id: "ar-1", status: "INVALIDATED" };
    }),
    upsertAssessmentResult: vi.fn(async () => {
      state.staged.push("assessment_result_sidecar");
      return { id: "ar-1", status: "GRADED" };
    }),
    updateAssessment: vi.fn(async () => {
      state.staged.push("assessment");
      return { id: "as-1", status: "GRADED" };
    }),
    findRetakeById: vi.fn(),
    updateAssessmentRetake: vi.fn(async () => {
      state.staged.push("assessment_retake");
      return { id: "rt-1", status: "GRADED" };
    }),
    findAssessmentResultById: vi.fn(),
    // audit + events
    auditLog: vi.fn(async () => {
      state.staged.push("audit_log");
    }),
    publish: vi.fn(),
  };
});

vi.mock("@/server/auth/rbac", () => ({
  getUserPermissions: vi.fn().mockResolvedValue([]),
  createAbility: () => ({ can: () => true }),
}));
vi.mock("@/server/auth/teacher-access", () => ({
  assertTeacherCanAccessEnrollment: vi.fn(),
  assertTeacherCanAccessAssessment: vi.fn(),
}));
vi.mock("@/server/db", () => {
  const db = {
    levelSubject: { findFirst: mocks.levelSubjectFindFirst },
    // Faithful commit/rollback: flush staged writes on success, discard on throw.
    async $transaction(fn: (tx: unknown) => unknown) {
      mocks.state.staged = [];
      try {
        const result = await fn({ __tx: true });
        mocks.state.committed.push(...mocks.state.staged);
        mocks.state.staged = [];
        return result;
      } catch (e) {
        mocks.state.staged = []; // ROLLBACK
        throw e;
      }
    },
  };
  return { getDb: vi.fn(async () => db) };
});
vi.mock("@/server/events/event-publisher", () => ({
  eventPublisher: { publish: mocks.publish },
}));
vi.mock("@/modules/audit-logs/services/audit.service", () => ({
  auditService: { log: mocks.auditLog },
}));
vi.mock("@/modules/grades/repositories/grade-change-log.repository", () => ({
  createGradeChangeLog: mocks.createGradeChangeLog,
}));
vi.mock("@/modules/grades/services/subject-progress-cascade.service", () => ({
  recalculateSubjectProgressCascade: mocks.recalculateSubjectProgressCascade,
}));
vi.mock("@/modules/grades/repositories/student-assessment-result.repository", () => ({
  upsertStudentAssessmentResult: mocks.upsertStudentAssessmentResult,
  updateStudentAssessmentResult: mocks.updateStudentAssessmentResult,
  findResultById: mocks.findResultById,
  findResultByEnrollmentAndComponent: mocks.findResultByEnrollmentAndComponent,
}));
vi.mock("@/modules/assessments/repositories/assessment-component.repository", () => ({
  findComponentById: mocks.findComponentById,
}));
vi.mock("@/modules/assessments/repositories/assessment-policy.repository", () => ({
  findAssessmentPolicyById: mocks.findAssessmentPolicyById,
}));
vi.mock("@/modules/assessments/repositories/assessment.repository", () => ({
  findAssessmentById: mocks.findAssessmentById,
  updateAssessment: mocks.updateAssessment,
}));
vi.mock("@/modules/assessments/repositories/assessment-result.repository", () => ({
  findResultById: mocks.findAssessmentResultById,
  updateAssessmentResult: mocks.updateAssessmentResult,
  upsertAssessmentResult: mocks.upsertAssessmentResult,
}));
vi.mock("@/modules/assessments/repositories/assessment-retake.repository", () => ({
  findRetakeById: mocks.findRetakeById,
  updateAssessmentRetake: mocks.updateAssessmentRetake,
}));
vi.mock("@/modules/grades/services/grade-calculation.service", () => ({
  gradeCalculationService: { normalizeGrade: (g: number) => g },
}));

import { CreateStudentAssessmentResultCommand } from "@/modules/grades/commands/create-student-assessment-result.command";
import { UpdateStudentAssessmentResultCommand } from "@/modules/grades/commands/update-student-assessment-result.command";
import { InvalidateAssessmentResultCommand } from "@/modules/assessments/commands/invalidate-assessment-result.command";
import { GradeAssessmentRetakeCommand } from "@/modules/assessments/commands/grade-assessment-retake.command";
import { BulkGradeAssessmentCommand } from "@/modules/assessments/commands/bulk-grade-assessment.command";

const ctx = { userId: "u1", organizationId: "org-1" } as never;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const input = (o: Record<string, unknown>) => o as any;

const CASCADE_FAILURE = new Error("cascade boom (mid-cascade failure)");

beforeEach(() => {
  vi.clearAllMocks();
  mocks.state.staged = [];
  mocks.state.committed = [];

  // Default config reads (success), so only the cascade decides failure.
  mocks.findComponentById.mockResolvedValue({ id: "c-1", maxGrade: 100, assessmentPolicyId: "p-1", status: "ACTIVE" });
  mocks.findAssessmentPolicyById.mockResolvedValue({ id: "p-1", levelSubjectId: "ls-1" });
  mocks.levelSubjectFindFirst.mockResolvedValue({ subjectId: "sub-1" });
  mocks.findAssessmentById.mockResolvedValue({
    id: "as-1", maxScore: 100, levelSubjectId: "ls-1", subjectId: "sub-1", assessmentComponentId: "c-1", status: "OPEN",
  });
  mocks.findResultByEnrollmentAndComponent.mockResolvedValue(null);

  // Cascade succeeds by default: stages derived writes and buffers one event.
  mocks.recalculateSubjectProgressCascade.mockImplementation(
    async (_c: unknown, _p: unknown, options: { events?: unknown[] }) => {
      mocks.state.staged.push("student_subject_progress", "student_level_progress", "student_course_progress");
      options?.events?.push({ eventType: "STUDENT_SUBJECT_PASSED", payload: {} } as never);
      return { id: "prog-1", status: "PASSED", finalGrade: 80 };
    }
  );
});

// ── 1. CREATE — cascade failure after the canonical write ─────────────────────
describe("CreateStudentAssessmentResultCommand — transactional rollback", () => {
  it("rolls back the StudentAssessmentResult and GradeChangeLog, and publishes nothing", async () => {
    mocks.recalculateSubjectProgressCascade.mockRejectedValue(CASCADE_FAILURE);

    await expect(
      new CreateStudentAssessmentResultCommand(
        input({ studentId: "s1", enrollmentId: "e1", assessmentComponentId: "c-1", grade: 75, notes: null }),
        ctx
      ).execute()
    ).rejects.toThrow(CASCADE_FAILURE);

    // Both the canonical write and the change log were attempted inside the tx…
    expect(mocks.upsertStudentAssessmentResult).toHaveBeenCalled();
    expect(mocks.createGradeChangeLog).toHaveBeenCalled();
    // …but nothing committed (rolled back) and no event escaped.
    expect(mocks.state.committed).toEqual([]);
    expect(mocks.publish).not.toHaveBeenCalled();
  });

  it("commits everything and publishes events on the success path", async () => {
    await new CreateStudentAssessmentResultCommand(
      input({ studentId: "s1", enrollmentId: "e1", assessmentComponentId: "c-1", grade: 75, notes: null }),
      ctx
    ).execute();

    // Canonical write, audit, change log and derived progress all committed together.
    expect(mocks.state.committed).toEqual(
      expect.arrayContaining([
        "student_assessment_result",
        "audit_log",
        "grade_change_log",
        "student_subject_progress",
        "student_level_progress",
        "student_course_progress",
      ])
    );
    // Event published only AFTER commit.
    expect(mocks.publish).toHaveBeenCalledTimes(1);
  });
});

// ── 2. UPDATE — cascade (level-progress) failure ──────────────────────────────
describe("UpdateStudentAssessmentResultCommand — transactional rollback", () => {
  it("rolls the canonical grade back to its previous value and leaves no partial progress", async () => {
    mocks.findResultById.mockResolvedValue({
      id: "sar-1", assessmentComponentId: "c-1", grade: 40, normalizedGrade: 40, status: "GRADED", maxGrade: 100,
    });
    mocks.recalculateSubjectProgressCascade.mockRejectedValue(CASCADE_FAILURE);

    await expect(
      new UpdateStudentAssessmentResultCommand(input({ resultId: "sar-1", grade: 80, reason: "correção" }), ctx).execute()
    ).rejects.toThrow(CASCADE_FAILURE);

    expect(mocks.updateStudentAssessmentResult).toHaveBeenCalled();
    expect(mocks.state.committed).toEqual([]); // grade change + progress rolled back
    expect(mocks.publish).not.toHaveBeenCalled();
  });
});

// ── 3. INVALIDATE — cascade (course-progress) failure ─────────────────────────
describe("InvalidateAssessmentResultCommand — transactional rollback", () => {
  it("rolls back the sidecar invalidation AND the canonical cancellation together", async () => {
    mocks.findAssessmentResultById.mockResolvedValue({ id: "ar-1", assessmentId: "as-1", enrollmentId: "e1", status: "GRADED" });
    mocks.findResultByEnrollmentAndComponent.mockResolvedValue({ id: "sar-1", grade: 70, normalizedGrade: 70, status: "GRADED" });
    mocks.recalculateSubjectProgressCascade.mockRejectedValue(CASCADE_FAILURE);

    await expect(
      new InvalidateAssessmentResultCommand(input({ resultId: "ar-1", reason: "prova anulada por irregularidade" }), ctx).execute()
    ).rejects.toThrow(CASCADE_FAILURE);

    // Both writes were attempted; neither persisted — StudentAssessmentResult
    // status remains unchanged (nothing committed), sidecar too.
    expect(mocks.updateAssessmentResult).toHaveBeenCalled();
    expect(mocks.updateStudentAssessmentResult).toHaveBeenCalled();
    expect(mocks.state.committed).toEqual([]);
    expect(mocks.publish).not.toHaveBeenCalled();
  });
});

// ── 4. RETAKE — cascade failure ───────────────────────────────────────────────
describe("GradeAssessmentRetakeCommand — transactional rollback", () => {
  it("does not commit the RECOVERY result (nor the retake grade) when the cascade fails", async () => {
    mocks.findRetakeById.mockResolvedValue({
      id: "rt-1", assessmentId: "as-1", studentId: "s1", enrollmentId: "e1", originalAssessmentResultId: "ar-1", status: "APPROVED",
    });
    mocks.findResultByEnrollmentAndComponent.mockResolvedValue({ id: "sar-1", grade: 40, normalizedGrade: 40, status: "GRADED" });
    mocks.recalculateSubjectProgressCascade.mockRejectedValue(CASCADE_FAILURE);

    await expect(
      new GradeAssessmentRetakeCommand(input({ retakeId: "rt-1", score: 80 }), ctx).execute()
    ).rejects.toThrow(CASCADE_FAILURE);

    expect(mocks.updateAssessmentRetake).toHaveBeenCalled();
    expect(mocks.upsertStudentAssessmentResult).toHaveBeenCalled();
    expect(mocks.state.committed).toEqual([]); // RECOVERY result not committed
    expect(mocks.publish).not.toHaveBeenCalled();
  });
});

// ── 5. BULK — all-or-nothing: one failing row rolls back the whole batch ───────
describe("BulkGradeAssessmentCommand — all-or-nothing transaction", () => {
  const twoRows = [
    { studentId: "s1", enrollmentId: "e1", score: 80, status: "GRADED", feedback: null },
    { studentId: "s2", enrollmentId: "e2", score: 60, status: "GRADED", feedback: null },
  ];

  it("rolls back EVERY row (including already-staged ones) when a later row's cascade fails", async () => {
    // First row's cascade succeeds and stages writes; second row's cascade throws.
    mocks.recalculateSubjectProgressCascade
      .mockImplementationOnce(async (_c: unknown, _p: unknown, options: { events?: unknown[] }) => {
        mocks.state.staged.push("student_subject_progress");
        options?.events?.push({ eventType: "STUDENT_SUBJECT_PASSED", payload: {} } as never);
        return { id: "prog-1" };
      })
      .mockRejectedValueOnce(CASCADE_FAILURE);

    await expect(
      new BulkGradeAssessmentCommand(input({ assessmentId: "as-1", grades: twoRows }), ctx).execute()
    ).rejects.toThrow(CASCADE_FAILURE);

    // The whole batch rolled back — the first row's staged writes are discarded too.
    expect(mocks.state.committed).toEqual([]);
    // No event published for the rolled-back batch (even the first row's).
    expect(mocks.publish).not.toHaveBeenCalled();
  });

  it("commits all rows and publishes their events when every row succeeds", async () => {
    await new BulkGradeAssessmentCommand(input({ assessmentId: "as-1", grades: twoRows }), ctx).execute();

    // Two students → two canonical writes committed, and their events published post-commit.
    expect(mocks.state.committed.filter((w) => w === "student_assessment_result")).toHaveLength(2);
    expect(mocks.publish).toHaveBeenCalledTimes(2);
  });
});
