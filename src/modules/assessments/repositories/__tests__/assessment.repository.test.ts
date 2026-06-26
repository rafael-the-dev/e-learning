import { describe, it, expect, vi, beforeEach } from "vitest";

const { findMany, count } = vi.hoisted(() => ({ findMany: vi.fn(), count: vi.fn() }));

vi.mock("@/server/db", () => ({
  getDb: vi.fn().mockResolvedValue({ assessment: { findMany, count } }),
}));

import { findAssessmentsByOrganization } from "../assessment.repository";

beforeEach(() => {
  vi.clearAllMocks();
  findMany.mockResolvedValue([]);
  count.mockResolvedValue(0);
});

describe("findAssessmentsByOrganization — teacher scope (M1)", () => {
  it("adds no teacher filter for an org-scoped listing", async () => {
    await findAssessmentsByOrganization("org-1", { page: 1, pageSize: 20 });
    const where = findMany.mock.calls[0][0].where;
    expect(where).toMatchObject({ organizationId: "org-1", deletedAt: null });
    expect(where.OR).toBeUndefined();
  });

  it("scopes to assessments assigned to me OR for a class group I teach", async () => {
    await findAssessmentsByOrganization("org-1", { page: 1, pageSize: 20, teacherId: "teacher-A" });
    const where = findMany.mock.calls[0][0].where;
    expect(where.OR).toEqual([
      { teacherId: "teacher-A" },
      { classGroup: { teacherId: "teacher-A" } },
    ]);
    expect(count.mock.calls[0][0].where.OR).toEqual(where.OR);
  });

  it("binds the scope to the given teacher (A), never another teacher (B)", async () => {
    await findAssessmentsByOrganization("org-1", { page: 1, pageSize: 20, teacherId: "teacher-A" });
    const json = JSON.stringify(findMany.mock.calls[0][0].where.OR);
    expect(json).toContain("teacher-A");
    expect(json).not.toContain("teacher-B");
  });

  it("AND-combines a classGroupId filter with the teacher OR (query param cannot widen scope)", async () => {
    await findAssessmentsByOrganization("org-1", {
      page: 1,
      pageSize: 20,
      teacherId: "teacher-A",
      classGroupId: "cg-other",
    });
    const where = findMany.mock.calls[0][0].where;
    // classGroupId is a top-level field AND-ed with the teacher OR by Prisma
    expect(where.classGroupId).toBe("cg-other");
    expect(where.OR).toEqual([
      { teacherId: "teacher-A" },
      { classGroup: { teacherId: "teacher-A" } },
    ]);
  });
});
