import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  decideLevelProgression,
  computeWeightedLevelGrade,
  promoteStudentToNextLevel,
  type LevelSubjectInput,
  type SubjectProgressInput,
  type ProgressionPolicyInput,
} from "@/modules/prerequisites/engines/level-progression.engine";
import { PROGRESSION_OUTCOME } from "@/modules/prerequisites/types";

// ─── Test helpers ─────────────────────────────────────────────────────────────

let subjectSeq = 0;
// Default workloadHours gives every subject a positive weight so grade-based
// assertions work; tests that exercise weighting override credits/workloadHours.
function subject(overrides: Partial<LevelSubjectInput> = {}): LevelSubjectInput {
  return { id: `ls-${++subjectSeq}`, isRequired: true, credits: 0, workloadHours: 60, ...overrides };
}

function progress(
  levelSubjectId: string,
  status: string,
  finalGrade: number | null = null
): SubjectProgressInput {
  return { levelSubjectId, status, finalGrade };
}

function policy(overrides: Partial<ProgressionPolicyInput> = {}): ProgressionPolicyInput {
  return {
    progressionMode: "STRICT",
    minimumLevelAverage: null,
    maxFailedRequiredSubjects: null,
    maxPendingSubjects: null,
    requiredCredits: null,
    requireManualApproval: false,
    ...overrides,
  };
}

const NEXT_LEVEL = "level-2";
const FROM_LEVEL = "level-1";

describe("decideLevelProgression", () => {
  beforeEach(() => {
    subjectSeq = 0;
  });

  // ── Scenario 1: STRICT, all required passed ──────────────────────────────────
  it("STRICT: all required subjects passed → PROMOTED", () => {
    const s1 = subject();
    const s2 = subject();
    const result = decideLevelProgression({
      fromLevelId: FROM_LEVEL,
      toLevelId: NEXT_LEVEL,
      levelSubjects: [s1, s2],
      subjectProgress: [progress(s1.id, "PASSED", 80), progress(s2.id, "PASSED", 90)],
      policy: policy({ progressionMode: "STRICT" }),
    });
    expect(result.outcome).toBe(PROGRESSION_OUTCOME.PROMOTED);
    expect(result.failedRequiredSubjectsCount).toBe(0);
    expect(result.pendingSubjectsCount).toBe(0);
    expect(result.toLevelId).toBe(NEXT_LEVEL);
  });

  it("STRICT: final level (no next level), all passed → PROMOTED", () => {
    const s1 = subject();
    const result = decideLevelProgression({
      fromLevelId: FROM_LEVEL,
      toLevelId: null,
      levelSubjects: [s1],
      subjectProgress: [progress(s1.id, "PASSED", 75)],
      policy: null,
    });
    expect(result.outcome).toBe(PROGRESSION_OUTCOME.PROMOTED);
    expect(result.toLevelId).toBeNull();
  });

  it("final level with a pending subject → ELIGIBLE_TO_PROGRESS (not promoted)", () => {
    const s1 = subject();
    const s2 = subject();
    const result = decideLevelProgression({
      fromLevelId: FROM_LEVEL,
      toLevelId: null,
      levelSubjects: [s1, s2],
      subjectProgress: [progress(s1.id, "PASSED", 75), progress(s2.id, "IN_PROGRESS")],
      policy: null,
    });
    expect(result.outcome).toBe(PROGRESSION_OUTCOME.ELIGIBLE_TO_PROGRESS);
  });

  // ── Scenario 2: STRICT, one required failed ──────────────────────────────────
  it("STRICT: one required subject failed → BLOCKED", () => {
    const s1 = subject();
    const s2 = subject();
    const result = decideLevelProgression({
      fromLevelId: FROM_LEVEL,
      toLevelId: NEXT_LEVEL,
      levelSubjects: [s1, s2],
      subjectProgress: [progress(s1.id, "PASSED", 80), progress(s2.id, "FAILED", 30)],
      policy: policy({ progressionMode: "STRICT" }),
    });
    expect(result.outcome).toBe(PROGRESSION_OUTCOME.BLOCKED);
    expect(result.failedRequiredSubjectsCount).toBe(1);
  });

  it("STRICT: a high average cannot override a failed required subject", () => {
    const s1 = subject();
    const s2 = subject();
    const result = decideLevelProgression({
      fromLevelId: FROM_LEVEL,
      toLevelId: NEXT_LEVEL,
      levelSubjects: [s1, s2],
      // s1 passed with 100, s2 failed — average of graded is high but must still block
      subjectProgress: [progress(s1.id, "PASSED", 100), progress(s2.id, "FAILED", 40)],
      policy: policy({ progressionMode: "STRICT" }),
    });
    expect(result.outcome).toBe(PROGRESSION_OUTCOME.BLOCKED);
  });

  // ── Scenario 3 / regression: pending required not counted as failed ───────────
  it("CONDITIONAL: pending required subjects are counted as pending, NOT failed", () => {
    const passed = subject();
    const pendingReq = subject({ isRequired: true });
    const result = decideLevelProgression({
      fromLevelId: FROM_LEVEL,
      toLevelId: NEXT_LEVEL,
      levelSubjects: [passed, pendingReq],
      subjectProgress: [progress(passed.id, "PASSED", 70), progress(pendingReq.id, "IN_PROGRESS")],
      policy: policy({
        progressionMode: "CONDITIONAL",
        maxFailedRequiredSubjects: 0,
        maxPendingSubjects: 5,
      }),
    });
    // A pending required subject must NOT consume the maxFailed budget.
    expect(result.failedRequiredSubjectsCount).toBe(0);
    expect(result.pendingSubjectsCount).toBe(1);
    expect(result.outcome).toBe(PROGRESSION_OUTCOME.PROMOTED_WITH_PENDING_SUBJECTS);
  });

  it("regression: NOT_STARTED and RECOVERY_REQUIRED required subjects are pending, not failed", () => {
    const a = subject({ isRequired: true });
    const b = subject({ isRequired: true });
    const result = decideLevelProgression({
      fromLevelId: FROM_LEVEL,
      toLevelId: NEXT_LEVEL,
      levelSubjects: [a, b],
      subjectProgress: [progress(a.id, "NOT_STARTED"), progress(b.id, "RECOVERY_REQUIRED")],
      policy: policy({
        progressionMode: "CONDITIONAL",
        maxFailedRequiredSubjects: 0,
        maxPendingSubjects: 5,
      }),
    });
    expect(result.failedRequiredSubjectsCount).toBe(0);
    expect(result.pendingSubjectsCount).toBe(2);
  });

  // ── Scenario 4: CONDITIONAL, failed <= maxFailed ─────────────────────────────
  it("CONDITIONAL: failed within limit → PROMOTED_WITH_PENDING_SUBJECTS", () => {
    const s1 = subject();
    const s2 = subject();
    const result = decideLevelProgression({
      fromLevelId: FROM_LEVEL,
      toLevelId: NEXT_LEVEL,
      levelSubjects: [s1, s2],
      subjectProgress: [progress(s1.id, "PASSED", 80), progress(s2.id, "FAILED", 40)],
      policy: policy({
        progressionMode: "CONDITIONAL",
        maxFailedRequiredSubjects: 2,
        maxPendingSubjects: 0,
      }),
    });
    expect(result.outcome).toBe(PROGRESSION_OUTCOME.PROMOTED_WITH_PENDING_SUBJECTS);
    expect(result.failedRequiredSubjectsCount).toBe(1);
  });

  // ── Scenario 5: CONDITIONAL, failed > maxFailed ──────────────────────────────
  it("CONDITIONAL: failed above limit → BLOCKED", () => {
    const s1 = subject();
    const s2 = subject();
    const s3 = subject();
    const result = decideLevelProgression({
      fromLevelId: FROM_LEVEL,
      toLevelId: NEXT_LEVEL,
      levelSubjects: [s1, s2, s3],
      subjectProgress: [
        progress(s1.id, "FAILED", 30),
        progress(s2.id, "FAILED", 20),
        progress(s3.id, "FAILED", 10),
      ],
      policy: policy({
        progressionMode: "CONDITIONAL",
        maxFailedRequiredSubjects: 2,
        maxPendingSubjects: 5,
      }),
    });
    expect(result.outcome).toBe(PROGRESSION_OUTCOME.BLOCKED);
    expect(result.failedRequiredSubjectsCount).toBe(3);
  });

  // ── Scenario 6: minimumLevelAverage ──────────────────────────────────────────
  it("CONDITIONAL: level average below minimumLevelAverage → BLOCKED", () => {
    const s1 = subject();
    const s2 = subject();
    const result = decideLevelProgression({
      fromLevelId: FROM_LEVEL,
      toLevelId: NEXT_LEVEL,
      levelSubjects: [s1, s2],
      subjectProgress: [progress(s1.id, "PASSED", 60), progress(s2.id, "PASSED", 60)],
      policy: policy({
        progressionMode: "CONDITIONAL",
        maxFailedRequiredSubjects: 5,
        maxPendingSubjects: 5,
        minimumLevelAverage: 70,
      }),
    });
    expect(result.outcome).toBe(PROGRESSION_OUTCOME.BLOCKED);
    expect(result.reason).toContain("Média do nível insuficiente");
  });

  it("CONDITIONAL: level average at/above minimumLevelAverage → promoted", () => {
    const s1 = subject();
    const s2 = subject();
    const result = decideLevelProgression({
      fromLevelId: FROM_LEVEL,
      toLevelId: NEXT_LEVEL,
      levelSubjects: [s1, s2],
      subjectProgress: [progress(s1.id, "PASSED", 80), progress(s2.id, "PASSED", 60)],
      policy: policy({
        progressionMode: "CONDITIONAL",
        maxFailedRequiredSubjects: 5,
        maxPendingSubjects: 5,
        minimumLevelAverage: 70,
      }),
    });
    expect(result.outcome).toBe(PROGRESSION_OUTCOME.PROMOTED);
  });

  // ── Scenario 7: requireManualApproval / MANUAL_APPROVAL mode ──────────────────
  it("MANUAL_APPROVAL mode → REQUIRES_MANUAL_APPROVAL", () => {
    const s1 = subject();
    const result = decideLevelProgression({
      fromLevelId: FROM_LEVEL,
      toLevelId: NEXT_LEVEL,
      levelSubjects: [s1],
      subjectProgress: [progress(s1.id, "PASSED", 80)],
      policy: policy({ progressionMode: "MANUAL_APPROVAL" }),
    });
    expect(result.outcome).toBe(PROGRESSION_OUTCOME.REQUIRES_MANUAL_APPROVAL);
  });

  it("requireManualApproval flag on STRICT (criteria met) → REQUIRES_MANUAL_APPROVAL", () => {
    const s1 = subject();
    const result = decideLevelProgression({
      fromLevelId: FROM_LEVEL,
      toLevelId: NEXT_LEVEL,
      levelSubjects: [s1],
      subjectProgress: [progress(s1.id, "PASSED", 80)],
      policy: policy({ progressionMode: "STRICT", requireManualApproval: true }),
    });
    expect(result.outcome).toBe(PROGRESSION_OUTCOME.REQUIRES_MANUAL_APPROVAL);
  });

  // ── Scenario 8: CREDIT_BASED counts only passed subject credits ───────────────
  it("CREDIT_BASED: only passed subjects contribute credits; enough → promoted", () => {
    const p1 = subject({ isRequired: false, credits: 5 });
    const p2 = subject({ isRequired: false, credits: 5 });
    const failed = subject({ isRequired: false, credits: 5 });
    const inProgress = subject({ isRequired: false, credits: 5 });
    const result = decideLevelProgression({
      fromLevelId: FROM_LEVEL,
      toLevelId: NEXT_LEVEL,
      levelSubjects: [p1, p2, failed, inProgress],
      subjectProgress: [
        progress(p1.id, "PASSED", 70),
        progress(p2.id, "PASSED", 70),
        progress(failed.id, "FAILED", 30),
        progress(inProgress.id, "IN_PROGRESS"),
      ],
      policy: policy({ progressionMode: "CREDIT_BASED", requiredCredits: 10 }),
    });
    // Only the 2 passed subjects (5 + 5) count — failed/in-progress do not.
    expect(result.earnedCredits).toBe(10);
    expect(result.outcome).not.toBe(PROGRESSION_OUTCOME.BLOCKED);
  });

  it("CREDIT_BASED: insufficient credits → BLOCKED", () => {
    const p1 = subject({ isRequired: false, credits: 5 });
    const failed = subject({ isRequired: false, credits: 5 });
    const result = decideLevelProgression({
      fromLevelId: FROM_LEVEL,
      toLevelId: NEXT_LEVEL,
      levelSubjects: [p1, failed],
      subjectProgress: [progress(p1.id, "PASSED", 70), progress(failed.id, "FAILED", 30)],
      policy: policy({ progressionMode: "CREDIT_BASED", requiredCredits: 10 }),
    });
    expect(result.earnedCredits).toBe(5);
    expect(result.outcome).toBe(PROGRESSION_OUTCOME.BLOCKED);
  });
});

// ─── Weighted finalGrade ──────────────────────────────────────────────────────

describe("computeWeightedLevelGrade", () => {
  beforeEach(() => {
    subjectSeq = 0;
  });

  it("weights by workloadHours when credits are 0/null", () => {
    const a = subject({ credits: 0, workloadHours: 100 });
    const b = subject({ credits: 0, workloadHours: 300 });
    // (90*100 + 50*300) / 400 = 60  (a simple mean would be 70)
    const grade = computeWeightedLevelGrade(
      [a, b],
      [progress(a.id, "PASSED", 90), progress(b.id, "PASSED", 50)]
    );
    expect(grade).toBe(60);
  });

  it("credits override workloadHours as the weight", () => {
    const a = subject({ credits: 2, workloadHours: 1000 });
    const b = subject({ credits: 2, workloadHours: 1 });
    // Uses credits (2, 2): (100*2 + 0*2) / 4 = 50.
    // If workloadHours were used it would be ≈ 99.9.
    const grade = computeWeightedLevelGrade(
      [a, b],
      [progress(a.id, "PASSED", 100), progress(b.id, "PASSED", 0)]
    );
    expect(grade).toBe(50);
  });

  it("excludes zero-weight subjects (credits and workloadHours both 0/null) from the grade", () => {
    const zero = subject({ credits: 0, workloadHours: 0 });
    const weighted = subject({ credits: 0, workloadHours: 50 });
    // The zero-weight subject's 100 is ignored; only the weighted 60 counts.
    const grade = computeWeightedLevelGrade(
      [zero, weighted],
      [progress(zero.id, "PASSED", 100), progress(weighted.id, "PASSED", 60)]
    );
    expect(grade).toBe(60);
  });

  it("returns null when no subject carries usable weight", () => {
    const a = subject({ credits: 0, workloadHours: 0 });
    const b = subject({ credits: null, workloadHours: null });
    const grade = computeWeightedLevelGrade(
      [a, b],
      [progress(a.id, "PASSED", 80), progress(b.id, "PASSED", 90)]
    );
    expect(grade).toBeNull();
  });

  it("only PASSED subjects contribute to the grade", () => {
    const passed = subject({ credits: 0, workloadHours: 100 });
    const failed = subject({ credits: 0, workloadHours: 100 });
    const grade = computeWeightedLevelGrade(
      [passed, failed],
      [progress(passed.id, "PASSED", 80), progress(failed.id, "FAILED", 100)]
    );
    expect(grade).toBe(80);
  });
});

describe("weighted finalGrade integration", () => {
  beforeEach(() => {
    subjectSeq = 0;
  });

  it("zero-weight required FAILED subject is excluded from grade but still blocks status", () => {
    const zeroWeightFailed = subject({ isRequired: true, credits: 0, workloadHours: 0 });
    const result = decideLevelProgression({
      fromLevelId: FROM_LEVEL,
      toLevelId: NEXT_LEVEL,
      levelSubjects: [zeroWeightFailed],
      subjectProgress: [progress(zeroWeightFailed.id, "FAILED", 30)],
      policy: policy({ progressionMode: "STRICT" }),
    });
    expect(result.outcome).toBe(PROGRESSION_OUTCOME.BLOCKED);
    expect(result.failedRequiredSubjectsCount).toBe(1);
  });

  it("minimumLevelAverage is evaluated against the WEIGHTED grade, not the simple mean", () => {
    const a = subject({ credits: 0, workloadHours: 100 });
    const b = subject({ credits: 0, workloadHours: 300 });
    // Weighted = 60, simple mean = 70. Threshold 65 must block on the weighted value.
    const result = decideLevelProgression({
      fromLevelId: FROM_LEVEL,
      toLevelId: NEXT_LEVEL,
      levelSubjects: [a, b],
      subjectProgress: [progress(a.id, "PASSED", 90), progress(b.id, "PASSED", 50)],
      policy: policy({
        progressionMode: "CONDITIONAL",
        maxFailedRequiredSubjects: 5,
        maxPendingSubjects: 5,
        minimumLevelAverage: 65,
      }),
    });
    expect(result.outcome).toBe(PROGRESSION_OUTCOME.BLOCKED);
    expect(result.reason).toContain("Média do nível insuficiente");
  });
});

// ─── Scenario 10: promotion keeps the same enrollment ─────────────────────────
// promoteStudentToNextLevel must UPDATE the existing enrollment's currentLevelId
// and must never CREATE a new enrollment.

// vi.hoisted so the mock factory (which vitest hoists above imports) can
// safely reference these spies without a temporal-dead-zone ReferenceError.
const { updateManyMock, createMock } = vi.hoisted(() => ({
  updateManyMock: vi.fn(),
  createMock: vi.fn(),
}));

vi.mock("@/server/db", () => ({
  getDb: vi.fn(async () => ({
    enrollment: {
      updateMany: updateManyMock,
      create: createMock,
    },
  })),
}));

describe("promoteStudentToNextLevel", () => {
  beforeEach(() => {
    updateManyMock.mockReset();
    createMock.mockReset();
  });

  it("updates the existing enrollment's currentLevelId and creates no new enrollment", async () => {
    await promoteStudentToNextLevel("enr-1", NEXT_LEVEL, "org-1");

    expect(updateManyMock).toHaveBeenCalledTimes(1);
    expect(updateManyMock).toHaveBeenCalledWith({
      where: { id: "enr-1", organizationId: "org-1" },
      data: { currentLevelId: NEXT_LEVEL },
    });
    // No new enrollment is ever created during progression.
    expect(createMock).not.toHaveBeenCalled();
  });
});
