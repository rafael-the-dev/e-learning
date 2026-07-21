// =============================================================================
// STUDENT RISK PROJECTION COVERAGE — types (M11 / F-H1)
//
// The rollout state that decides whether an org's dashboards may read the canonical
// risk projection. Readiness means COMPLETENESS (every eligible student has a
// current-version projection), never mere existence of one row.
// =============================================================================

// SQL Server has no native enums — a validated string union (const object) instead.
export const STUDENT_RISK_PROJECTION_COVERAGE_STATUS = {
  NOT_STARTED: "NOT_STARTED",
  RUNNING: "RUNNING",
  INCOMPLETE: "INCOMPLETE",
  READY: "READY",
  STALE: "STALE",
  FAILED: "FAILED",
} as const;

export type StudentRiskProjectionCoverageStatus =
  (typeof STUDENT_RISK_PROJECTION_COVERAGE_STATUS)[keyof typeof STUDENT_RISK_PROJECTION_COVERAGE_STATUS];

/** The persisted rollout row as a domain DTO. */
export interface StudentRiskProjectionCoverageRecord {
  organizationId: string;
  sourceVersion: string;
  status: StudentRiskProjectionCoverageStatus;
  expectedStudentCount: number;
  projectedStudentCount: number;
  missingStudentCount: number;
  staleStudentCount: number;
  errorSummary: string | null;
  backfillStartedAt: Date | null;
  backfilledAt: Date | null;
  verifiedAt: Date | null;
}

/** The gate answer consumed by the dashboards — `ready` is authoritative and fail-closed. */
export interface StudentRiskProjectionCoverageResult {
  ready: boolean;
  status: StudentRiskProjectionCoverageStatus;
  sourceVersion: string;
  expectedStudentCount: number;
  projectedStudentCount: number;
  missingStudentCount: number;
  staleStudentCount: number;
}

/** The live completeness measurement (used by the verify step + the gate's fail-closed check). */
export interface StudentRiskProjectionCoverageVerification {
  expectedStudentCount: number;
  projectedStudentCount: number;
  missingStudentCount: number;
  staleStudentCount: number;
  /** eligible students lacking a CURRENT-version projection (= missing + stale). */
  withoutCurrentCount: number;
}
