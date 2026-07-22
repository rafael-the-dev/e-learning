// =============================================================================
// RISK PROJECTION READINESS + RISK METRIC DTO (F-M8)
//
// The single gate every risk dashboard/watchlist consults, and the availability
// envelope every aggregated risk figure travels in.
//
// After the M11 rollout, dashboards read ONLY the canonical StudentRiskProjection.
// There is NO legacy fallback: when an org's projection is not READY the consumer
// returns an EXPLICIT "unavailable" state — never a number computed by a different
// (legacy) semantics, and never an empty result that reads as "0 at risk".
//
//   READY                                   → AVAILABLE (canonical data)
//   NOT_STARTED / RUNNING / INCOMPLETE / FAILED (or a STALE, old-version rollout)
//                                            → UNAVAILABLE (fail-closed, explicit)
//
// A rollback between the two business semantics must be an APPLICATION-VERSION
// rollback, not a runtime flag — so there is intentionally no env kill-switch here.
// =============================================================================

import { getStudentRiskProjectionCoverage } from "@/modules/students/services/student-risk-projection-coverage.service";
import type { StudentRiskProjectionCoverageStatus } from "@/modules/students/services/student-risk-projection-coverage.types";

// The reason a risk figure could not be produced from the canonical projection. Mirrors the
// coverage rollout state (STALE collapses into INCOMPLETE — an old-version rollout is, for the
// current rules, simply not complete).
export type RiskMetricUnavailableReason =
  | "PROJECTION_NOT_STARTED"
  | "PROJECTION_RUNNING"
  | "PROJECTION_INCOMPLETE"
  | "PROJECTION_FAILED";

// Every aggregated risk figure returned to a dashboard is wrapped in this envelope so the UI
// can distinguish a REAL zero (AVAILABLE + 0 / []) from "cannot be evaluated yet" (UNAVAILABLE).
export type RiskMetric<T> =
  | { status: "AVAILABLE"; data: T; evaluatedAt: Date }
  | { status: "UNAVAILABLE"; reason: RiskMetricUnavailableReason };

export type UnavailableReadiness = Extract<RiskProjectionReadiness, { ready: false }>;

// The canonical readiness answer. `ready:true` carries the verified source version + timestamp;
// `ready:false` carries the operational status + a human reason + the completeness counts.
export type RiskProjectionReadiness =
  | { ready: true; sourceVersion: string; verifiedAt: Date }
  | {
      ready: false;
      status: "NOT_STARTED" | "RUNNING" | "INCOMPLETE" | "FAILED";
      reason: string;
      processedCount?: number;
      missingCount?: number;
    };

const READINESS_REASON_TEXT: Record<UnavailableReadiness["status"], string> = {
  NOT_STARTED: "A projeção de risco ainda não foi iniciada para esta organização.",
  RUNNING: "A projeção de risco está a ser preparada.",
  INCOMPLETE: "A projeção de risco está incompleta ou desatualizada.",
  FAILED: "A preparação da projeção de risco falhou.",
};

const READINESS_TO_METRIC_REASON: Record<UnavailableReadiness["status"], RiskMetricUnavailableReason> = {
  NOT_STARTED: "PROJECTION_NOT_STARTED",
  RUNNING: "PROJECTION_RUNNING",
  INCOMPLETE: "PROJECTION_INCOMPLETE",
  FAILED: "PROJECTION_FAILED",
};

function toReadinessStatus(s: StudentRiskProjectionCoverageStatus): UnavailableReadiness["status"] {
  switch (s) {
    case "NOT_STARTED":
      return "NOT_STARTED";
    case "RUNNING":
      return "RUNNING";
    case "FAILED":
      return "FAILED";
    // STALE = a previous READY on an OLD rules version → not complete for the current version.
    // A residual (should-not-happen) non-ready READY is treated defensively as INCOMPLETE.
    case "INCOMPLETE":
    case "STALE":
    case "READY":
    default:
      return "INCOMPLETE";
  }
}

/**
 * Resolve ONCE per request and pass the result down, so every KPI + watchlist in one response
 * uses the SAME source and can never mix projection and legacy. Fail-closed: anything other
 * than a verified current-version READY is `ready:false`.
 */
export async function resolveRiskProjectionReadiness(params: {
  organizationId: string;
}): Promise<RiskProjectionReadiness> {
  const { organizationId } = params;
  const coverage = await getStudentRiskProjectionCoverage({ organizationId });

  if (coverage.ready) {
    // Observability (per-org, no PII).
    console.info(
      `[risk-projection-read] org=${organizationId} ready=true status=READY sourceVersion=${coverage.sourceVersion}`
    );
    return { ready: true, sourceVersion: coverage.sourceVersion, verifiedAt: new Date() };
  }

  const status = toReadinessStatus(coverage.status);
  // A STALE rollout means the stored rows are on an older rules version than the reads require.
  if (coverage.status === "STALE") {
    console.warn(
      `[risk-projection-read] org=${organizationId} source_version_mismatch stored=${coverage.sourceVersion}`
    );
  }
  console.info(
    `[risk-projection-read] org=${organizationId} ready=false status=${coverage.status} ` +
      `reason=${READINESS_TO_METRIC_REASON[status]} missing=${coverage.missingStudentCount}`
  );

  return {
    ready: false,
    status,
    reason: READINESS_REASON_TEXT[status],
    processedCount: coverage.projectedStudentCount,
    missingCount: coverage.missingStudentCount,
  };
}

// ── RiskMetric constructors ─────────────────────────────────────────────────

export function availableRiskMetric<T>(data: T, evaluatedAt: Date): RiskMetric<T> {
  return { status: "AVAILABLE", data, evaluatedAt };
}

/** Build the UNAVAILABLE metric for a not-ready readiness (maps the status to the UI reason). */
export function unavailableRiskMetric<T>(readiness: UnavailableReadiness): RiskMetric<T> {
  return { status: "UNAVAILABLE", reason: READINESS_TO_METRIC_REASON[readiness.status] };
}
