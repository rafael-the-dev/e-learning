import { describe, it, expect, vi, beforeEach } from "vitest";

// =============================================================================
// F-M8 — getAcademicRiskCounts reads the canonical risk figures ONLY from the
// projection. No legacy re-derivation: when the org is not READY the risk fields
// are UNAVAILABLE, and neither the projection reads nor any legacy per-student
// query is issued. A real zero (READY + 0) stays AVAILABLE, distinct from unavailable.
// =============================================================================

const { mockResolveReadiness, mockLevelCounts, mockDimensionCounts, mockGetDb } = vi.hoisted(() => ({
  mockResolveReadiness: vi.fn(),
  mockLevelCounts: vi.fn(),
  mockDimensionCounts: vi.fn(),
  mockGetDb: vi.fn(),
}));

vi.mock("@/modules/students/services/risk-projection-readiness.service", async (orig) => {
  const actual = await orig<typeof import("@/modules/students/services/risk-projection-readiness.service")>();
  return { ...actual, resolveRiskProjectionReadiness: mockResolveReadiness };
});
vi.mock("@/modules/students/repositories/student-risk-projection.repository", () => ({
  getStudentRiskLevelCounts: mockLevelCounts,
  getStudentRiskDimensionAtRiskCounts: mockDimensionCounts,
}));
vi.mock("@/server/db", () => ({ getDb: mockGetDb }));

import { getAcademicRiskCounts } from "../dashboard-academic.repository";

const ORG = "org-1";

// A fake db whose operational queries return empty; studentSubjectProgress is included so we can
// assert it is NEVER queried (no legacy FAILED / low-attendance re-derivation).
const studentSubjectProgressFindMany = vi.fn().mockResolvedValue([]);

beforeEach(() => {
  vi.clearAllMocks();
  mockGetDb.mockResolvedValue({
    studentLevelProgress: { findMany: vi.fn().mockResolvedValue([]), count: vi.fn().mockResolvedValue(0) },
    studentCourseProgress: { findMany: vi.fn().mockResolvedValue([]) },
    studentSubjectProgress: { findMany: studentSubjectProgressFindMany },
    assessment: { count: vi.fn().mockResolvedValue(0) },
    $queryRaw: vi.fn().mockResolvedValue([]),
  });
});

describe("getAcademicRiskCounts — F-M8 projection-only", () => {
  it("READY → risk fields AVAILABLE from the projection; no legacy student query", async () => {
    mockResolveReadiness.mockResolvedValue({ ready: true, sourceVersion: "student-risk-v1", verifiedAt: new Date() });
    mockLevelCounts.mockResolvedValue({ atRisk: 7, noRisk: 0, insufficientData: 0, byLevel: {} });
    mockDimensionCounts.mockResolvedValue({ academic: 0, attendance: 4, financial: 0, progression: 0, documents: 0 });

    const counts = await getAcademicRiskCounts(ORG);

    expect(counts.studentsAtRisk).toMatchObject({ status: "AVAILABLE", data: 7 });
    expect(counts.studentsLowAttendance).toMatchObject({ status: "AVAILABLE", data: 4 });
    expect(mockLevelCounts).toHaveBeenCalledWith(ORG, { financeAuthorized: true });
    // No legacy per-student re-derivation.
    expect(studentSubjectProgressFindMany).not.toHaveBeenCalled();
  });

  it("READY with zero at risk → AVAILABLE + 0 (a real zero, NOT unavailable)", async () => {
    mockResolveReadiness.mockResolvedValue({ ready: true, sourceVersion: "student-risk-v1", verifiedAt: new Date() });
    mockLevelCounts.mockResolvedValue({ atRisk: 0, noRisk: 10, insufficientData: 0, byLevel: {} });
    mockDimensionCounts.mockResolvedValue({ academic: 0, attendance: 0, financial: 0, progression: 0, documents: 0 });

    const counts = await getAcademicRiskCounts(ORG);
    expect(counts.studentsAtRisk).toMatchObject({ status: "AVAILABLE", data: 0 });
    expect(counts.studentsLowAttendance).toMatchObject({ status: "AVAILABLE", data: 0 });
  });

  it.each(["NOT_STARTED", "RUNNING", "INCOMPLETE", "FAILED"] as const)(
    "%s → risk fields UNAVAILABLE; NO projection read and NO legacy query",
    async (status) => {
      mockResolveReadiness.mockResolvedValue({ ready: false, status, reason: "x", missingCount: 1 });

      const counts = await getAcademicRiskCounts(ORG);

      expect(counts.studentsAtRisk.status).toBe("UNAVAILABLE");
      expect(counts.studentsLowAttendance.status).toBe("UNAVAILABLE");
      // Fail-closed: the projection reads are not even attempted, and no legacy query runs.
      expect(mockLevelCounts).not.toHaveBeenCalled();
      expect(mockDimensionCounts).not.toHaveBeenCalled();
      expect(studentSubjectProgressFindMany).not.toHaveBeenCalled();
    }
  );

  it("operational counts (blocked / recovery / eligible / overdue) are returned regardless of readiness", async () => {
    mockResolveReadiness.mockResolvedValue({ ready: false, status: "NOT_STARTED", reason: "x" });
    const counts = await getAcademicRiskCounts(ORG);
    // Plain numbers, always present (status-based operational queries).
    expect(typeof counts.blockedStudents).toBe("number");
    expect(typeof counts.recoveryRequired).toBe("number");
    expect(typeof counts.eligibleNoAction).toBe("number");
  });
});
