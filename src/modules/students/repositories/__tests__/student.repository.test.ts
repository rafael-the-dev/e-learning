import { describe, it, expect, vi, beforeEach } from "vitest";

const { findMany, count } = vi.hoisted(() => ({ findMany: vi.fn(), count: vi.fn() }));

vi.mock("@/server/db", () => ({
  getDb: vi.fn().mockResolvedValue({ student: { findMany, count } }),
}));

import { findExistingEmails, findExistingIdNumbers, findManyByOrganization } from "../student.repository";

beforeEach(() => vi.clearAllMocks());

describe("findManyByOrganization — teacher scope", () => {
  it("adds no enrollment/teacher filter for an org-scoped (non-teacher) listing", async () => {
    findMany.mockResolvedValue([]);
    count.mockResolvedValue(0);

    await findManyByOrganization("org-1", { page: 1, pageSize: 20 });

    const where = findMany.mock.calls[0][0].where;
    expect(where).toMatchObject({ organizationId: "org-1", deletedAt: null });
    expect(where.enrollments).toBeUndefined();
  });

  it("restricts to students enrolled in a class group taught by teacherId when teacher-scoped", async () => {
    findMany.mockResolvedValue([]);
    count.mockResolvedValue(0);

    await findManyByOrganization("org-1", { page: 1, pageSize: 20, teacherId: "teacher-A" });

    const where = findMany.mock.calls[0][0].where;
    expect(where.enrollments).toEqual({
      some: { deletedAt: null, classGroup: { teacherId: "teacher-A" } },
    });
  });

  it("binds the scope to the given teacher (A), never another teacher (B)", async () => {
    findMany.mockResolvedValue([]);
    count.mockResolvedValue(0);

    await findManyByOrganization("org-1", { page: 1, pageSize: 20, teacherId: "teacher-A" });

    const where = findMany.mock.calls[0][0].where;
    expect(where.enrollments.some.classGroup.teacherId).toBe("teacher-A");
    expect(where.enrollments.some.classGroup.teacherId).not.toBe("teacher-B");
    // count is scoped identically so pagination totals match the visible rows
    expect(count.mock.calls[0][0].where.enrollments.some.classGroup.teacherId).toBe("teacher-A");
  });
});

describe("findExistingEmails", () => {
  it("returns an empty Set without querying when given no emails", async () => {
    const result = await findExistingEmails("org-1", []);
    expect(result.size).toBe(0);
    expect(findMany).not.toHaveBeenCalled();
  });

  it("normalizes a DB email of mixed case to lowercase in the returned Set", async () => {
    findMany.mockResolvedValue([{ email: "Carlos.Test@Example.com" }]);

    const result = await findExistingEmails("org-1", ["carlos.test@example.com"]);

    expect(result.has("carlos.test@example.com")).toBe(true);
    expect(result.has("Carlos.Test@Example.com")).toBe(false);
  });

  it("trims surrounding whitespace from DB emails before lowercasing", async () => {
    findMany.mockResolvedValue([{ email: "  Carlos@Test.com  " }]);

    const result = await findExistingEmails("org-1", ["carlos@test.com"]);

    expect(result.has("carlos@test.com")).toBe(true);
  });

  it("scopes the lookup to the organization and excludes soft-deleted students", async () => {
    findMany.mockResolvedValue([]);
    await findExistingEmails("org-1", ["carlos@test.com"]);

    expect(findMany).toHaveBeenCalledWith({
      where: { organizationId: "org-1", deletedAt: null, email: { in: ["carlos@test.com"] } },
      select: { email: true },
    });
  });
});

describe("findExistingIdNumbers", () => {
  it("returns an empty Set without querying when given no idNumbers", async () => {
    const result = await findExistingIdNumbers("org-1", []);
    expect(result.size).toBe(0);
    expect(findMany).not.toHaveBeenCalled();
  });
});
