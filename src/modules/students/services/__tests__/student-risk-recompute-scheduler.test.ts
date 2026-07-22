import { describe, it, expect, vi, beforeEach } from "vitest";

// =============================================================================
// F-M4 — the coalescing scheduler collapses same-(org,student) requests within a
// window and flushes unique students, grouped by org, through the batch API.
// =============================================================================

const { batch } = vi.hoisted(() => ({ batch: vi.fn() }));
vi.mock("@/modules/students/services/student-risk-projection.service", () => ({
  recalculateStudentRiskProjectionsBatch: batch,
}));

import {
  scheduleStudentRiskRecompute,
  flushStudentRiskRecomputeScheduler,
  __resetStudentRiskRecomputeSchedulerForTests,
} from "@/modules/students/services/student-risk-recompute-scheduler";

beforeEach(() => {
  __resetStudentRiskRecomputeSchedulerForTests();
  batch.mockReset();
  batch.mockResolvedValue({ requested: 0, unique: 0, succeeded: 0, failed: 0, skipped: 0 });
});

describe("scheduleStudentRiskRecompute + flush", () => {
  it("coalesces repeated (org, student) into ONE batch entry", async () => {
    scheduleStudentRiskRecompute({ organizationId: "o1", studentId: "A" });
    scheduleStudentRiskRecompute({ organizationId: "o1", studentId: "A" });
    scheduleStudentRiskRecompute({ organizationId: "o1", studentId: "B" });
    scheduleStudentRiskRecompute({ organizationId: "o1", studentId: "A" });

    await flushStudentRiskRecomputeScheduler();

    expect(batch).toHaveBeenCalledTimes(1);
    const { organizationId, studentIds } = batch.mock.calls[0][0];
    expect(organizationId).toBe("o1");
    expect([...studentIds].sort()).toEqual(["A", "B"]); // deduped
  });

  it("groups by organization — one batch call per org", async () => {
    scheduleStudentRiskRecompute({ organizationId: "o1", studentId: "A" });
    scheduleStudentRiskRecompute({ organizationId: "o2", studentId: "B" });

    await flushStudentRiskRecomputeScheduler();

    expect(batch).toHaveBeenCalledTimes(2);
    const orgs = batch.mock.calls.map((c) => c[0].organizationId).sort();
    expect(orgs).toEqual(["o1", "o2"]);
  });

  it("ignores empty identity and flushes nothing when the buffer is empty", async () => {
    scheduleStudentRiskRecompute({ organizationId: "", studentId: "A" });
    scheduleStudentRiskRecompute({ organizationId: "o1", studentId: "" });
    await flushStudentRiskRecomputeScheduler();
    expect(batch).not.toHaveBeenCalled();
  });

  it("drains the buffer on flush (a second flush does nothing)", async () => {
    scheduleStudentRiskRecompute({ organizationId: "o1", studentId: "A" });
    await flushStudentRiskRecomputeScheduler();
    expect(batch).toHaveBeenCalledTimes(1);
    await flushStudentRiskRecomputeScheduler();
    expect(batch).toHaveBeenCalledTimes(1); // buffer already drained
  });

  it("a batch failure never propagates out of the flush (best-effort)", async () => {
    batch.mockRejectedValue(new Error("db down"));
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    scheduleStudentRiskRecompute({ organizationId: "o1", studentId: "A" });
    await expect(flushStudentRiskRecomputeScheduler()).resolves.toBeUndefined();
    spy.mockRestore();
  });
});
