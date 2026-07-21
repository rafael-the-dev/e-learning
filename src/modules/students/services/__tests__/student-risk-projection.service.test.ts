import { describe, it, expect, vi, beforeEach } from "vitest";

// =============================================================================
// M11.2 — recalculation service. The projection must agree with the H6 engine
// (parity), persist the permission-aware level pair (level vs levelWithoutFinance),
// keep UNKNOWN distinct from NONE, order reasons by severity, be idempotent, and
// stay tenant-scoped.
// =============================================================================

// ── Pure payload tests (no IO) ─────────────────────────────────────────────────

import {
  buildStudentRiskProjectionData,
} from "@/modules/students/services/student-risk-projection.service";
import {
  buildStudentRiskSummary,
  assembleStudentRiskInput,
  STUDENT_RISK_SOURCE_VERSION,
  type StudentRiskSignals,
} from "@/modules/students/services/student-risk.service";

const NOW = new Date("2026-07-21T12:00:00Z");

function signals(over: Partial<StudentRiskSignals> = {}): StudentRiskSignals {
  return {
    enrollmentCount: 1,
    activeEnrollmentCount: 1,
    blockedLevelCount: 0,
    recoveryRequiredCount: 0,
    failedSubjectCount: 0,
    incompleteAssessmentCount: 0,
    gradedSubjectCount: 3,
    subjectProgressCount: 5,
    belowRequiredAttendanceCount: 0,
    pendingJustificationCount: 0,
    documentCount: 2,
    attendancePercentage: 92,
    financial: { overdueInvoiceCount: 0, pendingRefundCount: 0 },
    ...over,
  };
}

describe("buildStudentRiskProjectionData (parity with the H6 engine)", () => {
  it("matches buildStudentRiskSummary for the SAME signals (level, dimensions, action)", () => {
    const s = signals({ failedSubjectCount: 1, belowRequiredAttendanceCount: 2 });
    const engine = buildStudentRiskSummary(assembleStudentRiskInput(s), NOW);
    const data = buildStudentRiskProjectionData("org-1", "s1", s, NOW);

    expect(data.level).toBe(engine.level);
    expect(data.academicLevel).toBe(engine.academic?.level ?? "NONE");
    expect(data.attendanceLevel).toBe(engine.attendance?.level ?? "NONE");
    expect(data.financialLevel).toBe(engine.financial?.level ?? "NONE");
    expect(data.progressionLevel).toBe(engine.progression?.level ?? "NONE");
    expect(data.documentsLevel).toBe(engine.documents?.level ?? "NONE");
    expect(data.recommendedAction).toBe(engine.recommendedAction);
    expect(data.reasons).toHaveLength(engine.reasons.length);
    expect(data.sourceVersion).toBe(STUDENT_RISK_SOURCE_VERSION);
    expect(data.evaluatedAt).toBe(NOW);
  });

  it("persists the permission-aware pair: finance-only risk raises `level` but NOT `levelWithoutFinance`", () => {
    // Only a financial reason (overdue invoice) → CRITICAL with finance, NONE without.
    const data = buildStudentRiskProjectionData("org-1", "s1", signals({
      financial: { overdueInvoiceCount: 2, pendingRefundCount: 0 },
    }), NOW);
    expect(data.level).toBe("CRITICAL");
    expect(data.financialLevel).toBe("CRITICAL");
    expect(data.levelWithoutFinance).toBe("NONE"); // no hidden financial-risk inference
    expect(data.isAtRisk).toBe(true);
  });

  it("keeps a non-financial risk identical across both passes", () => {
    const data = buildStudentRiskProjectionData("org-1", "s1", signals({ failedSubjectCount: 1 }), NOW);
    expect(data.level).toBe("CRITICAL");
    expect(data.levelWithoutFinance).toBe("CRITICAL"); // academic reason survives finance exclusion
  });

  it("distinguishes INSUFFICIENT_DATA (UNKNOWN) from EVALUATED (NONE)", () => {
    const noData = buildStudentRiskProjectionData("org-1", "s1", signals({
      enrollmentCount: 0, activeEnrollmentCount: 0, gradedSubjectCount: 0,
      subjectProgressCount: 0, attendancePercentage: null, documentCount: 1, // avoid the missing-docs HIGH reason
    }), NOW);
    expect(noData.level).toBe("UNKNOWN");
    expect(noData.evaluationStatus).toBe("INSUFFICIENT_DATA");
    expect(noData.isAtRisk).toBe(false);

    const assessedNoRisk = buildStudentRiskProjectionData("org-1", "s1", signals(), NOW);
    expect(assessedNoRisk.level).toBe("NONE");
    expect(assessedNoRisk.evaluationStatus).toBe("EVALUATED");
  });

  it("orders persisted reasons by severity (most severe first)", () => {
    // incomplete = MODERATE, pending justification = HIGH, failed subject = CRITICAL.
    const data = buildStudentRiskProjectionData("org-1", "s1", signals({
      failedSubjectCount: 1, pendingJustificationCount: 1, incompleteAssessmentCount: 1,
    }), NOW);
    const levels = data.reasons.map((r) => r.level);
    expect(levels[0]).toBe("CRITICAL");
    // Non-increasing severity.
    const ranks = { UNKNOWN: -1, NONE: 0, LOW: 1, MODERATE: 2, HIGH: 3, CRITICAL: 4 } as const;
    for (let i = 1; i < levels.length; i++) {
      expect(ranks[levels[i]]).toBeLessThanOrEqual(ranks[levels[i - 1]]);
    }
  });
});

// ── Orchestration (mocked IO) ────────────────────────────────────────────────

const h = vi.hoisted(() => ({
  getStudentById: vi.fn(),
  getEnrollmentsByOrganization: vi.fn(),
  getStudentFinanceSummary: vi.fn(),
  findProgressByOrganization: vi.fn(),
  getStudentSubjectAttendanceViews: vi.fn(),
  getStudentAttendanceSummary: vi.fn(),
  findJustificationsByOrganization: vi.fn(),
  getStudentDocumentCount: vi.fn(),
  findLevelProgressByStudent: vi.fn(),
  findCourseProgressByStudent: vi.fn(),
  upsertStudentRiskProjection: vi.fn(),
  findStudentRiskProjection: vi.fn(),
}));

vi.mock("@/modules/students/services/student.service", () => ({ getStudentById: h.getStudentById }));
vi.mock("@/modules/enrollments/services/enrollment.service", () => ({ getEnrollmentsByOrganization: h.getEnrollmentsByOrganization }));
vi.mock("@/modules/reports/finance/services/financial-reports.service", () => ({ getStudentFinanceSummary: h.getStudentFinanceSummary }));
vi.mock("@/modules/assessments/repositories/student-subject-progress.repository", () => ({ findProgressByOrganization: h.findProgressByOrganization }));
vi.mock("@/modules/attendance/services/attendance-read-model.service", () => ({
  getStudentSubjectAttendanceViews: h.getStudentSubjectAttendanceViews,
  getStudentAttendanceSummary: h.getStudentAttendanceSummary,
}));
vi.mock("@/modules/attendance/repositories/attendance-justification.repository", () => ({ findJustificationsByOrganization: h.findJustificationsByOrganization }));
vi.mock("@/modules/student-documents/services/student-document.service", () => ({ getStudentDocumentCount: h.getStudentDocumentCount }));
vi.mock("@/modules/prerequisites/repositories/student-level-progress.repository", () => ({ findLevelProgressByStudent: h.findLevelProgressByStudent }));
vi.mock("@/modules/prerequisites/repositories/student-course-progress.repository", () => ({ findCourseProgressByStudent: h.findCourseProgressByStudent }));
vi.mock("@/modules/students/repositories/student-risk-projection.repository", () => ({
  upsertStudentRiskProjection: h.upsertStudentRiskProjection,
  findStudentRiskProjection: h.findStudentRiskProjection,
}));

import { recalculateStudentRiskProjection } from "@/modules/students/services/student-risk-projection.service";

const ORG = "org-1";

function primeEmptyLoaders() {
  h.getStudentById.mockResolvedValue({ id: "s1", organizationId: ORG });
  h.getEnrollmentsByOrganization.mockResolvedValue({ data: [{ id: "e1", status: "ACTIVE", classGroupId: null }], total: 1 });
  h.getStudentFinanceSummary.mockResolvedValue({ overdueInvoiceCount: 0, pendingRefundCount: 0 });
  h.findProgressByOrganization.mockResolvedValue({ data: [], total: 0 });
  h.getStudentSubjectAttendanceViews.mockResolvedValue([]);
  h.getStudentAttendanceSummary.mockResolvedValue({ attendancePercentage: 90 });
  h.findJustificationsByOrganization.mockResolvedValue({ total: 0 });
  h.getStudentDocumentCount.mockResolvedValue(2);
  h.findLevelProgressByStudent.mockResolvedValue([]);
  h.findCourseProgressByStudent.mockResolvedValue([]);
}

describe("recalculateStudentRiskProjection (orchestration)", () => {
  beforeEach(() => {
    Object.values(h).forEach((m) => m.mockReset());
    primeEmptyLoaders();
  });

  it("verifies the student belongs to the org before doing anything (tenant guard)", async () => {
    h.getStudentById.mockRejectedValue(new Error("NotFound"));
    await expect(recalculateStudentRiskProjection({ organizationId: ORG, studentId: "s1" })).rejects.toThrow();
    expect(h.upsertStudentRiskProjection).not.toHaveBeenCalled();
  });

  it("upserts when there is no existing projection (changed = true)", async () => {
    h.findStudentRiskProjection.mockResolvedValue(null);
    h.upsertStudentRiskProjection.mockImplementation(async (d) => ({ ...d, id: "p1", levelRank: 0, levelWithoutFinanceRank: 0, createdAt: NOW, updatedAt: NOW }));

    const result = await recalculateStudentRiskProjection({ organizationId: ORG, studentId: "s1", now: NOW });

    expect(result.changed).toBe(true);
    expect(h.upsertStudentRiskProjection).toHaveBeenCalledTimes(1);
    expect(h.upsertStudentRiskProjection.mock.calls[0][0]).toMatchObject({ organizationId: ORG, studentId: "s1", level: "NONE" });
  });

  it("is idempotent: skips the write when the stored classification is unchanged", async () => {
    // Existing projection identical to what empty-but-enrolled signals produce (NONE, EVALUATED).
    h.findStudentRiskProjection.mockResolvedValue({
      id: "p1", organizationId: ORG, studentId: "s1",
      level: "NONE", levelRank: 0, levelWithoutFinance: "NONE", levelWithoutFinanceRank: 0,
      isAtRisk: false, evaluationStatus: "EVALUATED",
      academicLevel: "NONE", attendanceLevel: "NONE", financialLevel: "NONE",
      progressionLevel: "NONE", documentsLevel: "NONE",
      reasons: [], recommendedAction: null, sourceVersion: STUDENT_RISK_SOURCE_VERSION,
      evaluatedAt: new Date("2026-07-01T00:00:00Z"), createdAt: NOW, updatedAt: NOW,
    });

    const result = await recalculateStudentRiskProjection({ organizationId: ORG, studentId: "s1", now: NOW });

    expect(result.changed).toBe(false);
    expect(h.upsertStudentRiskProjection).not.toHaveBeenCalled();
  });

  it("upserts when the stored classification differs (e.g. a new failed subject)", async () => {
    h.findProgressByOrganization.mockResolvedValue({ data: [{ status: "FAILED", finalGrade: 30 }], total: 1 });
    h.findStudentRiskProjection.mockResolvedValue({
      id: "p1", organizationId: ORG, studentId: "s1",
      level: "NONE", levelRank: 0, levelWithoutFinance: "NONE", levelWithoutFinanceRank: 0,
      isAtRisk: false, evaluationStatus: "EVALUATED",
      academicLevel: "NONE", attendanceLevel: "NONE", financialLevel: "NONE",
      progressionLevel: "NONE", documentsLevel: "NONE",
      reasons: [], recommendedAction: null, sourceVersion: STUDENT_RISK_SOURCE_VERSION,
      evaluatedAt: new Date("2026-07-01T00:00:00Z"), createdAt: NOW, updatedAt: NOW,
    });
    h.upsertStudentRiskProjection.mockImplementation(async (d) => ({ ...d, id: "p1", levelRank: 4, levelWithoutFinanceRank: 4, createdAt: NOW, updatedAt: NOW }));

    const result = await recalculateStudentRiskProjection({ organizationId: ORG, studentId: "s1", now: NOW });

    expect(result.changed).toBe(true);
    expect(h.upsertStudentRiskProjection.mock.calls[0][0]).toMatchObject({ level: "CRITICAL", academicLevel: "CRITICAL" });
  });
});
