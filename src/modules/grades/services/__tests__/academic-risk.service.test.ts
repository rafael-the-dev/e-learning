import { describe, it, expect, vi, beforeEach } from "vitest";

// =============================================================================
// F-M8 — getAcademicRiskStats.atRiskStudentCount reads the canonical academic
// dimension ONLY. No legacy FAILED-subject fallback; UNAVAILABLE when not READY.
// =============================================================================

const { mockResolveReadiness, mockDimensionCounts, mockGetDb } = vi.hoisted(() => ({
  mockResolveReadiness: vi.fn(),
  mockDimensionCounts: vi.fn(),
  mockGetDb: vi.fn(),
}));

vi.mock("@/modules/students/services/risk-projection-readiness.service", async (orig) => {
  const actual = await orig<typeof import("@/modules/students/services/risk-projection-readiness.service")>();
  return { ...actual, resolveRiskProjectionReadiness: mockResolveReadiness };
});
vi.mock("@/modules/students/repositories/student-risk-projection.repository", () => ({
  getStudentRiskDimensionAtRiskCounts: mockDimensionCounts,
}));
vi.mock("@/server/db", () => ({ getDb: mockGetDb }));

import { getAcademicRiskStats } from "../academic-risk.service";

const ORG = "org-1";
// Legacy source: distinct FAILED-subject students. Must never be queried under F-M8.
const legacyGroupBy = vi.fn().mockResolvedValue([]);

beforeEach(() => {
  vi.clearAllMocks();
  mockGetDb.mockResolvedValue({
    studentAssessmentResult: { count: vi.fn().mockResolvedValue(0) },
    studentSubjectProgress: { count: vi.fn().mockResolvedValue(0), groupBy: legacyGroupBy },
  });
});

describe("getAcademicRiskStats — F-M8 projection-only", () => {
  it("READY → AVAILABLE from the projection academic dimension; no legacy groupBy", async () => {
    mockResolveReadiness.mockResolvedValue({ ready: true, sourceVersion: "student-risk-v1", verifiedAt: new Date() });
    mockDimensionCounts.mockResolvedValue({ academic: 5, attendance: 0, financial: 0, progression: 0, documents: 0 });

    const stats = await getAcademicRiskStats(ORG);
    expect(stats.atRiskStudentCount).toMatchObject({ status: "AVAILABLE", data: 5 });
    expect(legacyGroupBy).not.toHaveBeenCalled();
  });

  it("READY + 0 academic → AVAILABLE + 0 (real zero, not unavailable)", async () => {
    mockResolveReadiness.mockResolvedValue({ ready: true, sourceVersion: "student-risk-v1", verifiedAt: new Date() });
    mockDimensionCounts.mockResolvedValue({ academic: 0, attendance: 0, financial: 0, progression: 0, documents: 0 });
    const stats = await getAcademicRiskStats(ORG);
    expect(stats.atRiskStudentCount).toMatchObject({ status: "AVAILABLE", data: 0 });
  });

  it.each(["NOT_STARTED", "RUNNING", "INCOMPLETE", "FAILED"] as const)(
    "%s → UNAVAILABLE; no projection read and no legacy groupBy",
    async (status) => {
      mockResolveReadiness.mockResolvedValue({ ready: false, status, reason: "x" });
      const stats = await getAcademicRiskStats(ORG);
      expect(stats.atRiskStudentCount.status).toBe("UNAVAILABLE");
      expect(mockDimensionCounts).not.toHaveBeenCalled();
      expect(legacyGroupBy).not.toHaveBeenCalled();
    }
  );
});
