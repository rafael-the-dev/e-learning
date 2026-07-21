import { describe, it, expect, vi, beforeEach } from "vitest";

// =============================================================================
// F-H4 — reconcile run repository: the atomic lease acquisition (multi-instance
// safety) and the resumable-runs query.
// =============================================================================

const { create, findUnique, updateMany, update, findMany } = vi.hoisted(() => ({
  create: vi.fn(),
  findUnique: vi.fn(),
  updateMany: vi.fn(),
  update: vi.fn(),
  findMany: vi.fn(),
}));

vi.mock("@/server/db", () => ({
  getDb: vi.fn(async () => ({
    studentRiskProjectionReconcileRun: { create, findUnique, updateMany, update, findMany },
  })),
}));

import {
  acquireReconcileRun,
  findResumableReconcileRuns,
} from "@/modules/students/repositories/student-risk-projection-reconcile.repository";

const NOW = new Date("2026-07-21T12:00:00Z");

function row(over: Record<string, unknown> = {}) {
  return {
    id: "run-1", organizationId: "org-1", mode: "all", sourceVersion: "student-risk-v1",
    status: "RUNNING", cursorStudentId: null, batchSize: 100,
    processedCount: 0, succeededCount: 0, skippedCount: 0, failedCount: 0,
    startedAt: NOW, lastCheckpointAt: null, completedAt: null, failedAt: null,
    errorCode: null, leaseOwner: "exec-1", leaseExpiresAt: new Date(NOW.getTime() + 600000),
    ...over,
  };
}

beforeEach(() => {
  create.mockReset(); findUnique.mockReset(); updateMany.mockReset(); update.mockReset(); findMany.mockReset();
});

describe("acquireReconcileRun", () => {
  it("acquires when the conditional update matches (count 1) — sets RUNNING + lease", async () => {
    updateMany.mockResolvedValue({ count: 1 });
    findUnique.mockResolvedValue(row());

    const acquired = await acquireReconcileRun({ runId: "run-1", executionId: "exec-9", now: NOW, leaseMs: 600000 });

    expect(acquired).not.toBeNull();
    const arg = updateMany.mock.calls[0][0];
    // Resumable statuses OR a RUNNING run with an expired lease.
    expect(arg.where.id).toBe("run-1");
    expect(arg.where.OR).toEqual([
      { status: { in: ["PENDING", "PAUSED", "FAILED"] } },
      { status: "RUNNING", leaseExpiresAt: { lt: NOW } },
    ]);
    expect(arg.data).toMatchObject({ status: "RUNNING", leaseOwner: "exec-9" });
    expect(arg.data.leaseExpiresAt).toEqual(new Date(NOW.getTime() + 600000));
  });

  it("returns null when the conditional update matches nothing (lease held / terminal)", async () => {
    updateMany.mockResolvedValue({ count: 0 });
    const acquired = await acquireReconcileRun({ runId: "run-1", executionId: "exec-9", now: NOW, leaseMs: 600000 });
    expect(acquired).toBeNull();
    expect(findUnique).not.toHaveBeenCalled();
  });
});

describe("findResumableReconcileRuns", () => {
  it("selects PENDING/PAUSED/FAILED and RUNNING-with-expired-lease, oldest first", async () => {
    findMany.mockResolvedValue([row({ status: "PAUSED" })]);
    await findResumableReconcileRuns({ now: NOW, limit: 25 });
    const arg = findMany.mock.calls[0][0];
    expect(arg.where.OR).toEqual([
      { status: { in: ["PENDING", "PAUSED", "FAILED"] } },
      { status: "RUNNING", leaseExpiresAt: { lt: NOW } },
    ]);
    expect(arg.orderBy).toEqual({ updatedAt: "asc" });
    expect(arg.take).toBe(25);
  });
});
