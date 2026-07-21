import { describe, it, expect, vi, beforeEach } from "vitest";

// =============================================================================
// F-H1 — coverage repository: the completeness counts are measured over STUDENTS
// (org-scoped, via a relation `none` filter), so orphan projection rows can never
// compensate and one org's rows never count for another.
// =============================================================================

const { studentCount, coverageUpsert, coverageFindUnique } = vi.hoisted(() => ({
  studentCount: vi.fn(),
  coverageUpsert: vi.fn(),
  coverageFindUnique: vi.fn(),
}));

vi.mock("@/server/db", () => ({
  getDb: vi.fn(async () => ({
    student: { count: studentCount },
    studentRiskProjectionCoverage: { upsert: coverageUpsert, findUnique: coverageFindUnique },
  })),
}));

import {
  buildRiskProjectionEligibleStudentWhere,
  countEligibleStudentsForRiskProjection,
  countEligibleStudentsWithoutCurrentRiskProjection,
  countEligibleStudentsWithoutAnyRiskProjection,
} from "@/modules/students/repositories/student-risk-projection-coverage.repository";

const ORG = "org-A";

beforeEach(() => {
  studentCount.mockReset();
  coverageUpsert.mockReset();
  coverageFindUnique.mockReset();
});

describe("buildRiskProjectionEligibleStudentWhere", () => {
  it("is org-scoped and excludes soft-deleted students (single source of 'eligible')", () => {
    expect(buildRiskProjectionEligibleStudentWhere(ORG)).toEqual({ organizationId: ORG, deletedAt: null });
  });
});

describe("completeness counts", () => {
  it("expected: counts eligible students of THIS org only", async () => {
    studentCount.mockResolvedValue(500);
    const n = await countEligibleStudentsForRiskProjection(ORG);
    expect(n).toBe(500);
    expect(studentCount.mock.calls[0][0].where).toEqual({ organizationId: ORG, deletedAt: null });
  });

  it("withoutCurrent: eligible students with NO current-version projection (relation none), org-scoped", async () => {
    studentCount.mockResolvedValue(3);
    await countEligibleStudentsWithoutCurrentRiskProjection(ORG, "student-risk-v1");
    expect(studentCount.mock.calls[0][0].where).toEqual({
      organizationId: ORG,
      deletedAt: null,
      studentRiskProjections: { none: { sourceVersion: "student-risk-v1" } },
    });
  });

  it("withoutAny: eligible students with NO projection row at all", async () => {
    studentCount.mockResolvedValue(1);
    await countEligibleStudentsWithoutAnyRiskProjection(ORG);
    expect(studentCount.mock.calls[0][0].where).toEqual({
      organizationId: ORG,
      deletedAt: null,
      studentRiskProjections: { none: {} },
    });
  });

  it("multi-tenant: a different org's id is what scopes the count (org B never counts for org A)", async () => {
    studentCount.mockResolvedValue(0);
    await countEligibleStudentsWithoutCurrentRiskProjection("org-B", "student-risk-v1");
    expect(studentCount.mock.calls[0][0].where.organizationId).toBe("org-B");
  });
});
