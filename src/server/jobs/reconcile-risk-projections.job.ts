import { randomUUID } from "crypto";
import { getDb } from "@/server/db";
import { reconcileStudentRiskProjectionsForOrg } from "@/modules/students/services/student-risk-projection.service";

// =============================================================================
// RECONCILE STUDENT RISK PROJECTIONS — periodic job (F-H3)
//
// The safety net for everything the direct event handlers (F-H2) cannot guarantee:
// time-driven drift (e.g. an invoice going overdue), lost / FAILED events (the event
// bus has no outbox/retry), rules-version drift, policy fan-out, and orgs left
// partially covered. It runs a FULL ("all") reconcile per organization, which is the
// only mode that updates the coverage rollout state — so an org only becomes/returns
// to READY after a complete sweep verifies 100% coverage.
//
// Scope & safety:
//   - Iterates organizations SEQUENTIALLY (concurrency 1) to bound DB load; never loads
//     all orgs' students into memory (the per-org reconcile paginates internally).
//   - A failure in one organization is recorded and the sweep continues.
//   - Overlap: a process-local guard prevents a second run on the SAME instance; across
//     instances the whole pipeline is idempotent (recalc skips unchanged rows, coverage
//     upsert is keyed by org), so a rare concurrent run is wasteful but not incorrect.
//     Operators should still schedule a single, non-overlapping trigger.
//   - Frequency: daily is the intended cadence.
// =============================================================================

export interface ReconcileRiskProjectionsJobResult {
  jobRunId: string;
  startedAt: Date;
  completedAt: Date;
  skippedBecauseAlreadyRunning: boolean;
  organizationsProcessed: number;
  studentsProcessed: number;
  studentsChanged: number;
  studentsFailed: number;
  errors: Array<{ organizationId: string; error: string }>;
}

export interface RunReconcileRiskProjectionsJobOptions {
  /** Restrict to a single organization (dev / targeted re-run). */
  organizationId?: string;
  /** Per-org paging size threaded into the reconcile. */
  batchSize?: number;
}

// Process-local overlap guard (single-instance). Cross-instance safety is provided by
// idempotency, not this flag.
let isRunning = false;

function emptyResult(jobRunId: string, startedAt: Date, skipped: boolean): ReconcileRiskProjectionsJobResult {
  return {
    jobRunId,
    startedAt,
    completedAt: new Date(),
    skippedBecauseAlreadyRunning: skipped,
    organizationsProcessed: 0,
    studentsProcessed: 0,
    studentsChanged: 0,
    studentsFailed: 0,
    errors: [],
  };
}

export async function runReconcileRiskProjectionsJob(
  options?: RunReconcileRiskProjectionsJobOptions
): Promise<ReconcileRiskProjectionsJobResult> {
  const jobRunId = randomUUID();
  const startedAt = new Date();

  if (isRunning) {
    console.warn("[ReconcileRiskProjectionsJob] skipped — a run is already in progress on this instance.");
    return emptyResult(jobRunId, startedAt, true);
  }
  isRunning = true;

  const errors: Array<{ organizationId: string; error: string }> = [];
  let organizationsProcessed = 0;
  let studentsProcessed = 0;
  let studentsChanged = 0;
  let studentsFailed = 0;

  try {
    const db = await getDb();
    const orgs = await db.organization.findMany({
      where: {
        ...(options?.organizationId ? { id: options.organizationId } : {}),
        // Mirror the billing job: never reconcile CANCELLED/SUSPENDED tenants.
        status: { notIn: ["CANCELLED", "SUSPENDED"] },
        deletedAt: null,
      },
      select: { id: true },
    });

    for (const org of orgs) {
      try {
        const r = await reconcileStudentRiskProjectionsForOrg(org.id, {
          mode: "all",
          batchSize: options?.batchSize,
        });
        organizationsProcessed++;
        studentsProcessed += r.processed;
        studentsChanged += r.changed;
        studentsFailed += r.failed;
      } catch (err) {
        // One organization failing (e.g. its coverage-RUNNING mark threw) never aborts
        // the others.
        errors.push({ organizationId: org.id, error: (err as Error).message });
      }
    }

    const completedAt = new Date();

    // Queryable audit record of the run (no PII — counts + error count only).
    try {
      await db.auditLog.create({
        data: {
          organizationId: null,
          actorId: null,
          entity: "RiskProjectionReconcileJob",
          entityId: jobRunId,
          action: errors.length > 0 ? "risk_projection_reconcile.completed_with_errors" : "risk_projection_reconcile.completed",
          newValues: JSON.stringify({
            jobRunId,
            startedAt: startedAt.toISOString(),
            completedAt: completedAt.toISOString(),
            organizationsProcessed,
            studentsProcessed,
            studentsChanged,
            studentsFailed,
            errorCount: errors.length,
          }),
        },
      });
    } catch {
      // Audit failure must never alter the job result.
    }

    return {
      jobRunId,
      startedAt,
      completedAt,
      skippedBecauseAlreadyRunning: false,
      organizationsProcessed,
      studentsProcessed,
      studentsChanged,
      studentsFailed,
      errors,
    };
  } finally {
    isRunning = false;
  }
}
