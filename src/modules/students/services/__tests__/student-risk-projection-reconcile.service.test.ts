import { describe, it, expect, vi, beforeEach } from "vitest";

// =============================================================================
// F-H4 — resumable, cursor-based reconcile pipeline. Cursor paging, resume-after-
// cursor, per-student failure isolation, coverage only on completed FULL run,
// partial modes never touch coverage, budget → PAUSED, lease/terminal idempotency.
// =============================================================================

const h = vi.hoisted(() => ({
  // reconcile repo
  createRun: vi.fn(),
  findRun: vi.fn(),
  acquireRun: vi.fn(),
  checkpoint: vi.fn(),
  pauseRun: vi.fn(),
  completeRun: vi.fn(),
  failRun: vi.fn(),
  findResumable: vi.fn(),
  findRecentOrgs: vi.fn(),
  // coverage repo + service
  page: vi.fn(),
  countEligible: vi.fn(),
  markRunning: vi.fn(),
  markReady: vi.fn(),
  markIncomplete: vi.fn(),
  verify: vi.fn(),
  // engine
  recalc: vi.fn(),
  // db (cron org query)
  orgFindMany: vi.fn(),
}));

vi.mock("@/modules/students/repositories/student-risk-projection-reconcile.repository", () => ({
  createReconcileRun: h.createRun,
  findReconcileRunById: h.findRun,
  acquireReconcileRun: h.acquireRun,
  checkpointReconcileRun: h.checkpoint,
  pauseReconcileRun: h.pauseRun,
  completeReconcileRun: h.completeRun,
  failReconcileRun: h.failRun,
  findResumableReconcileRuns: h.findResumable,
  findOrganizationIdsWithRecentReconcileRun: h.findRecentOrgs,
}));
vi.mock("@/modules/students/repositories/student-risk-projection-coverage.repository", () => ({
  findEligibleStudentIdsPageForMode: h.page,
  countEligibleStudentsForRiskProjection: h.countEligible,
}));
vi.mock("@/modules/students/services/student-risk-projection-coverage.service", () => ({
  markRiskProjectionCoverageRunning: h.markRunning,
  markRiskProjectionCoverageReady: h.markReady,
  markRiskProjectionCoverageIncomplete: h.markIncomplete,
  verifyStudentRiskProjectionCoverage: h.verify,
}));
vi.mock("@/modules/students/services/student-risk-projection.service", () => ({
  recalculateStudentRiskProjection: h.recalc,
}));
vi.mock("@/server/db", () => ({ getDb: async () => ({ organization: { findMany: h.orgFindMany } }) }));

import {
  resolveReconcileBatchSize,
  resumeReconcileRun,
  advanceReconcileRunsWithinBudget,
} from "@/modules/students/services/student-risk-projection-reconcile.service";
import type { StudentRiskProjectionReconcileRun } from "@/modules/students/services/student-risk-projection-reconcile.types";

const ORG = "org-1";

function run(over: Partial<StudentRiskProjectionReconcileRun> = {}): StudentRiskProjectionReconcileRun {
  return {
    id: "run-1",
    organizationId: ORG,
    mode: "all",
    sourceVersion: "student-risk-v1",
    status: "RUNNING",
    cursorStudentId: null,
    batchSize: 100,
    processedCount: 0,
    succeededCount: 0,
    skippedCount: 0,
    failedCount: 0,
    startedAt: new Date("2026-07-21T00:00:00Z"),
    lastCheckpointAt: null,
    completedAt: null,
    failedAt: null,
    errorCode: null,
    leaseOwner: "exec-1",
    leaseExpiresAt: new Date("2026-07-21T00:10:00Z"),
    ...over,
  };
}

// A page store that returns the ids ordered after the cursor (id ASC) — simulates the repo.
function pageStore(ids: string[]) {
  return async (p: { afterStudentId: string | null; take: number }) => {
    const start = p.afterStudentId ? ids.indexOf(p.afterStudentId) + 1 : 0;
    return ids.slice(start, start + p.take);
  };
}

beforeEach(() => {
  Object.values(h).forEach((m) => m.mockReset());
  h.recalc.mockResolvedValue({ changed: true });
  h.verify.mockResolvedValue({ expectedStudentCount: 0, projectedStudentCount: 0, missingStudentCount: 0, staleStudentCount: 0, withoutCurrentCount: 0 });
});

describe("resolveReconcileBatchSize", () => {
  it("clamps to [10, 500] and defaults to 100", () => {
    expect(resolveReconcileBatchSize(100)).toBe(100);
    expect(resolveReconcileBatchSize(5)).toBe(10);
    expect(resolveReconcileBatchSize(99999)).toBe(500);
    expect(resolveReconcileBatchSize(undefined)).toBe(100);
    expect(resolveReconcileBatchSize(0)).toBe(100);
  });
});

describe("resumeReconcileRun — cursor pagination", () => {
  it("pages 250 students in 100+100+50 with no duplicates or omissions, then completes", async () => {
    const ids = Array.from({ length: 250 }, (_, i) => `s${String(i).padStart(3, "0")}`);
    h.findRun.mockResolvedValue(run());
    h.acquireRun.mockResolvedValue(run());
    h.page.mockImplementation(pageStore(ids));

    const outcome = await resumeReconcileRun({ runId: "run-1" });

    expect(h.recalc).toHaveBeenCalledTimes(250);
    const recalculatedIds = h.recalc.mock.calls.map((c) => c[0].studentId);
    expect(new Set(recalculatedIds).size).toBe(250); // no duplicates
    expect(recalculatedIds).toEqual(ids); // in order, none omitted
    // 3 checkpoints (100, 100, 50), cursor advancing to the last id of each page.
    expect(h.checkpoint).toHaveBeenCalledTimes(3);
    expect(h.checkpoint.mock.calls[0][0].cursorStudentId).toBe("s099");
    expect(h.checkpoint.mock.calls[2][0].cursorStudentId).toBe("s249");
    expect(outcome?.status).toBe("COMPLETED");
    expect(h.completeRun).toHaveBeenCalledWith(expect.objectContaining({ status: "COMPLETED" }));
  });

  it("resume continues AFTER the persisted cursor (never reprocesses earlier students)", async () => {
    const ids = Array.from({ length: 250 }, (_, i) => `s${String(i).padStart(3, "0")}`);
    h.findRun.mockResolvedValue(run({ cursorStudentId: "s099" }));
    h.acquireRun.mockResolvedValue(run({ cursorStudentId: "s099" }));
    h.page.mockImplementation(pageStore(ids));

    await resumeReconcileRun({ runId: "run-1" });

    // First fetch after resume uses the persisted cursor.
    expect(h.page.mock.calls[0][0].afterStudentId).toBe("s099");
    const recalculatedIds = h.recalc.mock.calls.map((c) => c[0].studentId);
    expect(recalculatedIds[0]).toBe("s100"); // never re-touches s000..s099
    expect(recalculatedIds).toHaveLength(150);
  });
});

describe("resumeReconcileRun — budget / pause", () => {
  it("pauses after maxBatches and persists the checkpoint (resume next time)", async () => {
    const ids = Array.from({ length: 250 }, (_, i) => `s${String(i).padStart(3, "0")}`);
    h.findRun.mockResolvedValue(run());
    h.acquireRun.mockResolvedValue(run());
    h.page.mockImplementation(pageStore(ids));

    const outcome = await resumeReconcileRun({ runId: "run-1", maxBatches: 1 });

    expect(h.recalc).toHaveBeenCalledTimes(100); // one batch only
    expect(h.checkpoint).toHaveBeenCalledTimes(1);
    expect(h.pauseRun).toHaveBeenCalledWith("run-1");
    expect(h.completeRun).not.toHaveBeenCalled();
    expect(outcome?.status).toBe("PAUSED");
  });
});

describe("resumeReconcileRun — per-student failure isolation", () => {
  it("one failing student never aborts the batch; failedCount increments", async () => {
    h.findRun.mockResolvedValue(run());
    h.acquireRun.mockResolvedValue(run());
    h.page.mockImplementation(pageStore(["a", "bad", "c"]));
    h.recalc.mockImplementation(async ({ studentId }: { studentId: string }) => {
      if (studentId === "bad") throw new Error("boom");
      return { changed: true };
    });

    const outcome = await resumeReconcileRun({ runId: "run-1" });

    expect(h.recalc).toHaveBeenCalledTimes(3); // all attempted
    expect(h.checkpoint.mock.calls[0][0].failedInc).toBe(1);
    expect(h.checkpoint.mock.calls[0][0].succeededInc).toBe(2);
    expect(outcome?.failed).toBe(1);
  });
});

describe("resumeReconcileRun — coverage (FULL mode only)", () => {
  it("marks coverage READY when the completed sweep verifies zero uncovered + zero failures", async () => {
    h.findRun.mockResolvedValue(run({ mode: "all" }));
    h.acquireRun.mockResolvedValue(run({ mode: "all" }));
    h.page.mockImplementation(pageStore(["a"]));
    h.verify.mockResolvedValue({ expectedStudentCount: 1, projectedStudentCount: 1, missingStudentCount: 0, staleStudentCount: 0, withoutCurrentCount: 0 });

    const outcome = await resumeReconcileRun({ runId: "run-1" });

    expect(h.markReady).toHaveBeenCalledTimes(1);
    expect(h.markIncomplete).not.toHaveBeenCalled();
    expect(outcome?.status).toBe("COMPLETED");
  });

  it("marks coverage INCOMPLETE (and run COMPLETED_WITH_ERRORS) when a student failed", async () => {
    h.findRun.mockResolvedValue(run({ mode: "all" }));
    h.acquireRun.mockResolvedValue(run({ mode: "all" }));
    h.page.mockImplementation(pageStore(["a"]));
    h.recalc.mockRejectedValue(new Error("x"));
    h.verify.mockResolvedValue({ expectedStudentCount: 1, projectedStudentCount: 0, missingStudentCount: 1, staleStudentCount: 0, withoutCurrentCount: 1 });

    const outcome = await resumeReconcileRun({ runId: "run-1" });

    expect(h.markReady).not.toHaveBeenCalled();
    expect(h.markIncomplete).toHaveBeenCalledTimes(1);
    expect(outcome?.status).toBe("COMPLETED_WITH_ERRORS");
  });

  it("partial modes (missing / version-stale) NEVER touch coverage", async () => {
    for (const mode of ["missing", "version-stale"] as const) {
      h.markReady.mockClear(); h.markIncomplete.mockClear(); h.verify.mockClear();
      h.findRun.mockResolvedValue(run({ mode }));
      h.acquireRun.mockResolvedValue(run({ mode }));
      h.page.mockImplementation(pageStore(["a"]));

      const outcome = await resumeReconcileRun({ runId: "run-1" });

      expect(h.verify).not.toHaveBeenCalled();
      expect(h.markReady).not.toHaveBeenCalled();
      expect(h.markIncomplete).not.toHaveBeenCalled();
      expect(outcome?.status).toBe("COMPLETED");
    }
  });
});

describe("resumeReconcileRun — lease / terminal idempotency", () => {
  it("returns null when the lease cannot be acquired (another instance holds it)", async () => {
    h.findRun.mockResolvedValue(run({ status: "PAUSED" }));
    h.acquireRun.mockResolvedValue(null); // conditional update matched 0 rows

    const outcome = await resumeReconcileRun({ runId: "run-1" });

    expect(outcome).toBeNull();
    expect(h.recalc).not.toHaveBeenCalled();
  });

  it("is idempotent for a terminal run — returns its counters without reprocessing", async () => {
    h.findRun.mockResolvedValue(run({ status: "COMPLETED", processedCount: 250, succeededCount: 250 }));

    const outcome = await resumeReconcileRun({ runId: "run-1" });

    expect(outcome?.status).toBe("COMPLETED");
    expect(outcome?.processed).toBe(250);
    expect(h.acquireRun).not.toHaveBeenCalled();
    expect(h.recalc).not.toHaveBeenCalled();
  });
});

describe("advanceReconcileRunsWithinBudget — cron orchestration", () => {
  it("resumes existing runs FIRST, then starts new runs for orgs without a recent run", async () => {
    h.findResumable.mockResolvedValue([run({ id: "resume-me", status: "PAUSED" })]);
    // resume path
    h.findRun.mockImplementation(async (id: string) =>
      id === "resume-me" ? run({ id: "resume-me", status: "PAUSED", cursorStudentId: "s050" }) : run({ id })
    );
    h.acquireRun.mockImplementation(async ({ runId }: { runId: string }) => run({ id: runId, cursorStudentId: runId === "resume-me" ? "s050" : null }));
    h.page.mockResolvedValue([]); // both runs finish immediately (empty page)
    // start-new path
    h.orgFindMany.mockResolvedValue([{ id: "org-a" }, { id: "org-b" }]);
    h.findRecentOrgs.mockResolvedValue(new Set(["org-a"])); // org-a already covered recently
    h.createRun.mockImplementation(async ({ organizationId }: { organizationId: string }) => run({ id: `new-${organizationId}`, organizationId, cursorStudentId: null }));
    h.countEligible.mockResolvedValue(0);

    const result = await advanceReconcileRunsWithinBudget({ maxRuns: 10 });

    expect(result.runsResumed).toBe(1);
    // only org-b needs a new run (org-a is recent)
    expect(result.runsStarted).toBe(1);
    expect(h.createRun).toHaveBeenCalledWith(expect.objectContaining({ organizationId: "org-b", mode: "all" }));
    expect(result.status).toBe("completed");
  });
});
