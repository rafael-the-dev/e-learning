import { describe, it, expect } from "vitest";
import {
  assembleStudentRiskInput,
  buildStudentRiskSummary,
  riskLevelRank,
  type StudentRiskSignals,
  type StudentRiskSummary,
  type StudentRiskDimensionKey,
} from "../student-risk.service";

// =============================================================================
// M12 — Property-based tests (Story 6). Instead of a handful of examples, generate
// thousands of signal combinations (attendance + payments + grades + documents +
// progression) and assert the engine invariants that the persisted projection
// relies on hold for ALL of them:
//
//   1. Determinism — same signals → same classification (projection == engine, always).
//   2. Global level = max reason level (or UNKNOWN/NONE by data sufficiency).
//   3. isAtRisk ⇔ level ≥ LOW.
//   4. Each dimension's level = max of its own reasons (or NONE).
//   5. Permission envelopes: financial null ⇔ input.financial null; documents null ⇔
//      documentCount null. A dimension that is null contributes NO reason.
//   6. No-inference / finance-blind ranking: removing a dimension (finance) can only
//      LOWER or keep the global level — it can never raise it (the levelWithoutFinance
//      the projection stores is always ≤ the full level).
//
// A tiny seeded PRNG keeps failures reproducible (no Math.random / Date).
// =============================================================================

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeSignals(rand: () => number): StudentRiskSignals {
  const int = (max: number) => Math.floor(rand() * (max + 1));
  const maybeNull = <T>(v: T): T | null => (rand() < 0.25 ? null : v);
  return {
    enrollmentCount: int(3),
    activeEnrollmentCount: int(3),
    blockedLevelCount: int(2),
    recoveryRequiredCount: int(2),
    failedSubjectCount: int(4),
    incompleteAssessmentCount: int(4),
    gradedSubjectCount: int(6),
    subjectProgressCount: int(6),
    belowRequiredAttendanceCount: int(3),
    pendingJustificationCount: int(3),
    documentCount: maybeNull(int(5)),
    attendancePercentage: maybeNull(Math.round(rand() * 100)),
    financial: maybeNull({ overdueInvoiceCount: int(3), pendingRefundCount: int(3) }),
  };
}

const DIMENSIONS: StudentRiskDimensionKey[] = ["academic", "attendance", "financial", "progression", "documents"];

function dimensionOf(summary: StudentRiskSummary, key: StudentRiskDimensionKey) {
  return summary[key];
}

const NOW = new Date("2026-07-22T00:00:00Z");
const ITERATIONS = 5000;

describe("buildStudentRiskSummary — property-based invariants", () => {
  it(`holds every invariant across ${ITERATIONS} random signal combinations`, () => {
    const rand = mulberry32(0x5eed);

    for (let i = 0; i < ITERATIONS; i++) {
      const signals = makeSignals(rand);
      const input = assembleStudentRiskInput(signals);
      const summary = buildStudentRiskSummary(input, NOW);

      // 1. Determinism — same input, same output (projection == engine, reproducibly).
      const again = buildStudentRiskSummary(input, NOW);
      expect(again).toEqual(summary);

      // 2. Global level = max reason level, or UNKNOWN/NONE when there are none.
      if (summary.reasons.length > 0) {
        const maxRank = Math.max(...summary.reasons.map((r) => riskLevelRank(r.level)));
        expect(riskLevelRank(summary.level)).toBe(maxRank);
      } else {
        expect(["UNKNOWN", "NONE"]).toContain(summary.level);
      }

      // 3. isAtRisk ⇔ level ≥ LOW.
      expect(summary.isAtRisk).toBe(riskLevelRank(summary.level) >= riskLevelRank("LOW"));

      // 4 + 5. Per-dimension consistency + permission envelopes.
      for (const key of DIMENSIONS) {
        const dim = dimensionOf(summary, key);
        if (key === "financial" && input.financial === null) {
          expect(dim).toBeNull();
        } else if (key === "documents" && input.documentCount === null) {
          expect(dim).toBeNull();
        }
        if (dim !== null) {
          // Every reason in a dimension belongs to it.
          expect(dim.reasons.every((r) => r.dimension === key)).toBe(true);
          const expected = dim.reasons.length
            ? Math.max(...dim.reasons.map((r) => riskLevelRank(r.level)))
            : riskLevelRank("NONE");
          expect(riskLevelRank(dim.level)).toBe(expected);
        } else {
          // A null (unauthorized/not-evaluable) dimension contributes no global reason.
          expect(summary.reasons.some((r) => r.dimension === key)).toBe(false);
        }
      }

      // 6. No-inference / finance-blind ranking: dropping finance never raises the level.
      const financeBlind = buildStudentRiskSummary({ ...input, financial: null }, NOW);
      expect(riskLevelRank(financeBlind.level)).toBeLessThanOrEqual(riskLevelRank(summary.level));
      expect(financeBlind.reasons.some((r) => r.dimension === "financial")).toBe(false);
    }
  });
});
