import type {
  FinancialTrustScore,
  FinancialTrustScoreDeduction,
  FinancialTrustScoreInputs,
  TrustScoreRating,
} from "../types";

// Deduction weights — see docs/financial-reports.md "Trust Score Formula" for rationale.
const DEDUCTIONS: Array<{
  key: keyof FinancialTrustScoreInputs;
  reason: FinancialTrustScoreDeduction["reason"];
  points: number;
}> = [
  { key: "hasUnresolvedCriticalIntegrity", reason: "UNRESOLVED_CRITICAL_INTEGRITY", points: 25 },
  { key: "hasUnresolvedHighIntegrity", reason: "UNRESOLVED_HIGH_INTEGRITY", points: 15 },
  { key: "hasCriticalReconciliationMismatch", reason: "CRITICAL_RECONCILIATION_MISMATCH", points: 20 },
  { key: "hasDuplicateLedgerEntries", reason: "DUPLICATE_LEDGER_ENTRIES", points: 10 },
  { key: "hasOrphanLedgerEntries", reason: "ORPHAN_LEDGER_ENTRIES", points: 10 },
  { key: "hasWalletLiabilityMismatch", reason: "WALLET_LIABILITY_MISMATCH", points: 10 },
];

export function rateTrustScore(score: number): TrustScoreRating {
  if (score >= 90) return "HEALTHY";
  if (score >= 70) return "NEEDS_REVIEW";
  if (score >= 40) return "RISKY";
  return "UNSAFE";
}

// Defensive floor/ceiling — today's deduction weights sum to 90 (never below a
// score of 10), but the clamp guards against future weight changes pushing
// the raw total past either bound.
export function clampScore(raw: number): number {
  return Math.min(100, Math.max(0, raw));
}

export function calculateFinancialTrustScore(
  inputs: FinancialTrustScoreInputs
): FinancialTrustScore {
  const deductions: FinancialTrustScoreDeduction[] = DEDUCTIONS.filter((d) => inputs[d.key]).map(
    (d) => ({ reason: d.reason, points: d.points })
  );

  const totalDeduction = deductions.reduce((sum, d) => sum + d.points, 0);
  const score = clampScore(100 - totalDeduction);

  return { score, rating: rateTrustScore(score), deductions };
}
