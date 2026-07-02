import { describe, it, expect, vi, beforeEach } from "vitest";

// Invalidation must affect the CANONICAL grade store (StudentAssessmentResult),
// not the AssessmentResult participation sidecar: it cancels the canonical row,
// logs the change (source=INVALIDATE) and cascades — driven entirely by
// StudentAssessmentResult values, never AssessmentResult.score.

const mocks = vi.hoisted(() => ({
  findAssessmentResultById: vi.fn(),
  updateAssessmentResult: vi.fn(),
  findAssessmentById: vi.fn(),
  findResultByEnrollmentAndComponent: vi.fn(),
  updateStudentAssessmentResult: vi.fn(),
  handleGradeMutation: vi.fn(),
  auditLog: vi.fn(),
}));

vi.mock("@/server/auth/rbac", () => ({
  getUserPermissions: vi.fn().mockResolvedValue([]),
  createAbility: () => ({ can: () => true }),
}));
vi.mock("@/modules/assessments/repositories/assessment-result.repository", () => ({
  findResultById: mocks.findAssessmentResultById,
  updateAssessmentResult: mocks.updateAssessmentResult,
}));
vi.mock("@/modules/assessments/repositories/assessment.repository", () => ({
  findAssessmentById: mocks.findAssessmentById,
}));
vi.mock("@/modules/grades/repositories/student-assessment-result.repository", () => ({
  findResultByEnrollmentAndComponent: mocks.findResultByEnrollmentAndComponent,
  updateStudentAssessmentResult: mocks.updateStudentAssessmentResult,
}));
vi.mock("@/modules/grades/services/grade-mutation.service", () => ({
  gradeMutationService: { handleGradeMutation: mocks.handleGradeMutation },
}));
vi.mock("@/modules/audit-logs/services/audit.service", () => ({
  auditService: { log: mocks.auditLog },
}));

import { InvalidateAssessmentResultCommand } from "@/modules/assessments/commands/invalidate-assessment-result.command";

const ctx = { userId: "u1", organizationId: "org-1" } as never;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const input = (o: Record<string, unknown>) => o as any;

beforeEach(() => {
  vi.clearAllMocks();
  // AssessmentResult sidecar — deliberately has NO score field: the command must
  // not read it. Only assessmentId + enrollmentId + status are used.
  mocks.findAssessmentResultById.mockResolvedValue({
    id: "ar-1",
    assessmentId: "as-1",
    enrollmentId: "e1",
    status: "GRADED",
  });
  mocks.updateAssessmentResult.mockResolvedValue({ id: "ar-1", status: "INVALIDATED" });
  mocks.findAssessmentById.mockResolvedValue({ id: "as-1", assessmentComponentId: "c-1" });
  mocks.findResultByEnrollmentAndComponent.mockResolvedValue({
    id: "sar-1",
    grade: 70,
    normalizedGrade: 70,
    status: "GRADED",
  });
  mocks.updateStudentAssessmentResult.mockResolvedValue({
    id: "sar-1",
    grade: 70,
    normalizedGrade: 70,
    status: "CANCELLED",
  });
  mocks.handleGradeMutation.mockResolvedValue({ id: "prog-1" });
});

function cmd() {
  return new InvalidateAssessmentResultCommand(
    input({ resultId: "ar-1", reason: "prova anulada por irregularidade" }),
    ctx
  );
}

describe("InvalidateAssessmentResultCommand.execute", () => {
  it("cancels the canonical StudentAssessmentResult", async () => {
    await cmd().execute();

    expect(mocks.updateStudentAssessmentResult).toHaveBeenCalledWith(
      "sar-1",
      "org-1",
      { status: "CANCELLED" }
    );
  });

  it("creates a GradeChangeLog with source=INVALIDATE via the mutation service", async () => {
    await cmd().execute();

    expect(mocks.handleGradeMutation).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ source: "INVALIDATE" })
    );
  });

  it("triggers the cascade", async () => {
    await cmd().execute();
    expect(mocks.handleGradeMutation).toHaveBeenCalledTimes(1);
  });

  it("derives the previous snapshot from StudentAssessmentResult, not AssessmentResult.score", async () => {
    await cmd().execute();

    // previous.grade must be the canonical grade (70), proving the grade came
    // from StudentAssessmentResult — the AssessmentResult mock has no score at all.
    expect(mocks.handleGradeMutation).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        previous: { grade: 70, normalizedGrade: 70, status: "GRADED" },
        result: expect.objectContaining({ status: "CANCELLED" }),
      })
    );
  });

  it("no-ops the canonical write when there is no enrollment on the sidecar", async () => {
    mocks.findAssessmentResultById.mockResolvedValue({
      id: "ar-1",
      assessmentId: "as-1",
      enrollmentId: null,
      status: "GRADED",
    });

    await cmd().execute();

    expect(mocks.updateStudentAssessmentResult).not.toHaveBeenCalled();
    expect(mocks.handleGradeMutation).not.toHaveBeenCalled();
  });
});
