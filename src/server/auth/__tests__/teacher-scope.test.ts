import { describe, it, expect, vi, beforeEach } from "vitest";
import { SYSTEM_ROLES, ROLE_PERMISSIONS } from "@/server/auth/permissions";
import { AuthorizationError } from "@/shared/lib/command";

const { mockGetTeacherByUserId, mockRedirect } = vi.hoisted(() => ({
  mockGetTeacherByUserId: vi.fn(),
  mockRedirect: vi.fn(() => {
    // next/navigation redirect throws to halt rendering — mimic that so callers
    // after it don't run.
    throw new Error("NEXT_REDIRECT");
  }),
}));

vi.mock("@/modules/teachers/services/teacher.service", () => ({
  getTeacherByUserId: mockGetTeacherByUserId,
}));
vi.mock("next/navigation", () => ({ redirect: mockRedirect }));

import {
  isTeacherScopedRoles,
  resolveTeacherScope,
  resolveDataAccessScope,
  redirectIfTeacherScoped,
} from "../teacher-scope";

const ORG = "org-1";
const USER = "user-1";

function ctx(roles: string[]) {
  // Only the fields teacher-scope reads — cast to satisfy AuthContext.
  return { userId: USER, organizationId: ORG, roles, ability: {} as never } as never;
}

beforeEach(() => vi.clearAllMocks());

describe("isTeacherScopedRoles", () => {
  it("is true for a plain TEACHER", () => {
    expect(isTeacherScopedRoles([SYSTEM_ROLES.TEACHER])).toBe(true);
  });

  it("is false for ORG_ADMIN even if they also hold TEACHER", () => {
    expect(isTeacherScopedRoles([SYSTEM_ROLES.ORG_ADMIN, SYSTEM_ROLES.TEACHER])).toBe(false);
  });

  it("is false for SUPER_ADMIN", () => {
    expect(isTeacherScopedRoles([SYSTEM_ROLES.SUPER_ADMIN])).toBe(false);
  });

  it("is false for SECRETARY and STUDENT", () => {
    expect(isTeacherScopedRoles([SYSTEM_ROLES.SECRETARY])).toBe(false);
    expect(isTeacherScopedRoles([SYSTEM_ROLES.STUDENT])).toBe(false);
  });

  it("scopes a TEACHER+SECRETARY hybrid (has TEACHER, not admin)", () => {
    expect(isTeacherScopedRoles([SYSTEM_ROLES.TEACHER, SYSTEM_ROLES.SECRETARY])).toBe(true);
  });
});

describe("resolveTeacherScope", () => {
  it("returns not-scoped for ORG_ADMIN without hitting the teacher lookup", async () => {
    const scope = await resolveTeacherScope(ctx([SYSTEM_ROLES.ORG_ADMIN]));
    expect(scope).toEqual({ isTeacherScoped: false, userId: USER, organizationId: ORG });
    expect(mockGetTeacherByUserId).not.toHaveBeenCalled();
  });

  it("resolves teacherId from Teacher.userId for a TEACHER", async () => {
    mockGetTeacherByUserId.mockResolvedValue({ id: "teacher-1" });
    const scope = await resolveTeacherScope(ctx([SYSTEM_ROLES.TEACHER]));
    expect(mockGetTeacherByUserId).toHaveBeenCalledWith(ORG, USER);
    expect(scope).toMatchObject({ isTeacherScoped: true, teacherId: "teacher-1" });
  });

  it("returns teacherId: undefined for a TEACHER with no linked profile", async () => {
    mockGetTeacherByUserId.mockResolvedValue(null);
    const scope = await resolveTeacherScope(ctx([SYSTEM_ROLES.TEACHER]));
    expect(scope).toMatchObject({ isTeacherScoped: true, teacherId: undefined });
  });
});

describe("resolveDataAccessScope", () => {
  it("returns an organization scope for a non-teacher (no teacherId)", async () => {
    const scope = await resolveDataAccessScope(ctx([SYSTEM_ROLES.SECRETARY]));
    expect(scope).toEqual({ type: "organization", organizationId: ORG });
  });

  it("returns a teacher scope carrying the resolved teacherId", async () => {
    mockGetTeacherByUserId.mockResolvedValue({ id: "teacher-1" });
    const scope = await resolveDataAccessScope(ctx([SYSTEM_ROLES.TEACHER]));
    expect(scope).toEqual({ type: "teacher", organizationId: ORG, teacherId: "teacher-1" });
  });

  it("throws AuthorizationError for a teacher with no linked profile (never falls back to org-wide)", async () => {
    mockGetTeacherByUserId.mockResolvedValue(null);
    await expect(resolveDataAccessScope(ctx([SYSTEM_ROLES.TEACHER]))).rejects.toBeInstanceOf(AuthorizationError);
  });
});

describe("redirectIfTeacherScoped", () => {
  it("redirects a teacher-scoped user to /teacher", async () => {
    mockGetTeacherByUserId.mockResolvedValue({ id: "teacher-1" });
    await expect(redirectIfTeacherScoped(ctx([SYSTEM_ROLES.TEACHER]))).rejects.toThrow("NEXT_REDIRECT");
    expect(mockRedirect).toHaveBeenCalledWith("/teacher");
  });

  it("redirects a teacher-scoped user with no linked profile too (still must not see org-wide pages)", async () => {
    mockGetTeacherByUserId.mockResolvedValue(null);
    await expect(redirectIfTeacherScoped(ctx([SYSTEM_ROLES.TEACHER]))).rejects.toThrow("NEXT_REDIRECT");
    expect(mockRedirect).toHaveBeenCalledWith("/teacher");
  });

  it("is a no-op for a non-teacher", async () => {
    await redirectIfTeacherScoped(ctx([SYSTEM_ROLES.ORG_ADMIN]));
    expect(mockRedirect).not.toHaveBeenCalled();
  });
});

describe("TEACHER access policy — no finance permissions (finance pages stay forbidden)", () => {
  it("grants TEACHER none of the finance permission codes", () => {
    const financePrefixes = [
      "invoices.",
      "payments.",
      "receipts.",
      "wallets.",
      "walletTransactions.",
      "paymentPlans.",
      "refunds.",
      "feeDefinitions.",
      "billingPolicies.",
      "discountRules.",
      "taxRules.",
      "financialReports.",
    ];
    const teacherPerms = ROLE_PERMISSIONS.TEACHER as string[];
    const leaked = teacherPerms.filter((p) => financePrefixes.some((prefix) => p.startsWith(prefix)));
    expect(leaked).toEqual([]);
  });
});
