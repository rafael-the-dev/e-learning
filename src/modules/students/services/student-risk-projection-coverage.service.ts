// =============================================================================
// STUDENT RISK PROJECTION COVERAGE — service (M11 / F-H1)
//
// The canonical rollout gate. `getStudentRiskProjectionCoverage` is the ONLY thing a
// dashboard consults to decide PROJECTION vs LEGACY, and it is FAIL-CLOSED:
//   - an org is `ready` only when a full backfill/reconcile marked it READY at the
//     CURRENT rules version AND a live re-check confirms zero eligible students lack a
//     current-version projection (so a new/soft-deleted/stale student created after the
//     backfill immediately drops the org back to the legacy path);
//   - a stored row that is not a clean READY short-circuits to ready:false with NO live
//     query (cheap for the common not-yet-rolled-out / running / incomplete orgs).
//
// Only markRiskProjectionCoverage{Ready,Incomplete,Running,Failed} — called by the full
// backfill/reconcile — may change the rollout status. The event handler never calls these,
// so a single incidental projection upsert can never promote an org to READY.
// =============================================================================

import { STUDENT_RISK_SOURCE_VERSION } from "@/modules/students/services/student-risk.service";
import {
  countEligibleStudentsForRiskProjection,
  countEligibleStudentsWithoutCurrentRiskProjection,
  countEligibleStudentsWithoutAnyRiskProjection,
  findStudentRiskProjectionCoverage,
  upsertStudentRiskProjectionCoverage,
} from "@/modules/students/repositories/student-risk-projection-coverage.repository";
import {
  STUDENT_RISK_PROJECTION_COVERAGE_STATUS as S,
  type StudentRiskProjectionCoverageResult,
  type StudentRiskProjectionCoverageStatus,
  type StudentRiskProjectionCoverageVerification,
} from "@/modules/students/services/student-risk-projection-coverage.types";

function notCovered(
  status: StudentRiskProjectionCoverageStatus,
  sourceVersion: string,
  over: Partial<StudentRiskProjectionCoverageResult> = {}
): StudentRiskProjectionCoverageResult {
  return {
    ready: false,
    status,
    sourceVersion,
    expectedStudentCount: 0,
    projectedStudentCount: 0,
    missingStudentCount: 0,
    staleStudentCount: 0,
    ...over,
  };
}

/**
 * The fail-closed rollout gate. Resolve ONCE per request and pass the result down so every
 * KPI + watchlist in a response uses the SAME source (never mixing projection and legacy).
 */
export async function getStudentRiskProjectionCoverage(params: {
  organizationId: string;
}): Promise<StudentRiskProjectionCoverageResult> {
  const { organizationId } = params;
  const current = STUDENT_RISK_SOURCE_VERSION;
  const row = await findStudentRiskProjectionCoverage(organizationId);

  // No rollout row → never covered.
  if (!row) return notCovered(S.NOT_STARTED, current);

  // A stored row only "claims" READY when it was marked READY, at the current version,
  // and actually verified. Anything else is not covered — no live query needed.
  const claimsReady =
    row.status === S.READY &&
    row.sourceVersion === current &&
    row.backfilledAt !== null &&
    row.verifiedAt !== null;

  if (!claimsReady) {
    // Surface STALE explicitly when a prior READY is now on an old rules version.
    const status =
      row.status === S.READY && row.sourceVersion !== current ? S.STALE : row.status;
    return notCovered(status, row.sourceVersion, {
      expectedStudentCount: row.expectedStudentCount,
      projectedStudentCount: row.projectedStudentCount,
      missingStudentCount: row.missingStudentCount,
      staleStudentCount: row.staleStudentCount,
    });
  }

  // Claims READY → verify live (fail-closed) that no eligible student lacks a current
  // projection. Catches students created / soft-deleted / version-bumped since verifiedAt.
  const withoutCurrent = await countEligibleStudentsWithoutCurrentRiskProjection(organizationId, current);
  if (withoutCurrent === 0) {
    return {
      ready: true,
      status: S.READY,
      sourceVersion: current,
      expectedStudentCount: row.expectedStudentCount,
      projectedStudentCount: row.projectedStudentCount,
      missingStudentCount: 0,
      staleStudentCount: 0,
    };
  }

  // Drift since the last verification → fall back to legacy until re-reconciled.
  return {
    ready: false,
    status: S.INCOMPLETE,
    sourceVersion: current,
    expectedStudentCount: row.expectedStudentCount,
    projectedStudentCount: Math.max(0, row.expectedStudentCount - withoutCurrent),
    missingStudentCount: withoutCurrent,
    staleStudentCount: 0,
  };
}

/** Measure completeness live (missing = no row at all; stale = only an old-version row). */
export async function verifyStudentRiskProjectionCoverage(params: {
  organizationId: string;
  sourceVersion?: string;
}): Promise<StudentRiskProjectionCoverageVerification> {
  const { organizationId } = params;
  const sourceVersion = params.sourceVersion ?? STUDENT_RISK_SOURCE_VERSION;
  const [expected, withoutCurrent, withoutAny] = await Promise.all([
    countEligibleStudentsForRiskProjection(organizationId),
    countEligibleStudentsWithoutCurrentRiskProjection(organizationId, sourceVersion),
    countEligibleStudentsWithoutAnyRiskProjection(organizationId),
  ]);
  const missing = withoutAny;
  const stale = Math.max(0, withoutCurrent - withoutAny);
  return {
    expectedStudentCount: expected,
    projectedStudentCount: Math.max(0, expected - withoutCurrent),
    missingStudentCount: missing,
    staleStudentCount: stale,
    withoutCurrentCount: withoutCurrent,
  };
}

// ─── State transitions (full backfill/reconcile only) ────────────────────────

export async function markRiskProjectionCoverageRunning(params: {
  organizationId: string;
  sourceVersion?: string;
  expectedStudentCount: number;
  now?: Date;
}): Promise<void> {
  await upsertStudentRiskProjectionCoverage({
    organizationId: params.organizationId,
    sourceVersion: params.sourceVersion ?? STUDENT_RISK_SOURCE_VERSION,
    status: S.RUNNING,
    expectedStudentCount: params.expectedStudentCount,
    backfillStartedAt: params.now ?? new Date(),
    // Clear prior completion markers so the org is NOT considered ready mid-run.
    backfilledAt: null,
    verifiedAt: null,
    errorSummary: null,
  });
}

export async function markRiskProjectionCoverageReady(params: {
  organizationId: string;
  sourceVersion?: string;
  expectedStudentCount: number;
  projectedStudentCount: number;
  now?: Date;
}): Promise<void> {
  const now = params.now ?? new Date();
  await upsertStudentRiskProjectionCoverage({
    organizationId: params.organizationId,
    sourceVersion: params.sourceVersion ?? STUDENT_RISK_SOURCE_VERSION,
    status: S.READY,
    expectedStudentCount: params.expectedStudentCount,
    projectedStudentCount: params.projectedStudentCount,
    missingStudentCount: 0,
    staleStudentCount: 0,
    backfilledAt: now,
    verifiedAt: now,
    errorSummary: null,
  });
}

export async function markRiskProjectionCoverageIncomplete(params: {
  organizationId: string;
  sourceVersion?: string;
  expectedStudentCount: number;
  projectedStudentCount: number;
  missingStudentCount: number;
  staleStudentCount: number;
  now?: Date;
}): Promise<void> {
  const now = params.now ?? new Date();
  await upsertStudentRiskProjectionCoverage({
    organizationId: params.organizationId,
    sourceVersion: params.sourceVersion ?? STUDENT_RISK_SOURCE_VERSION,
    status: S.INCOMPLETE,
    expectedStudentCount: params.expectedStudentCount,
    projectedStudentCount: params.projectedStudentCount,
    missingStudentCount: params.missingStudentCount,
    staleStudentCount: params.staleStudentCount,
    backfilledAt: now,
    verifiedAt: now,
    errorSummary: null,
  });
}

export async function markRiskProjectionCoverageFailed(params: {
  organizationId: string;
  sourceVersion?: string;
  errorSummary: string;
}): Promise<void> {
  await upsertStudentRiskProjectionCoverage({
    organizationId: params.organizationId,
    sourceVersion: params.sourceVersion ?? STUDENT_RISK_SOURCE_VERSION,
    status: S.FAILED,
    // A short operational code/summary only — never a stack trace or sensitive data.
    errorSummary: params.errorSummary.slice(0, 1000),
  });
}
