import { describe, it, expect, vi, beforeEach } from "vitest";

// =============================================================================
// F-H3 — the periodic reconcile job: iterates orgs, isolates per-org failure,
// runs the FULL ("all") reconcile (the only mode that owns coverage), audits.
// =============================================================================

const { orgFindMany, auditCreate, reconcile } = vi.hoisted(() => ({
  orgFindMany: vi.fn(),
  auditCreate: vi.fn(),
  reconcile: vi.fn(),
}));

vi.mock("@/server/db", () => ({
  getDb: async () => ({
    organization: { findMany: orgFindMany },
    auditLog: { create: auditCreate },
  }),
}));
vi.mock("@/modules/students/services/student-risk-projection.service", () => ({
  reconcileStudentRiskProjectionsForOrg: reconcile,
}));

import { runReconcileRiskProjectionsJob } from "@/server/jobs/reconcile-risk-projections.job";

beforeEach(() => {
  orgFindMany.mockReset();
  auditCreate.mockReset();
  reconcile.mockReset();
  auditCreate.mockResolvedValue({});
});

describe("runReconcileRiskProjectionsJob", () => {
  it("runs a FULL reconcile per organization and aggregates the counts", async () => {
    orgFindMany.mockResolvedValue([{ id: "o1" }, { id: "o2" }]);
    reconcile
      .mockResolvedValueOnce({ processed: 10, changed: 3, failed: 0, failures: [] })
      .mockResolvedValueOnce({ processed: 5, changed: 1, failed: 0, failures: [] });

    const result = await runReconcileRiskProjectionsJob();

    // Only excludes CANCELLED/SUSPENDED + soft-deleted orgs.
    expect(orgFindMany.mock.calls[0][0].where).toMatchObject({
      status: { notIn: ["CANCELLED", "SUSPENDED"] },
      deletedAt: null,
    });
    // Full ("all") mode → the only mode that owns coverage.
    expect(reconcile).toHaveBeenCalledWith("o1", expect.objectContaining({ mode: "all" }));
    expect(reconcile).toHaveBeenCalledWith("o2", expect.objectContaining({ mode: "all" }));
    expect(result.organizationsProcessed).toBe(2);
    expect(result.studentsProcessed).toBe(15);
    expect(result.studentsChanged).toBe(4);
    expect(result.errors).toEqual([]);
    expect(auditCreate).toHaveBeenCalledTimes(1);
  });

  it("one organization failing never aborts the others", async () => {
    orgFindMany.mockResolvedValue([{ id: "o1" }, { id: "bad" }, { id: "o3" }]);
    reconcile.mockImplementation(async (orgId: string) => {
      if (orgId === "bad") throw new Error("boom");
      return { processed: 2, changed: 0, failed: 0, failures: [] };
    });

    const result = await runReconcileRiskProjectionsJob();

    expect(result.organizationsProcessed).toBe(2); // o1 + o3
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].organizationId).toBe("bad");
  });

  it("targets a single organization when organizationId is given", async () => {
    orgFindMany.mockResolvedValue([{ id: "o1" }]);
    reconcile.mockResolvedValue({ processed: 1, changed: 0, failed: 0, failures: [] });

    await runReconcileRiskProjectionsJob({ organizationId: "o1" });

    expect(orgFindMany.mock.calls[0][0].where).toMatchObject({ id: "o1" });
  });

  it("propagates studentsFailed from a partial per-org sweep (row-level failures)", async () => {
    orgFindMany.mockResolvedValue([{ id: "o1" }]);
    reconcile.mockResolvedValue({ processed: 4, changed: 1, failed: 1, failures: [{ studentId: "s", error: "x" }] });

    const result = await runReconcileRiskProjectionsJob();
    expect(result.studentsFailed).toBe(1);
    // Row-level failures are recorded via the coverage INCOMPLETE state, not the job errors[].
    expect(result.errors).toEqual([]);
  });
});
