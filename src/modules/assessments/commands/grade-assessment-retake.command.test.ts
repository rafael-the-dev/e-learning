import { describe, it, expect, vi, beforeEach } from "vitest";

// A graded retake writes the recovery outcome back to the canonical grade store:
// it resolves the effective grade via the (real) GradeResolutionEngine, upserts a
// RECOVERY-sourced StudentAssessmentResult, logs source=RECOVERY and cascades.

const mocks = vi.hoisted(() => ({
  findRetakeById: vi.fn(),
  updateAssessmentRetake: vi.fn(),
  findAssessmentById: vi.fn(),
  findAssessmentResultById: vi.fn(),
  findResultByEnrollmentAndComponent: vi.fn(),
  upsertStudentAssessmentResult: vi.fn(),
  handleGradeMutation: vi.fn(),
  auditLog: vi.fn(),
}));

vi.mock("@/server/auth/rbac", () => ({
  getUserPermissions: vi.fn().mockResolvedValue([]),
  createAbility: () => ({ can: () => true }),
}));
vi.mock("@/server/auth/teacher-access", () => ({
  assertTeacherCanAccessAssessment: vi.fn(),
}));
vi.mock("@/server/db", () => {
  // $transaction runs its callback with a tx client; the same mock stands in for
  // the tx (repositories are mocked and ignore the client arg).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db: any = {};
  db.$transaction = (fn: (tx: unknown) => unknown) => fn(db);
  return { getDb: vi.fn(async () => db) };
});
vi.mock("@/modules/assessments/repositories/assessment-retake.repository", () => ({
  findRetakeById: mocks.findRetakeById,
  updateAssessmentRetake: mocks.updateAssessmentRetake,
}));
vi.mock("@/modules/assessments/repositories/assessment.repository", () => ({
  findAssessmentById: mocks.findAssessmentById,
}));
vi.mock("@/modules/assessments/repositories/assessment-result.repository", () => ({
  findResultById: mocks.findAssessmentResultById,
}));
vi.mock("@/modules/grades/repositories/student-assessment-result.repository", () => ({
  findResultByEnrollmentAndComponent: mocks.findResultByEnrollmentAndComponent,
  upsertStudentAssessmentResult: mocks.upsertStudentAssessmentResult,
}));
vi.mock("@/modules/grades/services/grade-calculation.service", () => ({
  gradeCalculationService: { normalizeGrade: (g: number) => g },
}));
vi.mock("@/modules/grades/services/grade-mutation.service", () => ({
  gradeMutationService: { handleGradeMutation: mocks.handleGradeMutation },
}));
vi.mock("@/modules/audit-logs/services/audit.service", () => ({
  auditService: { log: mocks.auditLog },
}));

import { GradeAssessmentRetakeCommand } from "@/modules/assessments/commands/grade-assessment-retake.command";
import { gradeResolutionEngine } from "@/modules/grades/engines/grade-resolution.engine";

const ctx = { userId: "u1", organizationId: "org-1" } as never;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const input = (o: Record<string, unknown>) => o as any;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let resolveSpy: any;

beforeEach(() => {
  vi.clearAllMocks();
  resolveSpy = vi.spyOn(gradeResolutionEngine, "resolve");
  mocks.findRetakeById.mockResolvedValue({
    id: "rt-1",
    assessmentId: "as-1",
    studentId: "s1",
    enrollmentId: "e1",
    originalAssessmentResultId: "ar-1",
    status: "APPROVED",
  });
  mocks.findAssessmentById.mockResolvedValue({
    id: "as-1",
    maxScore: 100,
    levelSubjectId: "ls-1",
    subjectId: "sub-1",
    assessmentComponentId: "c-1",
  });
  mocks.updateAssessmentRetake.mockResolvedValue({ id: "rt-1", status: "GRADED" });
  // Original canonical grade the recovery is compared against (BEST_SCORE default).
  mocks.findResultByEnrollmentAndComponent.mockResolvedValue({
    id: "sar-1",
    grade: 40,
    normalizedGrade: 40,
    status: "GRADED",
  });
  mocks.upsertStudentAssessmentResult.mockImplementation(async (d: Record<string, unknown>) => ({ id: "sar-1", ...d }));
  mocks.handleGradeMutation.mockResolvedValue({ id: "prog-1" });
});

function cmd() {
  return new GradeAssessmentRetakeCommand(input({ retakeId: "rt-1", score: 80 }), ctx);
}

describe("GradeAssessmentRetakeCommand.execute", () => {
  it("writes a RECOVERY-sourced StudentAssessmentResult", async () => {
    await cmd().execute();

    expect(mocks.upsertStudentAssessmentResult).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceType: "RECOVERY",
        assessmentEventId: "as-1",
        studentId: "s1",
        enrollmentId: "e1",
        grade: 80, // BEST_SCORE: recovery 80 beats original 40
      }),
      expect.anything()
    );
  });

  it("uses the GradeResolutionEngine to combine original and recovery grades", async () => {
    await cmd().execute();

    expect(resolveSpy).toHaveBeenCalledWith(
      expect.objectContaining({ originalGrade: 40, recoveryGrade: 80 })
    );
  });

  it("creates a GradeChangeLog with source=RECOVERY via the mutation service", async () => {
    await cmd().execute();

    expect(mocks.handleGradeMutation).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        source: "RECOVERY",
        previous: { grade: 40, normalizedGrade: 40, status: "GRADED" },
      })
    );
  });

  it("triggers the cascade", async () => {
    await cmd().execute();
    expect(mocks.handleGradeMutation).toHaveBeenCalledTimes(1);
  });
});
