import { describe, it, expect } from "vitest";
import { calculateFinancialTrustScore, clampScore, rateTrustScore } from "../utils/trust-score";
import type { FinancialTrustScoreInputs } from "../types";

const ALL_CLEAR: FinancialTrustScoreInputs = {
  hasUnresolvedCriticalIntegrity: false,
  hasUnresolvedHighIntegrity: false,
  hasCriticalReconciliationMismatch: false,
  hasDuplicateLedgerEntries: false,
  hasOrphanLedgerEntries: false,
  hasWalletLiabilityMismatch: false,
};

// ---------------------------------------------------------------------------
// 5. Trust score formula correct
// ---------------------------------------------------------------------------

describe("calculateFinancialTrustScore — formula (test 5)", () => {
  it("returns 100 with no issues", () => {
    const result = calculateFinancialTrustScore(ALL_CLEAR);
    expect(result.score).toBe(100);
    expect(result.rating).toBe("HEALTHY");
    expect(result.deductions).toEqual([]);
  });

  it("subtracts 25 for unresolved CRITICAL integrity issues", () => {
    const result = calculateFinancialTrustScore({ ...ALL_CLEAR, hasUnresolvedCriticalIntegrity: true });
    expect(result.score).toBe(75);
    expect(result.deductions).toEqual([{ reason: "UNRESOLVED_CRITICAL_INTEGRITY", points: 25 }]);
  });

  it("subtracts 15 for unresolved HIGH integrity issues", () => {
    const result = calculateFinancialTrustScore({ ...ALL_CLEAR, hasUnresolvedHighIntegrity: true });
    expect(result.score).toBe(85);
  });

  it("subtracts 20 for critical reconciliation mismatches", () => {
    const result = calculateFinancialTrustScore({ ...ALL_CLEAR, hasCriticalReconciliationMismatch: true });
    expect(result.score).toBe(80);
  });

  it("subtracts 10 for duplicate ledger entries", () => {
    const result = calculateFinancialTrustScore({ ...ALL_CLEAR, hasDuplicateLedgerEntries: true });
    expect(result.score).toBe(90);
  });

  it("subtracts 10 for orphan ledger entries", () => {
    const result = calculateFinancialTrustScore({ ...ALL_CLEAR, hasOrphanLedgerEntries: true });
    expect(result.score).toBe(90);
  });

  it("subtracts 10 for a wallet liability mismatch", () => {
    const result = calculateFinancialTrustScore({ ...ALL_CLEAR, hasWalletLiabilityMismatch: true });
    expect(result.score).toBe(90);
  });

  it("stacks all six deductions additively (100 - 90 = 10)", () => {
    const result = calculateFinancialTrustScore({
      hasUnresolvedCriticalIntegrity: true,
      hasUnresolvedHighIntegrity: true,
      hasCriticalReconciliationMismatch: true,
      hasDuplicateLedgerEntries: true,
      hasOrphanLedgerEntries: true,
      hasWalletLiabilityMismatch: true,
    });
    expect(result.score).toBe(10);
    expect(result.deductions).toHaveLength(6);
    expect(result.rating).toBe("UNSAFE");
  });

  it("rates the four bands correctly at their boundaries", () => {
    expect(rateTrustScore(100)).toBe("HEALTHY");
    expect(rateTrustScore(90)).toBe("HEALTHY");
    expect(rateTrustScore(89)).toBe("NEEDS_REVIEW");
    expect(rateTrustScore(70)).toBe("NEEDS_REVIEW");
    expect(rateTrustScore(69)).toBe("RISKY");
    expect(rateTrustScore(40)).toBe("RISKY");
    expect(rateTrustScore(39)).toBe("UNSAFE");
    expect(rateTrustScore(0)).toBe("UNSAFE");
  });
});

// ---------------------------------------------------------------------------
// 6. Trust score clamps 0–100
// ---------------------------------------------------------------------------

describe("clampScore — clamps 0-100 (test 6)", () => {
  it("clamps values below 0 up to 0", () => {
    expect(clampScore(-50)).toBe(0);
  });

  it("clamps values above 100 down to 100", () => {
    expect(clampScore(150)).toBe(100);
  });

  it("leaves in-range values untouched", () => {
    expect(clampScore(42)).toBe(42);
    expect(clampScore(0)).toBe(0);
    expect(clampScore(100)).toBe(100);
  });

  it("calculateFinancialTrustScore never returns a negative score even at maximum deduction", () => {
    const result = calculateFinancialTrustScore({
      hasUnresolvedCriticalIntegrity: true,
      hasUnresolvedHighIntegrity: true,
      hasCriticalReconciliationMismatch: true,
      hasDuplicateLedgerEntries: true,
      hasOrphanLedgerEntries: true,
      hasWalletLiabilityMismatch: true,
    });
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
  });
});
