// =============================================================================
// STUDENT RISK PROJECTION — persistence contract (M11)
//
// The persisted, read-optimized shape of the canonical risk classification. The
// RULES live in the risk engine (buildStudentRiskSummary, H6); this is only the
// stored output that Student 360, the dashboards and the watchlists read. No
// consumer re-derives risk — they read these rows.
// =============================================================================

import type {
  StudentRiskLevel,
  StudentRiskReason,
} from "@/modules/students/services/student-risk.service";

// EVALUATED = the engine could assess the student (NONE or a real level).
// INSUFFICIENT_DATA = nothing to assess (the engine's UNKNOWN). Dashboards must keep the
// two apart ("Sem risco" vs "Dados insuficientes"), never fold both into "no risk".
export type StudentRiskEvaluationStatus = "EVALUATED" | "INSUFFICIENT_DATA";

/** The persisted projection as a domain DTO (reasons parsed from JSON, decimals normalized). */
export interface StudentRiskProjection {
  id: string;
  organizationId: string;
  studentId: string;
  // Global level with ALL dimensions (finance included — the projection is org-internal).
  level: StudentRiskLevel;
  levelRank: number;
  // Global level EXCLUDING finance — served to viewers without finance permission.
  levelWithoutFinance: StudentRiskLevel;
  levelWithoutFinanceRank: number;
  isAtRisk: boolean;
  evaluationStatus: StudentRiskEvaluationStatus;
  academicLevel: StudentRiskLevel;
  attendanceLevel: StudentRiskLevel;
  financialLevel: StudentRiskLevel;
  progressionLevel: StudentRiskLevel;
  documentsLevel: StudentRiskLevel;
  reasons: StudentRiskReason[];
  recommendedAction: string | null;
  sourceVersion: string;
  evaluatedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * The write payload for a projection. Callers pass the engine's decision; the repository
 * derives the numeric ranks from the levels (single source: riskLevelRank) so ranks can
 * never drift from the persisted level.
 */
export interface UpsertStudentRiskProjectionData {
  organizationId: string;
  studentId: string;
  level: StudentRiskLevel;
  levelWithoutFinance: StudentRiskLevel;
  isAtRisk: boolean;
  evaluationStatus: StudentRiskEvaluationStatus;
  academicLevel: StudentRiskLevel;
  attendanceLevel: StudentRiskLevel;
  financialLevel: StudentRiskLevel;
  progressionLevel: StudentRiskLevel;
  documentsLevel: StudentRiskLevel;
  reasons: StudentRiskReason[];
  recommendedAction: string | null;
  sourceVersion: string;
  evaluatedAt: Date;
}

/** Org-wide KPI counts for the risk dashboards — one classification, three buckets + a breakdown. */
export interface StudentRiskLevelCounts {
  /** level ≥ LOW */
  atRisk: number;
  /** level === NONE (assessed, no risk) */
  noRisk: number;
  /** level === UNKNOWN (could not assess) */
  insufficientData: number;
  byLevel: Record<StudentRiskLevel, number>;
}

/** A watchlist row read straight from the projection (no re-derivation, no per-student engine). */
export interface StudentRiskWatchlistRow {
  studentId: string;
  studentName: string;
  level: StudentRiskLevel;
  academicLevel: StudentRiskLevel;
  attendanceLevel: StudentRiskLevel;
  financialLevel: StudentRiskLevel;
  progressionLevel: StudentRiskLevel;
  documentsLevel: StudentRiskLevel;
  /** The engine's top reason (already severity-ordered when persisted). */
  primaryReason: StudentRiskReason | null;
  recommendedAction: string | null;
  evaluatedAt: Date;
}
