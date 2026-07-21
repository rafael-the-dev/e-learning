// =============================================================================
// STUDENT RISK PROJECTION RECONCILE RUN — repository (M11 / F-H4)
//
// Row CRUD + the atomic lease acquisition that makes advancing a run safe across
// instances. Every write is a conditional/scoped update; no run is ever loaded in
// bulk. Pure operational infra.
// =============================================================================

import { getDb } from "@/server/db";
import type { ReconcileMode } from "@/modules/students/services/student-risk-projection.service";
import {
  STUDENT_RISK_RECONCILE_RUN_STATUS as S,
  type StudentRiskProjectionReconcileRun,
  type StudentRiskProjectionReconcileRunStatus,
} from "@/modules/students/services/student-risk-projection-reconcile.types";

type RunRow = {
  id: string;
  organizationId: string;
  mode: string;
  sourceVersion: string;
  status: string;
  cursorStudentId: string | null;
  batchSize: number;
  processedCount: number;
  succeededCount: number;
  skippedCount: number;
  failedCount: number;
  startedAt: Date;
  lastCheckpointAt: Date | null;
  completedAt: Date | null;
  failedAt: Date | null;
  errorCode: string | null;
  leaseOwner: string | null;
  leaseExpiresAt: Date | null;
};

function toRun(row: RunRow): StudentRiskProjectionReconcileRun {
  return {
    ...row,
    mode: row.mode as ReconcileMode,
    status: row.status as StudentRiskProjectionReconcileRunStatus,
  };
}

export async function createReconcileRun(data: {
  organizationId: string;
  mode: ReconcileMode;
  sourceVersion: string;
  batchSize: number;
  now: Date;
}): Promise<StudentRiskProjectionReconcileRun> {
  const db = await getDb();
  const row = await db.studentRiskProjectionReconcileRun.create({
    data: {
      organizationId: data.organizationId,
      mode: data.mode,
      sourceVersion: data.sourceVersion,
      status: S.PENDING,
      batchSize: data.batchSize,
      startedAt: data.now,
    },
  });
  return toRun(row);
}

export async function findReconcileRunById(
  runId: string
): Promise<StudentRiskProjectionReconcileRun | null> {
  const db = await getDb();
  const row = await db.studentRiskProjectionReconcileRun.findUnique({ where: { id: runId } });
  return row ? toRun(row) : null;
}

/**
 * Atomically acquire the lease on a run. A conditional updateMany flips the run to RUNNING
 * with a fresh lease ONLY when it is resumable — PENDING/PAUSED/FAILED, or RUNNING whose lease
 * has expired. If `count === 0`, another instance holds a live lease (or the run is terminal):
 * the caller must not process it. Returns the acquired run, or null.
 */
export async function acquireReconcileRun(params: {
  runId: string;
  executionId: string;
  now: Date;
  leaseMs: number;
}): Promise<StudentRiskProjectionReconcileRun | null> {
  const db = await getDb();
  const leaseExpiresAt = new Date(params.now.getTime() + params.leaseMs);
  const res = await db.studentRiskProjectionReconcileRun.updateMany({
    where: {
      id: params.runId,
      OR: [
        { status: { in: [S.PENDING, S.PAUSED, S.FAILED] } },
        // A RUNNING run whose lease has expired is considered abandoned → recoverable.
        { status: S.RUNNING, leaseExpiresAt: { lt: params.now } },
      ],
    },
    data: { status: S.RUNNING, leaseOwner: params.executionId, leaseExpiresAt },
  });
  if (res.count === 0) return null; // someone else holds a live lease, or it is terminal
  return findReconcileRunById(params.runId);
}

/** Persist a batch checkpoint: advance the cursor, increment counters, renew the lease. */
export async function checkpointReconcileRun(params: {
  runId: string;
  cursorStudentId: string;
  processedInc: number;
  succeededInc: number;
  skippedInc: number;
  failedInc: number;
  now: Date;
  leaseMs: number;
}): Promise<void> {
  const db = await getDb();
  await db.studentRiskProjectionReconcileRun.update({
    where: { id: params.runId },
    data: {
      cursorStudentId: params.cursorStudentId,
      processedCount: { increment: params.processedInc },
      succeededCount: { increment: params.succeededInc },
      skippedCount: { increment: params.skippedInc },
      failedCount: { increment: params.failedInc },
      lastCheckpointAt: params.now,
      leaseExpiresAt: new Date(params.now.getTime() + params.leaseMs),
    },
  });
}

/** Pause a run (budget exhausted): keep progress, release the lease. */
export async function pauseReconcileRun(runId: string): Promise<void> {
  const db = await getDb();
  await db.studentRiskProjectionReconcileRun.update({
    where: { id: runId },
    data: { status: S.PAUSED, leaseOwner: null, leaseExpiresAt: null },
  });
}

/** Finalize a run (COMPLETED / COMPLETED_WITH_ERRORS): release the lease. */
export async function completeReconcileRun(params: {
  runId: string;
  status: Extract<StudentRiskProjectionReconcileRunStatus, "COMPLETED" | "COMPLETED_WITH_ERRORS">;
  now: Date;
}): Promise<void> {
  const db = await getDb();
  await db.studentRiskProjectionReconcileRun.update({
    where: { id: params.runId },
    data: { status: params.status, completedAt: params.now, leaseOwner: null, leaseExpiresAt: null },
  });
}

/** Mark a run FAILED (operational failure that stopped it advancing): release the lease. */
export async function failReconcileRun(params: {
  runId: string;
  errorCode: string;
  now: Date;
}): Promise<void> {
  const db = await getDb();
  await db.studentRiskProjectionReconcileRun.update({
    where: { id: params.runId },
    data: { status: S.FAILED, failedAt: params.now, errorCode: params.errorCode.slice(0, 200), leaseOwner: null, leaseExpiresAt: null },
  });
}

/**
 * Resumable runs, oldest-touched first (so long-abandoned runs are picked up first):
 * PENDING / PAUSED / FAILED, plus RUNNING whose lease has expired.
 */
export async function findResumableReconcileRuns(params: {
  now: Date;
  limit: number;
  organizationId?: string;
}): Promise<StudentRiskProjectionReconcileRun[]> {
  const db = await getDb();
  const rows = await db.studentRiskProjectionReconcileRun.findMany({
    where: {
      ...(params.organizationId ? { organizationId: params.organizationId } : {}),
      OR: [
        { status: { in: [S.PENDING, S.PAUSED, S.FAILED] } },
        { status: S.RUNNING, leaseExpiresAt: { lt: params.now } },
      ],
    },
    orderBy: { updatedAt: "asc" },
    take: params.limit,
  });
  return rows.map(toRun);
}

/** Distinct org ids that already have a reconcile run at `sourceVersion` touched since `since`. */
export async function findOrganizationIdsWithRecentReconcileRun(params: {
  sourceVersion: string;
  since: Date;
  organizationId?: string;
}): Promise<Set<string>> {
  const db = await getDb();
  const rows = await db.studentRiskProjectionReconcileRun.findMany({
    where: {
      sourceVersion: params.sourceVersion,
      updatedAt: { gte: params.since },
      ...(params.organizationId ? { organizationId: params.organizationId } : {}),
    },
    select: { organizationId: true },
    distinct: ["organizationId"],
  });
  return new Set(rows.map((r) => r.organizationId));
}
