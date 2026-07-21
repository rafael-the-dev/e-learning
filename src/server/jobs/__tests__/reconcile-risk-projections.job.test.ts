import { describe, it, expect, vi, beforeEach } from "vitest";

// =============================================================================
// F-H4 — the periodic job is now a thin delegator to the budgeted, resumable
// reconcile pipeline (advanceReconcileRunsWithinBudget). It threads the budget
// through and returns the pipeline's summary.
// =============================================================================

const { advance } = vi.hoisted(() => ({ advance: vi.fn() }));
vi.mock("@/modules/students/services/student-risk-projection-reconcile.service", () => ({
  advanceReconcileRunsWithinBudget: advance,
}));

import { runReconcileRiskProjectionsJob } from "@/server/jobs/reconcile-risk-projections.job";

beforeEach(() => advance.mockReset());

describe("runReconcileRiskProjectionsJob", () => {
  it("delegates to the resumable pipeline, forwarding the per-invocation budget", async () => {
    advance.mockResolvedValue({
      status: "completed",
      runsStarted: 2,
      runsResumed: 1,
      organizationsCompleted: 3,
      studentsProcessed: 120,
      studentsFailed: 0,
      remainingRuns: 0,
    });

    const result = await runReconcileRiskProjectionsJob({ maxBatches: 10, maxDurationMs: 5000, organizationId: "o1" });

    expect(advance).toHaveBeenCalledWith({ organizationId: "o1", maxBatches: 10, maxDurationMs: 5000 });
    expect(result.status).toBe("completed");
    expect(result.organizationsCompleted).toBe(3);
    expect(result.studentsProcessed).toBe(120);
  });

  it("surfaces a PAUSED pipeline result (budget exhausted → resume next time)", async () => {
    advance.mockResolvedValue({
      status: "paused",
      runsStarted: 0,
      runsResumed: 1,
      organizationsCompleted: 0,
      studentsProcessed: 500,
      studentsFailed: 0,
      remainingRuns: 4,
    });

    const result = await runReconcileRiskProjectionsJob({ maxBatches: 5 });
    expect(result.status).toBe("paused");
    expect(result.remainingRuns).toBe(4);
  });
});
