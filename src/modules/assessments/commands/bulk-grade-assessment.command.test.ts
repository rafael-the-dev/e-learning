import { describe, it, expect, vi, beforeEach } from "vitest";

// Command-level coverage for the audit fix: every bulk-graded row must funnel
// through GradeMutationService (which writes the GradeChangeLog with source=BULK
// and cascades subject -> level -> course), including first-time grading.

const mocks = vi.hoisted(() => ({
  findAssessmentById: vi.fn(),
  updateAssessment: vi.fn(),
  upsertAssessmentResult: vi.fn(),
  upsertStudentAssessmentResult: vi.fn(),
  findResultByEnrollmentAndComponent: vi.fn(),
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
vi.mock("@/modules/assessments/repositories/assessment.repository", () => ({
  findAssessmentById: mocks.findAssessmentById,
  updateAssessment: mocks.updateAssessment,
}));
vi.mock("@/modules/assessments/repositories/assessment-result.repository", () => ({
  upsertAssessmentResult: mocks.upsertAssessmentResult,
}));
vi.mock("@/modules/grades/repositories/student-assessment-result.repository", () => ({
  upsertStudentAssessmentResult: mocks.upsertStudentAssessmentResult,
  findResultByEnrollmentAndComponent: mocks.findResultByEnrollmentAndComponent,
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

import { BulkGradeAssessmentCommand } from "@/modules/assessments/commands/bulk-grade-assessment.command";

const ctx = { userId: "u1", organizationId: "org-1" } as never;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const input = (o: Record<string, unknown>) => o as any;

function assessment(overrides: Record<string, unknown> = {}) {
  return {
    id: "as-1",
    status: "OPEN",
    maxScore: 100,
    levelSubjectId: "ls-1",
    subjectId: "sub-1",
    assessmentComponentId: "c-1",
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.upsertAssessmentResult.mockResolvedValue({ id: "ar-1", status: "GRADED" });
  mocks.upsertStudentAssessmentResult.mockImplementation(async (d: Record<string, unknown>) => ({
    id: "sar-1",
    ...d,
  }));
  mocks.handleGradeMutation.mockResolvedValue({ id: "prog-1" });
});

function cmd(grades: unknown[], editReason?: string) {
  return new BulkGradeAssessmentCommand(
    input({ assessmentId: "as-1", editReason, grades }),
    ctx
  );
}

const oneGrade = [{ studentId: "s1", enrollmentId: "e1", score: 80, status: "GRADED", feedback: null }];

describe("BulkGradeAssessmentCommand.execute — canonical grade write + audit", () => {
  it("first-time bulk grading writes a canonical StudentAssessmentResult (SCHEDULED_EVENT)", async () => {
    mocks.findAssessmentById.mockResolvedValue(assessment());
    mocks.findResultByEnrollmentAndComponent.mockResolvedValue(null);

    await cmd(oneGrade).execute();

    expect(mocks.upsertStudentAssessmentResult).toHaveBeenCalledWith(
      expect.objectContaining({
        enrollmentId: "e1",
        studentId: "s1",
        assessmentEventId: "as-1",
        sourceType: "SCHEDULED_EVENT",
        grade: 80,
        status: "GRADED",
      })
    );
  });

  it("first-time bulk grading creates a GradeChangeLog (source=BULK, previous=null) via the mutation service", async () => {
    mocks.findAssessmentById.mockResolvedValue(assessment());
    mocks.findResultByEnrollmentAndComponent.mockResolvedValue(null);

    await cmd(oneGrade).execute();

    expect(mocks.handleGradeMutation).toHaveBeenCalledTimes(1);
    expect(mocks.handleGradeMutation).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ source: "BULK", previous: null, logChange: true })
    );
  });

  it("triggers the cascade (subject -> level -> course runs inside handleGradeMutation)", async () => {
    mocks.findAssessmentById.mockResolvedValue(assessment());
    mocks.findResultByEnrollmentAndComponent.mockResolvedValue(null);

    await cmd(oneGrade).execute();

    // handleGradeMutation IS the cascade entry point for bulk grading.
    expect(mocks.handleGradeMutation).toHaveBeenCalledTimes(1);
  });

  it("regrade creates a GradeChangeLog carrying old/new values", async () => {
    mocks.findAssessmentById.mockResolvedValue(assessment({ status: "GRADED" }));
    mocks.findResultByEnrollmentAndComponent.mockResolvedValue({
      id: "sar-1",
      grade: 40,
      normalizedGrade: 40,
      status: "GRADED",
    });

    await cmd(oneGrade, "correção de erro").execute();

    expect(mocks.handleGradeMutation).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        source: "BULK",
        previous: { grade: 40, normalizedGrade: 40, status: "GRADED" },
        result: expect.objectContaining({ grade: 80 }),
      })
    );
  });

  it("a student graded for the first time DURING a regrade session still gets a GradeChangeLog", async () => {
    mocks.findAssessmentById.mockResolvedValue(assessment({ status: "GRADED" }));
    // No prior canonical row for this enrollment.
    mocks.findResultByEnrollmentAndComponent.mockResolvedValue(null);

    await cmd(oneGrade, "reclassificação").execute();

    expect(mocks.handleGradeMutation).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ source: "BULK", previous: null, logChange: true })
    );
  });
});
