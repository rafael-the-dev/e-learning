import { describe, it, expect } from "vitest";
import { buildStudentRiskSummary, type StudentRiskInput } from "../student-risk.service";

const NOW = new Date("2026-07-20T00:00:00Z");

function input(overrides: Partial<StudentRiskInput> = {}): StudentRiskInput {
  return {
    blockedLevelCount: 0,
    recoveryRequiredCount: 0,
    hasActiveEnrollment: true,
    hasAnyEnrollment: true,
    failedSubjectCount: 0,
    incompleteAssessmentCount: 0,
    belowRequiredAttendanceCount: 0,
    pendingJustificationCount: 0,
    documentCount: 1, // has documents → no missing-documents reason
    financial: { overdueInvoiceCount: 0, pendingRefundCount: 0 },
    hasAcademicData: true,
    hasAttendanceData: true,
    ...overrides,
  };
}

describe("buildStudentRiskSummary", () => {
  it("a healthy student with data is NONE, not at risk, no reasons", () => {
    const r = buildStudentRiskSummary(input(), NOW);
    expect(r.level).toBe("NONE");
    expect(r.isAtRisk).toBe(false);
    expect(r.reasons).toHaveLength(0);
    expect(r.recommendedAction).toBeNull();
    expect(r.evaluatedAt).toBe(NOW);
  });

  // ── Academic ──────────────────────────────────────────────────────────────
  it("failed subjects → CRITICAL academic reason", () => {
    const r = buildStudentRiskSummary(input({ failedSubjectCount: 2 }), NOW);
    expect(r.level).toBe("CRITICAL");
    expect(r.academic?.level).toBe("CRITICAL");
    expect(r.reasons.find((x) => x.id === "failed-subject")?.dimension).toBe("academic");
  });

  it("incomplete assessments → MODERATE academic reason", () => {
    const r = buildStudentRiskSummary(input({ incompleteAssessmentCount: 1 }), NOW);
    expect(r.level).toBe("MODERATE");
    expect(r.academic?.level).toBe("MODERATE");
  });

  // ── Attendance ────────────────────────────────────────────────────────────
  it("below-required attendance → CRITICAL attendance reason", () => {
    const r = buildStudentRiskSummary(input({ belowRequiredAttendanceCount: 1 }), NOW);
    expect(r.level).toBe("CRITICAL");
    expect(r.attendance?.level).toBe("CRITICAL");
  });

  it("pending justifications → HIGH attendance reason", () => {
    const r = buildStudentRiskSummary(input({ pendingJustificationCount: 3 }), NOW);
    expect(r.attendance?.level).toBe("HIGH");
  });

  // ── Progression ───────────────────────────────────────────────────────────
  it("blocked level → CRITICAL progression; recovery → HIGH; inactive → MODERATE", () => {
    expect(buildStudentRiskSummary(input({ blockedLevelCount: 1 }), NOW).progression?.level).toBe("CRITICAL");
    expect(buildStudentRiskSummary(input({ recoveryRequiredCount: 1 }), NOW).progression?.level).toBe("HIGH");
    expect(
      buildStudentRiskSummary(input({ hasActiveEnrollment: false, hasAnyEnrollment: true }), NOW).progression?.level
    ).toBe("MODERATE");
  });

  // ── Financial (permission-aware) ────────────────────────────────────────────
  it("with finance authorized: overdue → CRITICAL, pending refund → HIGH", () => {
    const overdue = buildStudentRiskSummary(input({ financial: { overdueInvoiceCount: 1, pendingRefundCount: 0 } }), NOW);
    expect(overdue.financial?.level).toBe("CRITICAL");
    expect(overdue.level).toBe("CRITICAL");

    const refund = buildStudentRiskSummary(input({ financial: { overdueInvoiceCount: 0, pendingRefundCount: 2 } }), NOW);
    expect(refund.financial?.level).toBe("HIGH");
  });

  it("without finance authorization: financial dimension is null and NOT inferred into the global level", () => {
    // Same student, but finance not authorized. Even though (internally) they have an
    // overdue invoice, the viewer must see financial = null and a global level that
    // excludes finance entirely — no hidden-risk inference.
    const r = buildStudentRiskSummary(input({ financial: null }), NOW);
    expect(r.financial).toBeNull();
    expect(r.reasons.some((x) => x.dimension === "financial")).toBe(false);
    expect(r.level).toBe("NONE"); // no other issue → NONE, never HIGH/CRITICAL from hidden debt
  });

  it("an unauthorized-finance viewer gets a LOWER-or-equal global level than the full picture", () => {
    const full = buildStudentRiskSummary(input({ financial: { overdueInvoiceCount: 1, pendingRefundCount: 0 } }), NOW);
    const filtered = buildStudentRiskSummary(input({ financial: null }), NOW);
    expect(full.level).toBe("CRITICAL");
    expect(filtered.level).toBe("NONE"); // debt reason cannot leak through the global level
  });

  // ── Documents (permission-aware, mirrors finance) ────────────────────────────
  it("no documents → HIGH documents reason", () => {
    const r = buildStudentRiskSummary(input({ documentCount: 0 }), NOW);
    expect(r.documents?.level).toBe("HIGH");
  });

  it("documentCount null (viewer lacks documents permission): dimension null, no reason, not inferred (F-M6)", () => {
    // Same student with zero documents internally, but the viewer can't see documents.
    // The engine must treat it like unauthorized finance: null dimension, no reason,
    // and no contribution to the global level (no hidden-risk inference).
    const r = buildStudentRiskSummary(input({ documentCount: null }), NOW);
    expect(r.documents).toBeNull();
    expect(r.reasons.some((x) => x.id === "missing-documents")).toBe(false);
    expect(r.reasons.some((x) => x.dimension === "documents")).toBe(false);
    expect(r.level).toBe("NONE"); // the missing-documents HIGH cannot leak through the level
  });

  // ── Precedence & combinations ────────────────────────────────────────────────
  it("global level = the most severe reason across dimensions", () => {
    const r = buildStudentRiskSummary(
      input({ incompleteAssessmentCount: 1, pendingJustificationCount: 1, failedSubjectCount: 1 }),
      NOW
    );
    expect(r.level).toBe("CRITICAL"); // failed (CRITICAL) wins over HIGH/MODERATE
    expect(r.reasons.length).toBe(3);
    // recommendedAction comes from the most severe reason.
    expect(r.recommendedAction).toMatch(/apoio académico|recuperação/i);
  });

  it("multiple dimensions each carry their own reasons and level", () => {
    const r = buildStudentRiskSummary(input({ failedSubjectCount: 1, belowRequiredAttendanceCount: 1 }), NOW);
    expect(r.academic?.level).toBe("CRITICAL");
    expect(r.attendance?.level).toBe("CRITICAL");
    expect(r.isAtRisk).toBe(true);
  });

  // ── Empty / UNKNOWN ───────────────────────────────────────────────────────────
  it("no data at all → UNKNOWN (absence of data is not absence of risk)", () => {
    const r = buildStudentRiskSummary(
      input({
        hasAnyEnrollment: false,
        hasActiveEnrollment: false,
        hasAcademicData: false,
        hasAttendanceData: false,
        documentCount: 1, // avoid the missing-documents reason so we reach the UNKNOWN branch
      }),
      NOW
    );
    expect(r.level).toBe("UNKNOWN");
    expect(r.isAtRisk).toBe(false);
  });

  it("has data but nothing wrong → NONE (assessed, no risk)", () => {
    const r = buildStudentRiskSummary(input(), NOW);
    expect(r.level).toBe("NONE");
  });

  // ── Consistency ────────────────────────────────────────────────────────────────
  it("consistency: identical inputs always produce identical level + reasons", () => {
    const a = buildStudentRiskSummary(input({ failedSubjectCount: 1, pendingJustificationCount: 2 }), NOW);
    const b = buildStudentRiskSummary(input({ failedSubjectCount: 1, pendingJustificationCount: 2 }), NOW);
    expect(a.level).toBe(b.level);
    expect(a.reasons.map((r) => r.id)).toEqual(b.reasons.map((r) => r.id));
    expect(a.recommendedAction).toBe(b.recommendedAction);
  });
});
