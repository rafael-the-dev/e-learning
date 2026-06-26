import { describe, it, expect, vi, beforeEach } from "vitest";

const { findMany, count } = vi.hoisted(() => ({ findMany: vi.fn(), count: vi.fn() }));

vi.mock("@/server/db", () => ({
  getDb: vi.fn().mockResolvedValue({ attendanceSession: { findMany, count } }),
}));

import { findAttendanceSessionsByOrganization } from "../attendance-session.repository";

beforeEach(() => {
  vi.clearAllMocks();
  findMany.mockResolvedValue([]);
  count.mockResolvedValue(0);
});

describe("findAttendanceSessionsByOrganization — teacher scope (M1)", () => {
  it("adds no teacher filter for an org-scoped listing", async () => {
    await findAttendanceSessionsByOrganization("org-1", { page: 1, pageSize: 20 });
    const where = findMany.mock.calls[0][0].where;
    expect(where).toMatchObject({ organizationId: "org-1", deletedAt: null });
    expect(where.AND).toBeUndefined();
  });

  it("scopes to sessions assigned to me OR for a class group I teach", async () => {
    await findAttendanceSessionsByOrganization("org-1", {
      page: 1,
      pageSize: 20,
      teacherId: "teacher-A",
    });
    const where = findMany.mock.calls[0][0].where;
    expect(where.AND).toEqual([
      { OR: [{ teacherId: "teacher-A" }, { classGroup: { teacherId: "teacher-A" } }] },
    ]);
    // count is scoped identically so pagination totals match the visible rows
    expect(count.mock.calls[0][0].where.AND).toEqual(where.AND);
  });

  it("binds the scope to the given teacher (A), never another teacher (B)", async () => {
    await findAttendanceSessionsByOrganization("org-1", { page: 1, pageSize: 20, teacherId: "teacher-A" });
    const json = JSON.stringify(findMany.mock.calls[0][0].where.AND);
    expect(json).toContain("teacher-A");
    expect(json).not.toContain("teacher-B");
  });

  it("AND-combines the teacher scope with the search OR (no clobbering)", async () => {
    await findAttendanceSessionsByOrganization("org-1", {
      page: 1,
      pageSize: 20,
      teacherId: "teacher-A",
      search: "math",
    });
    const where = findMany.mock.calls[0][0].where;
    expect(where.AND).toHaveLength(2);
    expect(where.AND[0]).toEqual({
      OR: [{ teacherId: "teacher-A" }, { classGroup: { teacherId: "teacher-A" } }],
    });
    // second AND group is the search OR
    const searchGroup = where.AND[1].OR as Array<Record<string, unknown>>;
    expect(searchGroup.some((c) => "title" in c)).toBe(true);
  });
});
