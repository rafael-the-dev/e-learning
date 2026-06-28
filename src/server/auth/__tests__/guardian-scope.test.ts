import { describe, it, expect, vi, beforeEach } from "vitest";

const { findGuardianLinks, findGuardianLink } = vi.hoisted(() => ({
  findGuardianLinks: vi.fn(),
  findGuardianLink: vi.fn(),
}));

vi.mock("@/modules/guardian-portal/repositories/guardian-portal.repository", () => ({
  findGuardianLinks,
  findGuardianLink,
}));

import {
  isGuardianScopedRoles,
  resolveGuardianScope,
  validateGuardianStudentAccess,
} from "../guardian-scope";
import type { AuthContext } from "../context";

function ctx(roles: string[]): AuthContext {
  return {
    userId: "guardian-user",
    organizationId: "org-1",
    roles,
    ability: { can: () => true, canAll: () => true, canAny: () => true },
  } as unknown as AuthContext;
}

beforeEach(() => {
  vi.clearAllMocks();
  findGuardianLinks.mockResolvedValue([]);
  findGuardianLink.mockResolvedValue(null);
});

describe("isGuardianScopedRoles", () => {
  it("is true for a GUARDIAN", () => {
    expect(isGuardianScopedRoles(["GUARDIAN"])).toBe(true);
  });

  it("is false for ORG_ADMIN/SUPER_ADMIN even when they also hold GUARDIAN", () => {
    expect(isGuardianScopedRoles(["GUARDIAN", "ORG_ADMIN"])).toBe(false);
    expect(isGuardianScopedRoles(["SUPER_ADMIN", "GUARDIAN"])).toBe(false);
  });

  it("is false for non-guardian roles", () => {
    expect(isGuardianScopedRoles(["STUDENT"])).toBe(false);
    expect(isGuardianScopedRoles(["TEACHER"])).toBe(false);
    expect(isGuardianScopedRoles([])).toBe(false);
    expect(isGuardianScopedRoles(undefined)).toBe(false);
  });
});

describe("resolveGuardianScope", () => {
  it("returns not-scoped (and skips the DB) for a non-guardian", async () => {
    const scope = await resolveGuardianScope(ctx(["SECRETARY"]));
    expect(scope.isGuardianScoped).toBe(false);
    expect(scope.links).toEqual([]);
    expect(findGuardianLinks).not.toHaveBeenCalled();
  });

  it("loads links by (org, guardianUserId) for a guardian", async () => {
    findGuardianLinks.mockResolvedValue([{ studentId: "s1" }]);
    const scope = await resolveGuardianScope(ctx(["GUARDIAN"]));
    expect(scope.isGuardianScoped).toBe(true);
    expect(scope.links).toHaveLength(1);
    expect(findGuardianLinks).toHaveBeenCalledWith("org-1", "guardian-user");
  });

  it("is scoped but empty when a guardian has no linked students", async () => {
    findGuardianLinks.mockResolvedValue([]);
    const scope = await resolveGuardianScope(ctx(["GUARDIAN"]));
    expect(scope.isGuardianScoped).toBe(true);
    expect(scope.links).toEqual([]);
  });
});

describe("validateGuardianStudentAccess", () => {
  it("returns null for a forged/unlinked studentId (no access)", async () => {
    findGuardianLink.mockResolvedValue(null);
    const link = await validateGuardianStudentAccess(ctx(["GUARDIAN"]), "forged-student");
    expect(link).toBeNull();
    // Always validated against (org, guardianUserId, studentId) — never trusts the caller.
    expect(findGuardianLink).toHaveBeenCalledWith("org-1", "guardian-user", "forged-student");
  });

  it("returns the link for a genuinely linked student", async () => {
    findGuardianLink.mockResolvedValue({ studentId: "s1", linkId: "l1" });
    const link = await validateGuardianStudentAccess(ctx(["GUARDIAN"]), "s1");
    expect(link?.studentId).toBe("s1");
  });
});
