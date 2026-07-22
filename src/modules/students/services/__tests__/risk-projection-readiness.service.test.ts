import { describe, it, expect, vi, beforeEach } from "vitest";

// =============================================================================
// F-M8 — the canonical readiness gate + RiskMetric envelope. These prove the
// mapping from coverage state to readiness/metric and that STALE (old rules
// version) collapses to INCOMPLETE (fail-closed), never to a ready state.
// =============================================================================

const { mockGetCoverage } = vi.hoisted(() => ({ mockGetCoverage: vi.fn() }));
vi.mock("@/modules/students/services/student-risk-projection-coverage.service", () => ({
  getStudentRiskProjectionCoverage: mockGetCoverage,
}));

import {
  resolveRiskProjectionReadiness,
  availableRiskMetric,
  unavailableRiskMetric,
} from "../risk-projection-readiness.service";

const ORG = "org-1";

function coverage(over: Record<string, unknown>) {
  return {
    ready: false,
    status: "NOT_STARTED",
    sourceVersion: "student-risk-v1",
    expectedStudentCount: 0,
    projectedStudentCount: 0,
    missingStudentCount: 0,
    staleStudentCount: 0,
    ...over,
  };
}

beforeEach(() => vi.clearAllMocks());

describe("resolveRiskProjectionReadiness", () => {
  it("READY → ready:true with the source version and a verifiedAt timestamp", async () => {
    mockGetCoverage.mockResolvedValue(coverage({ ready: true, status: "READY", sourceVersion: "student-risk-v1" }));
    const r = await resolveRiskProjectionReadiness({ organizationId: ORG });
    expect(r.ready).toBe(true);
    if (r.ready) {
      expect(r.sourceVersion).toBe("student-risk-v1");
      expect(r.verifiedAt).toBeInstanceOf(Date);
    }
  });

  it.each([
    ["NOT_STARTED", "NOT_STARTED"],
    ["RUNNING", "RUNNING"],
    ["INCOMPLETE", "INCOMPLETE"],
    ["FAILED", "FAILED"],
  ])("%s coverage → ready:false with status %s and a reason", async (status, expected) => {
    mockGetCoverage.mockResolvedValue(coverage({ ready: false, status, missingStudentCount: 4, projectedStudentCount: 6 }));
    const r = await resolveRiskProjectionReadiness({ organizationId: ORG });
    expect(r.ready).toBe(false);
    if (!r.ready) {
      expect(r.status).toBe(expected);
      expect(r.reason.length).toBeGreaterThan(0);
      expect(r.missingCount).toBe(4);
      expect(r.processedCount).toBe(6);
    }
  });

  it("STALE (old rules version) collapses to INCOMPLETE — never ready (fail-closed)", async () => {
    mockGetCoverage.mockResolvedValue(coverage({ ready: false, status: "STALE", sourceVersion: "student-risk-v0" }));
    const r = await resolveRiskProjectionReadiness({ organizationId: ORG });
    expect(r.ready).toBe(false);
    if (!r.ready) expect(r.status).toBe("INCOMPLETE");
  });
});

describe("RiskMetric constructors", () => {
  it("availableRiskMetric wraps the data + evaluatedAt", () => {
    const at = new Date("2026-07-22");
    expect(availableRiskMetric(7, at)).toEqual({ status: "AVAILABLE", data: 7, evaluatedAt: at });
  });

  it("unavailableRiskMetric maps each readiness status to its UI reason", () => {
    expect(unavailableRiskMetric({ ready: false, status: "NOT_STARTED", reason: "x" })).toEqual({
      status: "UNAVAILABLE",
      reason: "PROJECTION_NOT_STARTED",
    });
    expect(unavailableRiskMetric({ ready: false, status: "RUNNING", reason: "x" })).toEqual({
      status: "UNAVAILABLE",
      reason: "PROJECTION_RUNNING",
    });
    expect(unavailableRiskMetric({ ready: false, status: "INCOMPLETE", reason: "x" })).toEqual({
      status: "UNAVAILABLE",
      reason: "PROJECTION_INCOMPLETE",
    });
    expect(unavailableRiskMetric({ ready: false, status: "FAILED", reason: "x" })).toEqual({
      status: "UNAVAILABLE",
      reason: "PROJECTION_FAILED",
    });
  });
});
