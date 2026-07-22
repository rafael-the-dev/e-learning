import { describe, it, expect, vi, beforeEach } from "vitest";

// =============================================================================
// M12 — Consumer Contract tests (Story 8). Given the SAME canonical projection
// dataset, every migrated dashboard consumer must agree on the numbers (each
// dimension count is identical wherever it surfaces) — proof that none of them
// re-derives risk independently. And when the projection is not READY, they ALL
// return UNAVAILABLE together (never one dashboard showing a number while another
// shows "unavailable" for the same org).
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

import { getAcademicRiskCounts } from "@/modules/dashboard/repositories/dashboard-academic.repository";
import { getAcademicRiskStats } from "@/modules/grades/services/academic-risk.service";
import {
  countStudentsAtAcademicRisk,
  countStudentsWithLowAttendance,
} from "@/modules/students/repositories/student.repository";

const ORG = "org-1";

// A permissive fake db: every operational query used by the consumers returns empty/0.
function fakeDb() {
  const empty = vi.fn().mockResolvedValue([]);
  const zero = vi.fn().mockResolvedValue(0);
  return {
    studentLevelProgress: { findMany: empty, count: zero },
    studentCourseProgress: { findMany: empty },
    studentSubjectProgress: { findMany: empty, count: zero, groupBy: empty },
    assessment: { count: zero },
    studentAssessmentResult: { count: zero },
    $queryRaw: vi.fn().mockResolvedValue([]),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetDb.mockResolvedValue(fakeDb());
});

describe("M12 consumer contract — same READY projection ⇒ consistent numbers", () => {
  beforeEach(() => {
    mockResolveReadiness.mockResolvedValue({ ready: true, sourceVersion: "student-risk-v1", verifiedAt: new Date() });
    // One canonical dataset shared by all consumers.
    mockLevelCounts.mockResolvedValue({ atRisk: 8, noRisk: 20, insufficientData: 2, byLevel: {} });
    mockDimensionCounts.mockResolvedValue({ academic: 3, attendance: 5, financial: 1, progression: 2, documents: 4 });
  });

  it("the ACADEMIC dimension count is identical across grades and students dashboards", async () => {
    const grades = await getAcademicRiskStats(ORG);
    const students = await countStudentsAtAcademicRisk(ORG);
    expect(grades.atRiskStudentCount).toMatchObject({ status: "AVAILABLE", data: 3 });
    expect(students).toMatchObject({ status: "AVAILABLE", data: 3 });
  });

  it("the ATTENDANCE dimension count is identical across executive and students dashboards", async () => {
    const exec = await getAcademicRiskCounts(ORG);
    const students = await countStudentsWithLowAttendance(ORG);
    expect(exec.studentsLowAttendance).toMatchObject({ status: "AVAILABLE", data: 5 });
    expect(students).toMatchObject({ status: "AVAILABLE", data: 5 });
  });

  it("the executive overall at-risk KPI reads the canonical level counts", async () => {
    const exec = await getAcademicRiskCounts(ORG);
    expect(exec.studentsAtRisk).toMatchObject({ status: "AVAILABLE", data: 8 });
  });
});

describe("M12 consumer contract — not READY ⇒ every consumer UNAVAILABLE together", () => {
  beforeEach(() => {
    mockResolveReadiness.mockResolvedValue({ ready: false, status: "INCOMPLETE", reason: "x", missingCount: 3 });
  });

  it("no consumer returns a number when the projection is not ready", async () => {
    const [exec, grades, sAcademic, sAttendance] = await Promise.all([
      getAcademicRiskCounts(ORG),
      getAcademicRiskStats(ORG),
      countStudentsAtAcademicRisk(ORG),
      countStudentsWithLowAttendance(ORG),
    ]);

    expect(exec.studentsAtRisk.status).toBe("UNAVAILABLE");
    expect(exec.studentsLowAttendance.status).toBe("UNAVAILABLE");
    expect(grades.atRiskStudentCount.status).toBe("UNAVAILABLE");
    expect(sAcademic.status).toBe("UNAVAILABLE");
    expect(sAttendance.status).toBe("UNAVAILABLE");

    // And none of them read the projection aggregates (fail-closed, no partial data).
    expect(mockLevelCounts).not.toHaveBeenCalled();
    expect(mockDimensionCounts).not.toHaveBeenCalled();
  });
});
