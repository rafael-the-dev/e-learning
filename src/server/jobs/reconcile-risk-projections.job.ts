import { advanceReconcileRunsWithinBudget } from "@/modules/students/services/student-risk-projection-reconcile.service";

// =============================================================================
// RECONCILE STUDENT RISK PROJECTIONS — periodic job (F-H3 → F-H4)
//
// The safety net for everything the direct event handlers (F-H2) cannot guarantee:
// time-driven drift, lost/FAILED events (the bus has no outbox/retry), rules-version
// drift, policy fan-out and partially-covered orgs.
//
// F-H4: it no longer runs a blocking full sweep per org. It advances the RESUMABLE,
// cursor-based reconcile pipeline within a per-invocation budget — resuming incomplete
// runs first (recovering abandoned leases), then starting new "all" runs for active orgs
// without a recent run. That makes the daily reconcile safe for very large tenants and lets
// a serverless/cron invocation pause on a budget and resume next time. Coverage READY is
// still set ONLY by a completed FULL run whose verification confirms 100% (F-H1 preserved).
// =============================================================================

export interface ReconcileRiskProjectionsJobResult {
  status: "completed" | "paused" | "failed";
  runsStarted: number;
  runsResumed: number;
  organizationsCompleted: number;
  studentsProcessed: number;
  studentsFailed: number;
  remainingRuns: number;
}

export interface RunReconcileRiskProjectionsJobOptions {
  /** Restrict to a single organization (dev / targeted re-run). */
  organizationId?: string;
  /** Per-invocation batch budget (pause + resume next time when exhausted). */
  maxBatches?: number;
  /** Per-invocation wall-clock budget in ms (avoid serverless timeout). */
  maxDurationMs?: number;
}

export async function runReconcileRiskProjectionsJob(
  options?: RunReconcileRiskProjectionsJobOptions
): Promise<ReconcileRiskProjectionsJobResult> {
  return advanceReconcileRunsWithinBudget({
    organizationId: options?.organizationId,
    maxBatches: options?.maxBatches,
    maxDurationMs: options?.maxDurationMs,
  });
}
