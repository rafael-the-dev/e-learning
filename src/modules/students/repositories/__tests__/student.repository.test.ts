import { describe, it, expect, vi, beforeEach } from "vitest";

const { findMany } = vi.hoisted(() => ({ findMany: vi.fn() }));

vi.mock("@/server/db", () => ({
  getDb: vi.fn().mockResolvedValue({ student: { findMany } }),
}));

import { findExistingEmails, findExistingIdNumbers } from "../student.repository";

beforeEach(() => vi.clearAllMocks());

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
