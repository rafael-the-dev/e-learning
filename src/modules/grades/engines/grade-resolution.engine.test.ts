import { describe, it, expect } from "vitest";
import {
  gradeResolutionEngine,
  GRADE_RESOLUTION_STRATEGY,
} from "@/modules/grades/engines/grade-resolution.engine";

describe("GradeResolutionEngine", () => {
  describe("BEST_SCORE (default)", () => {
    it("keeps the recovery grade when it is higher", () => {
      const r = gradeResolutionEngine.resolve({ originalGrade: 40, recoveryGrade: 65 });
      expect(r.effectiveGrade).toBe(65);
      expect(r.source).toBe("RECOVERY");
      expect(r.strategy).toBe(GRADE_RESOLUTION_STRATEGY.BEST_SCORE);
    });

    it("keeps the original grade when it is higher", () => {
      const r = gradeResolutionEngine.resolve({ originalGrade: 70, recoveryGrade: 55 });
      expect(r.effectiveGrade).toBe(70);
      expect(r.source).toBe("ORIGINAL");
    });

    it("prefers recovery on a tie (>=)", () => {
      const r = gradeResolutionEngine.resolve({ originalGrade: 50, recoveryGrade: 50 });
      expect(r.effectiveGrade).toBe(50);
      expect(r.source).toBe("RECOVERY");
    });

    it("is the strategy used when none is supplied", () => {
      const r = gradeResolutionEngine.resolve({ originalGrade: 30, recoveryGrade: 80 });
      expect(r.strategy).toBe(GRADE_RESOLUTION_STRATEGY.BEST_SCORE);
    });

    it("falls back to BEST_SCORE for an unknown strategy", () => {
      const r = gradeResolutionEngine.resolve({
        originalGrade: 30,
        recoveryGrade: 80,
        // @ts-expect-error intentionally invalid
        strategy: "NONSENSE",
      });
      expect(r.strategy).toBe(GRADE_RESOLUTION_STRATEGY.BEST_SCORE);
      expect(r.effectiveGrade).toBe(80);
    });
  });

  describe("LAST_SCORE / REPLACE", () => {
    it("always takes the recovery grade even if lower (LAST_SCORE)", () => {
      const r = gradeResolutionEngine.resolve({
        originalGrade: 90,
        recoveryGrade: 55,
        strategy: GRADE_RESOLUTION_STRATEGY.LAST_SCORE,
      });
      expect(r.effectiveGrade).toBe(55);
      expect(r.source).toBe("RECOVERY");
    });

    it("REPLACE behaves like LAST_SCORE", () => {
      const r = gradeResolutionEngine.resolve({
        originalGrade: 90,
        recoveryGrade: 55,
        strategy: GRADE_RESOLUTION_STRATEGY.REPLACE,
      });
      expect(r.effectiveGrade).toBe(55);
    });
  });

  describe("AVERAGE", () => {
    it("averages original and recovery", () => {
      const r = gradeResolutionEngine.resolve({
        originalGrade: 40,
        recoveryGrade: 60,
        strategy: GRADE_RESOLUTION_STRATEGY.AVERAGE,
      });
      expect(r.effectiveGrade).toBe(50);
      expect(r.source).toBe("AVERAGE");
    });

    it("rounds to two decimals", () => {
      const r = gradeResolutionEngine.resolve({
        originalGrade: 41,
        recoveryGrade: 50,
        strategy: GRADE_RESOLUTION_STRATEGY.AVERAGE,
      });
      expect(r.effectiveGrade).toBe(45.5);
    });
  });

  describe("no original grade", () => {
    it("uses the recovery grade regardless of strategy", () => {
      for (const strategy of Object.values(GRADE_RESOLUTION_STRATEGY)) {
        const r = gradeResolutionEngine.resolve({ originalGrade: null, recoveryGrade: 72, strategy });
        expect(r.effectiveGrade).toBe(72);
        expect(r.source).toBe("RECOVERY");
      }
    });
  });
});
