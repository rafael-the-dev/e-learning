import { describe, it, expect, vi, beforeEach } from "vitest";

const { createGradeChangeLogMock, cascadeMock } = vi.hoisted(() => ({
  createGradeChangeLogMock: vi.fn(async () => ({ id: "log-1" })),
  cascadeMock: vi.fn(async () => ({ id: "progress-1", status: "PASSED", finalGrade: 80 })),
}));

vi.mock("@/modules/grades/repositories/grade-change-log.repository", () => ({
  createGradeChangeLog: createGradeChangeLogMock,
}));
vi.mock("@/modules/grades/services/subject-progress-cascade.service", () => ({
  recalculateSubjectProgressCascade: cascadeMock,
}));

import { gradeMutationService } from "@/modules/grades/services/grade-mutation.service";
import { GRADE_CHANGE_SOURCE } from "@/modules/grades/types";
import type { AuthContext } from "@/server/auth/context";

const context = { organizationId: "org-1", userId: "u1" } as AuthContext;

function makeResult(overrides: Record<string, unknown> = {}) {
  return {
    id: "sar-1",
    organizationId: "org-1",
    enrollmentId: "e1",
    studentId: "s1",
    levelSubjectId: "ls1",
    subjectId: "sub1",
    assessmentComponentId: "c1",
    assessmentEventId: "a1",
    sourceType: "SCHEDULED_EVENT",
    grade: 80,
    maxGrade: 100,
    normalizedGrade: 80,
    notes: null,
    status: "GRADED",
    gradedBy: "u1",
    gradedAt: new Date("2026-07-01T00:00:00Z"),
    createdAt: new Date("2026-07-01T00:00:00Z"),
    updatedAt: new Date("2026-07-01T00:00:00Z"),
    ...overrides,
  };
}

describe("GradeMutationService.handleGradeMutation", () => {
  beforeEach(() => vi.clearAllMocks());

  it("writes a GradeChangeLog with old/new grade, normalized values and source, then cascades", async () => {
    const result = makeResult({ grade: 80, normalizedGrade: 80, status: "GRADED" });

    await gradeMutationService.handleGradeMutation(context, {
      result,
      previous: { grade: 40, normalizedGrade: 40, status: "GRADED" },
      source: GRADE_CHANGE_SOURCE.UPDATE,
      reason: "correção de erro de lançamento",
    });

    expect(createGradeChangeLogMock).toHaveBeenCalledTimes(1);
    expect(createGradeChangeLogMock).toHaveBeenCalledWith(
      expect.objectContaining({
        studentAssessmentResultId: "sar-1",
        oldGrade: 40,
        newGrade: 80,
        oldNormalizedGrade: 40,
        newNormalizedGrade: 80,
        oldStatus: "GRADED",
        newStatus: "GRADED",
        source: "UPDATE",
        reason: "correção de erro de lançamento",
        changedBy: "u1",
      })
    );

    expect(cascadeMock).toHaveBeenCalledWith(
      context,
      expect.objectContaining({ studentId: "s1", enrollmentId: "e1", levelSubjectId: "ls1" })
    );
  });

  it("records source=INVALIDATE and still cascades (progression recomputes)", async () => {
    const result = makeResult({ status: "CANCELLED" });

    await gradeMutationService.handleGradeMutation(context, {
      result,
      previous: { grade: 80, normalizedGrade: 80, status: "GRADED" },
      source: GRADE_CHANGE_SOURCE.INVALIDATE,
      reason: "prova anulada por irregularidade",
    });

    expect(createGradeChangeLogMock).toHaveBeenCalledWith(
      expect.objectContaining({ source: "INVALIDATE", newStatus: "CANCELLED" })
    );
    expect(cascadeMock).toHaveBeenCalledTimes(1);
  });

  it("records source=RECOVERY for a retake write-back", async () => {
    const result = makeResult({ sourceType: "RECOVERY", grade: 65, normalizedGrade: 65 });

    await gradeMutationService.handleGradeMutation(context, {
      result,
      previous: { grade: 40, normalizedGrade: 40, status: "GRADED" },
      source: GRADE_CHANGE_SOURCE.RECOVERY,
      reason: "recuperação classificada",
    });

    expect(createGradeChangeLogMock).toHaveBeenCalledWith(
      expect.objectContaining({ source: "RECOVERY", oldGrade: 40, newGrade: 65 })
    );
    expect(cascadeMock).toHaveBeenCalledTimes(1);
  });

  it("logs create with a null previous snapshot", async () => {
    const result = makeResult({ sourceType: "CONTINUOUS" });

    await gradeMutationService.handleGradeMutation(context, {
      result,
      previous: null,
      source: GRADE_CHANGE_SOURCE.CREATE,
      reason: "Lançamento inicial de nota",
    });

    expect(createGradeChangeLogMock).toHaveBeenCalledWith(
      expect.objectContaining({ oldGrade: null, oldNormalizedGrade: null, oldStatus: null, source: "CREATE" })
    );
  });

  it("skips the change log but still cascades when logChange is false", async () => {
    await gradeMutationService.handleGradeMutation(context, {
      result: makeResult(),
      previous: null,
      source: GRADE_CHANGE_SOURCE.CREATE,
      reason: "n/a",
      logChange: false,
    });

    expect(createGradeChangeLogMock).not.toHaveBeenCalled();
    expect(cascadeMock).toHaveBeenCalledTimes(1);
  });
});
