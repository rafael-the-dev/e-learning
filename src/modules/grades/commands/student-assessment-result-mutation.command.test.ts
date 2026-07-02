import { describe, it, expect, vi, beforeEach } from "vitest";

// The create / update / cancel StudentAssessmentResult commands must all funnel
// through GradeMutationService with the correct source and previous snapshot, so
// the GradeChangeLog + cascade contract holds for every continuous-grade write.

const mocks = vi.hoisted(() => ({
  levelSubjectFindFirst: vi.fn(),
  findResultByEnrollmentAndComponent: vi.fn(),
  findResultById: vi.fn(),
  upsertStudentAssessmentResult: vi.fn(),
  updateStudentAssessmentResult: vi.fn(),
  findComponentById: vi.fn(),
  findAssessmentPolicyById: vi.fn(),
  handleGradeMutation: vi.fn(),
  auditLog: vi.fn(),
}));

vi.mock("@/server/auth/rbac", () => ({
  getUserPermissions: vi.fn().mockResolvedValue([]),
  createAbility: () => ({ can: () => true }),
}));
vi.mock("@/server/auth/teacher-access", () => ({
  assertTeacherCanAccessEnrollment: vi.fn(),
}));
vi.mock("@/server/db", () => {
  // $transaction runs the callback with a tx client; the same mock object stands
  // in for the tx (repositories are mocked separately and ignore the client arg).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db: any = { levelSubject: { findFirst: mocks.levelSubjectFindFirst } };
  db.$transaction = (fn: (tx: unknown) => unknown) => fn(db);
  return { getDb: vi.fn(async () => db) };
});
vi.mock("@/modules/grades/repositories/student-assessment-result.repository", () => ({
  findResultByEnrollmentAndComponent: mocks.findResultByEnrollmentAndComponent,
  findResultById: mocks.findResultById,
  upsertStudentAssessmentResult: mocks.upsertStudentAssessmentResult,
  updateStudentAssessmentResult: mocks.updateStudentAssessmentResult,
}));
vi.mock("@/modules/assessments/repositories/assessment-component.repository", () => ({
  findComponentById: mocks.findComponentById,
}));
vi.mock("@/modules/assessments/repositories/assessment-policy.repository", () => ({
  findAssessmentPolicyById: mocks.findAssessmentPolicyById,
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

import { CreateStudentAssessmentResultCommand } from "@/modules/grades/commands/create-student-assessment-result.command";
import { UpdateStudentAssessmentResultCommand } from "@/modules/grades/commands/update-student-assessment-result.command";
import { CancelStudentAssessmentResultCommand } from "@/modules/grades/commands/cancel-student-assessment-result.command";

const ctx = { userId: "u1", organizationId: "org-1" } as never;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const input = (o: Record<string, unknown>) => o as any;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.findComponentById.mockResolvedValue({ id: "c-1", maxGrade: 100, assessmentPolicyId: "p-1" });
  mocks.findAssessmentPolicyById.mockResolvedValue({ id: "p-1", levelSubjectId: "ls-1" });
  mocks.levelSubjectFindFirst.mockResolvedValue({ subjectId: "sub-1" });
  mocks.upsertStudentAssessmentResult.mockImplementation(async (d: Record<string, unknown>) => ({ id: "sar-1", ...d }));
  mocks.updateStudentAssessmentResult.mockImplementation(async (_id: string, _org: string, d: Record<string, unknown>) => ({
    id: "sar-1",
    grade: 40,
    normalizedGrade: 40,
    status: "GRADED",
    ...d,
  }));
  mocks.handleGradeMutation.mockResolvedValue({ id: "prog-1" });
});

describe("CreateStudentAssessmentResultCommand.execute", () => {
  it("invokes GradeMutationService with source=CREATE and a null previous snapshot", async () => {
    mocks.findResultByEnrollmentAndComponent.mockResolvedValue(null);

    await new CreateStudentAssessmentResultCommand(
      input({ studentId: "s1", enrollmentId: "e1", assessmentComponentId: "c-1", grade: 75, notes: null }),
      ctx
    ).execute();

    expect(mocks.handleGradeMutation).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        source: "CREATE",
        previous: null,
        result: expect.objectContaining({ grade: 75, sourceType: "CONTINUOUS" }),
      })
    );
  });

  it("logs source=UPDATE when the create upsert hits an existing row", async () => {
    mocks.findResultByEnrollmentAndComponent.mockResolvedValue({
      grade: 50,
      normalizedGrade: 50,
      status: "GRADED",
    });

    await new CreateStudentAssessmentResultCommand(
      input({ studentId: "s1", enrollmentId: "e1", assessmentComponentId: "c-1", grade: 75, notes: null }),
      ctx
    ).execute();

    expect(mocks.handleGradeMutation).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        source: "UPDATE",
        previous: { grade: 50, normalizedGrade: 50, status: "GRADED" },
      })
    );
  });
});

describe("UpdateStudentAssessmentResultCommand.execute", () => {
  it("invokes GradeMutationService with source=UPDATE and the previous snapshot", async () => {
    mocks.findResultById.mockResolvedValue({
      id: "sar-1",
      assessmentComponentId: "c-1",
      grade: 40,
      normalizedGrade: 40,
      status: "GRADED",
      maxGrade: 100,
    });

    await new UpdateStudentAssessmentResultCommand(
      input({ resultId: "sar-1", grade: 80, reason: "correção" }),
      ctx
    ).execute();

    expect(mocks.handleGradeMutation).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        source: "UPDATE",
        previous: { grade: 40, normalizedGrade: 40, status: "GRADED" },
        result: expect.objectContaining({ grade: 80 }),
      })
    );
  });
});

describe("CancelStudentAssessmentResultCommand.execute", () => {
  it("cancels the row and invokes GradeMutationService with source=CANCEL and the previous snapshot", async () => {
    mocks.findResultById.mockResolvedValue({
      id: "sar-1",
      grade: 40,
      normalizedGrade: 40,
      status: "GRADED",
    });
    mocks.updateStudentAssessmentResult.mockResolvedValue({
      id: "sar-1",
      grade: 40,
      normalizedGrade: 40,
      status: "CANCELLED",
    });

    await new CancelStudentAssessmentResultCommand(
      input({ resultId: "sar-1", reason: "cancelado por erro de lançamento" }),
      ctx
    ).execute();

    expect(mocks.updateStudentAssessmentResult).toHaveBeenCalledWith(
      "sar-1", "org-1", { status: "CANCELLED" }, expect.anything()
    );
    expect(mocks.handleGradeMutation).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        source: "CANCEL",
        previous: { grade: 40, normalizedGrade: 40, status: "GRADED" },
        result: expect.objectContaining({ status: "CANCELLED" }),
      })
    );
  });
});
