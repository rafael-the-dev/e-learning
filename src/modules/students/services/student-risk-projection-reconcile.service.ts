// =============================================================================
// STUDENT RISK PROJECTION RECONCILE — resumable cursor pipeline (M11 / F-H4)
//
// Replaces the blocking "load every student → process → lose progress on interrupt"
// sweep with: cursor page → recompute batch → checkpoint → next page → final coverage
// verification. A run is leased so exactly one instance advances it; it can pause on a
// per-invocation budget and resume after `cursorStudentId`. Coverage READY is still set
// ONLY by a completed FULL ("all") run whose verification confirms 100% (F-H1 preserved).
//
// Pure operational infra: the risk engine, coverage semantics, event handler and dashboard
// consumers are untouched — this only orchestrates WHEN/HOW recalculateStudentRiskProjection
// is called across a large cohort.
// =============================================================================

import { randomUUID } from "crypto";
import { getDb } from "@/server/db";
import { STUDENT_RISK_SOURCE_VERSION } from "@/modules/students/services/student-risk.service";
import { recalculateStudentRiskProjection, type ReconcileMode } from "@/modules/students/services/student-risk-projection.service";
import {
  findEligibleStudentIdsPageForMode,
  countEligibleStudentsForRiskProjection,
} from "@/modules/students/repositories/student-risk-projection-coverage.repository";
import {
  markRiskProjectionCoverageRunning,
  markRiskProjectionCoverageReady,
  markRiskProjectionCoverageIncomplete,
  verifyStudentRiskProjectionCoverage,
} from "@/modules/students/services/student-risk-projection-coverage.service";
import {
  createReconcileRun,
  findReconcileRunById,
  acquireReconcileRun,
  checkpointReconcileRun,
  pauseReconcileRun,
  completeReconcileRun,
  failReconcileRun,
  findResumableReconcileRuns,
  findOrganizationIdsWithRecentReconcileRun,
} from "@/modules/students/repositories/student-risk-projection-reconcile.repository";
import {
  STUDENT_RISK_RECONCILE_RUN_STATUS as S,
  STUDENT_RISK_RECONCILE_BATCH_SIZE_MIN as B_MIN,
  STUDENT_RISK_RECONCILE_BATCH_SIZE_MAX as B_MAX,
  STUDENT_RISK_RECONCILE_BATCH_SIZE_DEFAULT as B_DEFAULT,
  type StudentRiskProjectionReconcileRun,
  type StudentRiskProjectionReconcileRunStatus,
} from "@/modules/students/services/student-risk-projection-reconcile.types";

const LEASE_MS = 10 * 60 * 1000; // 10 minutes

/** Clamp a requested batch size into [MIN, MAX]; env `STUDENT_RISK_RECONCILE_BATCH_SIZE` is the default. */
export function resolveReconcileBatchSize(requested?: number): number {
  const envDefault = Number(process.env.STUDENT_RISK_RECONCILE_BATCH_SIZE);
  const base = requested ?? (Number.isFinite(envDefault) && envDefault > 0 ? envDefault : B_DEFAULT);
  const floored = Math.floor(base);
  if (!Number.isFinite(floored) || floored <= 0) return B_DEFAULT;
  return Math.max(B_MIN, Math.min(B_MAX, floored));
}

/** A per-invocation budget shared across the runs a single cron/CLI call advances. */
interface AdvanceBudget {
  batchesLeft: number | null; // null = unlimited
  deadlineEpochMs: number | null; // null = no time limit
}

export interface AdvanceRunOutcome {
  runId: string;
  organizationId: string;
  status: StudentRiskProjectionReconcileRunStatus;
  processed: number;
  succeeded: number;
  skipped: number;
  failed: number;
  batchesRun: number;
}

function budgetExhausted(budget: AdvanceBudget, now: number): boolean {
  if (budget.batchesLeft !== null && budget.batchesLeft <= 0) return true;
  if (budget.deadlineEpochMs !== null && now >= budget.deadlineEpochMs) return true;
  return false;
}

// ─── Start / resume ───────────────────────────────────────────────────────────

/** Create a new run (PENDING). For mode "all" it marks coverage RUNNING (clears prior READY). */
export async function startReconcileRun(params: {
  organizationId: string;
  mode: ReconcileMode;
  batchSize?: number;
  now?: Date;
}): Promise<StudentRiskProjectionReconcileRun> {
  const now = params.now ?? new Date();
  const batchSize = resolveReconcileBatchSize(params.batchSize);
  const run = await createReconcileRun({
    organizationId: params.organizationId,
    mode: params.mode,
    sourceVersion: STUDENT_RISK_SOURCE_VERSION,
    batchSize,
    now,
  });
  if (params.mode === "all") {
    const expected = await countEligibleStudentsForRiskProjection(params.organizationId);
    await markRiskProjectionCoverageRunning({ organizationId: params.organizationId, expectedStudentCount: expected, now });
  }
  return run;
}

/**
 * Acquire and advance a run within a budget. Terminal runs return idempotently without
 * reprocessing. If the lease can't be acquired (another instance holds it, or the run isn't
 * resumable) it returns null.
 */
export async function resumeReconcileRun(params: {
  runId: string;
  executionId?: string;
  maxBatches?: number;
  maxDurationMs?: number;
  now?: Date;
}): Promise<AdvanceRunOutcome | null> {
  const now = params.now ?? new Date();
  const existing = await findReconcileRunById(params.runId);
  if (!existing) return null;

  // Idempotent for terminal runs — never reprocess.
  if (
    existing.status === S.COMPLETED ||
    existing.status === S.COMPLETED_WITH_ERRORS ||
    existing.status === S.CANCELLED
  ) {
    return {
      runId: existing.id,
      organizationId: existing.organizationId,
      status: existing.status,
      processed: existing.processedCount,
      succeeded: existing.succeededCount,
      skipped: existing.skippedCount,
      failed: existing.failedCount,
      batchesRun: 0,
    };
  }

  const executionId = params.executionId ?? randomUUID();
  const acquired = await acquireReconcileRun({ runId: params.runId, executionId, now, leaseMs: LEASE_MS });
  if (!acquired) return null; // lease held elsewhere / not resumable

  const budget: AdvanceBudget = {
    batchesLeft: params.maxBatches ?? null,
    deadlineEpochMs: params.maxDurationMs != null ? Date.now() + params.maxDurationMs : null,
  };
  return advanceAcquiredRun(acquired, budget);
}

// ─── The advance loop ───────────────────────────────────────────────────────────

async function advanceAcquiredRun(
  run: StudentRiskProjectionReconcileRun,
  budget: AdvanceBudget
): Promise<AdvanceRunOutcome> {
  let cursor = run.cursorStudentId;
  let batchesRun = 0;
  const tally = { processed: 0, succeeded: 0, skipped: 0, failed: 0 };

  try {
    for (;;) {
      if (budgetExhausted(budget, Date.now())) {
        await pauseReconcileRun(run.id);
        return outcome(run, S.PAUSED, tally, batchesRun);
      }

      const page = await findEligibleStudentIdsPageForMode({
        organizationId: run.organizationId,
        mode: run.mode,
        sourceVersion: run.sourceVersion,
        afterStudentId: cursor,
        take: run.batchSize,
      });

      if (page.length === 0) {
        // Nothing left after the cursor → the sweep reached the end. Finalize.
        return finalizeRun(run, tally);
      }

      const now = new Date();
      let succeeded = 0;
      let skipped = 0;
      let failed = 0;
      for (const studentId of page) {
        try {
          const r = await recalculateStudentRiskProjection({ organizationId: run.organizationId, studentId, now });
          if (r.changed) succeeded++;
          else skipped++;
        } catch {
          // A single student failing never aborts the sweep. Detail is not persisted on the
          // run (no PII / unbounded list) — only failedCount; the final verify decides coverage.
          failed++;
        }
      }

      // Checkpoint AFTER the whole batch: advance the cursor to the last id and renew the
      // lease. If the process died mid-batch (before this), the batch simply repeats on resume
      // (recalc is idempotent) and counters are not double-incremented (they move only here).
      cursor = page[page.length - 1];
      await checkpointReconcileRun({
        runId: run.id,
        cursorStudentId: cursor,
        processedInc: page.length,
        succeededInc: succeeded,
        skippedInc: skipped,
        failedInc: failed,
        now,
        leaseMs: LEASE_MS,
      });

      tally.processed += page.length;
      tally.succeeded += succeeded;
      tally.skipped += skipped;
      tally.failed += failed;
      run.failedCount += failed;
      batchesRun++;
      if (budget.batchesLeft !== null) budget.batchesLeft--;
    }
  } catch (e) {
    // A fatal, non-per-student error (e.g. the page query failed) stops the run. Coverage for
    // an "all" run stays RUNNING → the gate remains fail-closed (not ready) until a later run.
    await failReconcileRun({ runId: run.id, errorCode: reconcileErrorCode(e), now: new Date() });
    return outcome(run, S.FAILED, tally, batchesRun);
  }
}

/** Finalize a run that reached the end of its cursor: set coverage (all-mode) + run status. */
async function finalizeRun(
  run: StudentRiskProjectionReconcileRun,
  tally: { processed: number; succeeded: number; skipped: number; failed: number }
): Promise<AdvanceRunOutcome> {
  const now = new Date();
  const runStatus: "COMPLETED" | "COMPLETED_WITH_ERRORS" =
    run.failedCount > 0 ? S.COMPLETED_WITH_ERRORS : S.COMPLETED;

  if (run.mode === "all") {
    // The final decision comes from the REAL completeness verification, not just the counters.
    const v = await verifyStudentRiskProjectionCoverage({ organizationId: run.organizationId });
    if (v.withoutCurrentCount === 0 && run.failedCount === 0) {
      await markRiskProjectionCoverageReady({
        organizationId: run.organizationId,
        expectedStudentCount: v.expectedStudentCount,
        projectedStudentCount: v.projectedStudentCount,
        now,
      });
    } else {
      await markRiskProjectionCoverageIncomplete({
        organizationId: run.organizationId,
        expectedStudentCount: v.expectedStudentCount,
        projectedStudentCount: v.projectedStudentCount,
        missingStudentCount: v.missingStudentCount,
        staleStudentCount: v.staleStudentCount,
        now,
      });
    }
  }
  // Partial modes (missing / version-stale) never touch coverage.

  await completeReconcileRun({ runId: run.id, status: runStatus, now });
  return outcome(run, runStatus, tally, 0);
}

function outcome(
  run: StudentRiskProjectionReconcileRun,
  status: StudentRiskProjectionReconcileRunStatus,
  tally: { processed: number; succeeded: number; skipped: number; failed: number },
  batchesRun: number
): AdvanceRunOutcome {
  return {
    runId: run.id,
    organizationId: run.organizationId,
    status,
    processed: tally.processed,
    succeeded: tally.succeeded,
    skipped: tally.skipped,
    failed: tally.failed,
    batchesRun,
  };
}

function reconcileErrorCode(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  return msg.slice(0, 200);
}

// ─── Cron orchestration: budgeted, resume-first ─────────────────────────────────

export interface AdvanceReconcileRunsResult {
  status: "completed" | "paused" | "failed";
  runsStarted: number;
  runsResumed: number;
  organizationsCompleted: number;
  studentsProcessed: number;
  studentsFailed: number;
  remainingRuns: number;
}

/**
 * The cron entry point (F-H4). Within a per-invocation budget it RESUMES existing incomplete
 * runs first (recovering abandoned leases), then STARTS new "all" runs for active orgs without
 * a recent run at the current version — so the same pipeline serves the initial backfill, the
 * daily reconcile, interruption recovery and version upgrades. Never loads a whole org's
 * students; each run pages by cursor.
 */
export async function advanceReconcileRunsWithinBudget(params?: {
  maxBatches?: number;
  maxDurationMs?: number;
  maxRuns?: number;
  organizationId?: string;
  recentRunWindowMs?: number;
  now?: Date;
}): Promise<AdvanceReconcileRunsResult> {
  const now = params?.now ?? new Date();
  const budget: AdvanceBudget = {
    batchesLeft: params?.maxBatches ?? null,
    deadlineEpochMs: params?.maxDurationMs != null ? Date.now() + params.maxDurationMs : null,
  };
  const maxRuns = params?.maxRuns ?? 50;
  const executionId = randomUUID();

  const result: AdvanceReconcileRunsResult = {
    status: "completed",
    runsStarted: 0,
    runsResumed: 0,
    organizationsCompleted: 0,
    studentsProcessed: 0,
    studentsFailed: 0,
    remainingRuns: 0,
  };

  const applyOutcome = (o: AdvanceRunOutcome) => {
    result.studentsProcessed += o.processed;
    result.studentsFailed += o.failed;
    if (o.status === S.COMPLETED || o.status === S.COMPLETED_WITH_ERRORS) result.organizationsCompleted++;
    if (o.status === S.PAUSED) result.remainingRuns++;
  };

  // Step 1 — resume existing incomplete runs (oldest first), recovering expired leases.
  const resumable = await findResumableReconcileRuns({ now, limit: maxRuns, organizationId: params?.organizationId });
  for (const run of resumable) {
    if (budgetExhausted(budget, Date.now())) {
      result.status = "paused";
      result.remainingRuns += 1;
      continue; // count the rest as remaining without acquiring
    }
    const o = await resumeReconcileRun({ runId: run.id, executionId, maxBatches: budget.batchesLeft ?? undefined, maxDurationMs: undefined, now });
    if (o) {
      result.runsResumed++;
      applyOutcome(o);
      if (budget.batchesLeft !== null) budget.batchesLeft = Math.max(0, budget.batchesLeft - o.batchesRun);
    }
  }

  // Step 2 — start new "all" runs for active orgs without a recent run at the current version.
  if (!budgetExhausted(budget, Date.now())) {
    const windowMs = params?.recentRunWindowMs ?? 20 * 60 * 60 * 1000; // 20h
    const since = new Date(now.getTime() - windowMs);
    const db = await getDb();
    const activeOrgs = await db.organization.findMany({
      where: {
        ...(params?.organizationId ? { id: params.organizationId } : {}),
        status: { notIn: ["CANCELLED", "SUSPENDED"] },
        deletedAt: null,
      },
      select: { id: true },
    });
    const recentlyRun = await findOrganizationIdsWithRecentReconcileRun({
      sourceVersion: STUDENT_RISK_SOURCE_VERSION,
      since,
      organizationId: params?.organizationId,
    });

    for (const org of activeOrgs) {
      if (budgetExhausted(budget, Date.now())) {
        result.status = "paused";
        break;
      }
      if (recentlyRun.has(org.id)) continue;
      const run = await startReconcileRun({ organizationId: org.id, mode: "all", now });
      result.runsStarted++;
      const o = await resumeReconcileRun({ runId: run.id, executionId, maxBatches: budget.batchesLeft ?? undefined, now });
      if (o) {
        applyOutcome(o);
        if (budget.batchesLeft !== null) budget.batchesLeft = Math.max(0, budget.batchesLeft - o.batchesRun);
      }
    }
  }

  if (result.remainingRuns > 0 && result.status !== "paused") result.status = "paused";
  return result;
}
