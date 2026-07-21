import { describe, it, expect, vi, beforeEach } from "vitest";

// =============================================================================
// F-H1 — coverage gate measures COMPLETENESS, not existence, and is fail-closed.
// The scenarios below are exactly the finding's reproduction cases.
// =============================================================================

const h = vi.hoisted(() => ({
  countEligible: vi.fn(),
  countWithoutCurrent: vi.fn(),
  countWithoutAny: vi.fn(),
  findCoverage: vi.fn(),
  upsertCoverage: vi.fn(),
}));

vi.mock("@/modules/students/repositories/student-risk-projection-coverage.repository", () => ({
  countEligibleStudentsForRiskProjection: h.countEligible,
  countEligibleStudentsWithoutCurrentRiskProjection: h.countWithoutCurrent,
  countEligibleStudentsWithoutAnyRiskProjection: h.countWithoutAny,
  findStudentRiskProjectionCoverage: h.findCoverage,
  upsertStudentRiskProjectionCoverage: h.upsertCoverage,
}));

import {
  getStudentRiskProjectionCoverage,
  verifyStudentRiskProjectionCoverage,
  markRiskProjectionCoverageReady,
} from "@/modules/students/services/student-risk-projection-coverage.service";
import { STUDENT_RISK_SOURCE_VERSION } from "@/modules/students/services/student-risk.service";

const ORG = "org-A";
const V = STUDENT_RISK_SOURCE_VERSION;

function coverageRow(over: Record<string, unknown> = {}) {
  return {
    organizationId: ORG,
    sourceVersion: V,
    status: "READY",
    expectedStudentCount: 500,
    projectedStudentCount: 500,
    missingStudentCount: 0,
    staleStudentCount: 0,
    errorSummary: null,
    backfillStartedAt: new Date("2026-07-21T00:00:00Z"),
    backfilledAt: new Date("2026-07-21T01:00:00Z"),
    verifiedAt: new Date("2026-07-21T01:00:00Z"),
    ...over,
  };
}

beforeEach(() => Object.values(h).forEach((m) => m.mockReset()));

describe("getStudentRiskProjectionCoverage — fail-closed gate", () => {
  it("no rollout row → NOT ready, NOT_STARTED, and no live completeness query", async () => {
    h.findCoverage.mockResolvedValue(null);
    const c = await getStudentRiskProjectionCoverage({ organizationId: ORG });
    expect(c.ready).toBe(false);
    expect(c.status).toBe("NOT_STARTED");
    expect(h.countWithoutCurrent).not.toHaveBeenCalled();
  });

  it("FINDING: 500 eligible, 1 projection created by an event → gate NOT ready (row still NOT_STARTED)", async () => {
    // The event handler upserts a projection but never marks coverage, so the row is absent
    // or NOT_STARTED. A single write must not activate canonical mode.
    h.findCoverage.mockResolvedValue(coverageRow({ status: "NOT_STARTED", backfilledAt: null, verifiedAt: null }));
    const c = await getStudentRiskProjectionCoverage({ organizationId: ORG });
    expect(c.ready).toBe(false);
    expect(h.countWithoutCurrent).not.toHaveBeenCalled();
  });

  it("full backfill complete (READY + live 0 uncovered) → ready", async () => {
    h.findCoverage.mockResolvedValue(coverageRow());
    h.countWithoutCurrent.mockResolvedValue(0);
    const c = await getStudentRiskProjectionCoverage({ organizationId: ORG });
    expect(c.ready).toBe(true);
    expect(c.status).toBe("READY");
    expect(h.countWithoutCurrent).toHaveBeenCalledWith(ORG, V);
  });

  it("FINDING: new student after backfill (READY but live finds 1 uncovered) → NOT ready, fallback", async () => {
    h.findCoverage.mockResolvedValue(coverageRow());
    h.countWithoutCurrent.mockResolvedValue(1);
    const c = await getStudentRiskProjectionCoverage({ organizationId: ORG });
    expect(c.ready).toBe(false);
    expect(c.status).toBe("INCOMPLETE");
    expect(c.missingStudentCount).toBe(1);
  });

  it("recovers to ready once the new student is recomputed (live back to 0)", async () => {
    h.findCoverage.mockResolvedValue(coverageRow());
    h.countWithoutCurrent.mockResolvedValue(0);
    expect((await getStudentRiskProjectionCoverage({ organizationId: ORG })).ready).toBe(true);
  });

  it("FINDING: old rules version → NOT ready, STALE, and no live query needed", async () => {
    h.findCoverage.mockResolvedValue(coverageRow({ sourceVersion: "student-risk-v0" }));
    const c = await getStudentRiskProjectionCoverage({ organizationId: ORG });
    expect(c.ready).toBe(false);
    expect(c.status).toBe("STALE");
    expect(h.countWithoutCurrent).not.toHaveBeenCalled();
  });

  it("stored INCOMPLETE/RUNNING → NOT ready without a live query", async () => {
    for (const status of ["RUNNING", "INCOMPLETE", "FAILED"]) {
      h.findCoverage.mockResolvedValue(coverageRow({ status, backfilledAt: null, verifiedAt: null }));
      const c = await getStudentRiskProjectionCoverage({ organizationId: ORG });
      expect(c.ready).toBe(false);
    }
    expect(h.countWithoutCurrent).not.toHaveBeenCalled();
  });

  it("ARCHITECTURE: a projection in an org with many students never activates canonical mode on its own", async () => {
    // Even if projections exist, without a READY coverage row the gate stays closed.
    h.findCoverage.mockResolvedValue(null);
    const c = await getStudentRiskProjectionCoverage({ organizationId: ORG });
    expect(c.ready).toBe(false);
  });
});

describe("verifyStudentRiskProjectionCoverage — completeness measurement", () => {
  it("complete: 500/500 → missing 0, stale 0, projected 500", async () => {
    h.countEligible.mockResolvedValue(500);
    h.countWithoutCurrent.mockResolvedValue(0);
    h.countWithoutAny.mockResolvedValue(0);
    const v = await verifyStudentRiskProjectionCoverage({ organizationId: ORG });
    expect(v).toMatchObject({ expectedStudentCount: 500, projectedStudentCount: 500, missingStudentCount: 0, staleStudentCount: 0, withoutCurrentCount: 0 });
  });

  it("FINDING: partial 499/500 → missing 1, projected 499", async () => {
    h.countEligible.mockResolvedValue(500);
    h.countWithoutCurrent.mockResolvedValue(1);
    h.countWithoutAny.mockResolvedValue(1);
    const v = await verifyStudentRiskProjectionCoverage({ organizationId: ORG });
    expect(v.missingStudentCount).toBe(1);
    expect(v.staleStudentCount).toBe(0);
    expect(v.projectedStudentCount).toBe(499);
  });

  it("FINDING: all on an old version → stale 500, missing 0, projected 0", async () => {
    h.countEligible.mockResolvedValue(500);
    h.countWithoutCurrent.mockResolvedValue(500); // none on current version
    h.countWithoutAny.mockResolvedValue(0); // but every student HAS some (old) row
    const v = await verifyStudentRiskProjectionCoverage({ organizationId: ORG });
    expect(v.missingStudentCount).toBe(0);
    expect(v.staleStudentCount).toBe(500);
    expect(v.projectedStudentCount).toBe(0);
  });

  it("FINDING: an orphan projection never compensates a missing eligible student", async () => {
    // 499 eligible (a soft-deleted student is excluded from `expected` and its orphan row
    // is not counted), one eligible student still missing → withoutCurrent 1.
    h.countEligible.mockResolvedValue(499);
    h.countWithoutCurrent.mockResolvedValue(1);
    h.countWithoutAny.mockResolvedValue(1);
    const v = await verifyStudentRiskProjectionCoverage({ organizationId: ORG });
    expect(v.projectedStudentCount).toBe(498);
    expect(v.missingStudentCount).toBe(1);
  });
});

describe("markRiskProjectionCoverageReady", () => {
  it("writes a READY row at the current version with backfilledAt + verifiedAt set", async () => {
    h.upsertCoverage.mockResolvedValue(coverageRow());
    await markRiskProjectionCoverageReady({ organizationId: ORG, expectedStudentCount: 500, projectedStudentCount: 500, now: new Date("2026-07-21T02:00:00Z") });
    const arg = h.upsertCoverage.mock.calls[0][0];
    expect(arg).toMatchObject({ organizationId: ORG, sourceVersion: V, status: "READY", missingStudentCount: 0, staleStudentCount: 0 });
    expect(arg.backfilledAt).toBeInstanceOf(Date);
    expect(arg.verifiedAt).toBeInstanceOf(Date);
  });
});
