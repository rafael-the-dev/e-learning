import { describe, it, expect, vi, beforeEach } from "vitest";
import { SYSTEM_ROLES, ROLE_PERMISSIONS } from "@/server/auth/permissions";
import { AuthorizationError } from "@/shared/lib/command";

const { mockGetStudentByUserId, mockRedirect } = vi.hoisted(() => ({
  mockGetStudentByUserId: vi.fn(),
  mockRedirect: vi.fn(() => {
    // next/navigation redirect throws to halt rendering — mimic that so callers
    // after it don't run.
    throw new Error("NEXT_REDIRECT");
  }),
}));

vi.mock("@/modules/students/services/student.service", () => ({
  getStudentByUserId: mockGetStudentByUserId,
}));
vi.mock("next/navigation", () => ({ redirect: mockRedirect }));

import {
  isStudentScopedRoles,
  resolveStudentScope,
  resolveStudentDataAccessScope,
  redirectIfStudentScoped,
} from "../student-scope";

const ORG = "org-1";
const USER = "user-1";

function ctx(roles: string[]) {
  return { userId: USER, organizationId: ORG, roles, ability: {} as never } as never;
}

beforeEach(() => vi.clearAllMocks());

describe("isStudentScopedRoles", () => {
  it("is true for a plain STUDENT", () => {
    expect(isStudentScopedRoles([SYSTEM_ROLES.STUDENT])).toBe(true);
  });

  it("is false for ORG_ADMIN even if they also hold STUDENT (admins may preview, never scoped)", () => {
    expect(isStudentScopedRoles([SYSTEM_ROLES.ORG_ADMIN, SYSTEM_ROLES.STUDENT])).toBe(false);
  });

  it("is false for SUPER_ADMIN", () => {
    expect(isStudentScopedRoles([SYSTEM_ROLES.SUPER_ADMIN])).toBe(false);
  });

  it("is false for SECRETARY and TEACHER", () => {
    expect(isStudentScopedRoles([SYSTEM_ROLES.SECRETARY])).toBe(false);
    expect(isStudentScopedRoles([SYSTEM_ROLES.TEACHER])).toBe(false);
  });

  it("is defensive: undefined/null/empty roles return false instead of throwing", () => {
    expect(isStudentScopedRoles(undefined)).toBe(false);
    expect(isStudentScopedRoles(null)).toBe(false);
    expect(isStudentScopedRoles([])).toBe(false);
  });
});

describe("resolveStudentScope", () => {
  it("returns not-scoped for ORG_ADMIN without hitting the student lookup", async () => {
    const scope = await resolveStudentScope(ctx([SYSTEM_ROLES.ORG_ADMIN]));
    expect(scope).toEqual({ isStudentScoped: false, userId: USER, organizationId: ORG });
    expect(mockGetStudentByUserId).not.toHaveBeenCalled();
  });

  it("resolves studentId from Student.userId for a STUDENT (org-scoped lookup)", async () => {
    mockGetStudentByUserId.mockResolvedValue({ id: "student-1" });
    const scope = await resolveStudentScope(ctx([SYSTEM_ROLES.STUDENT]));
    expect(mockGetStudentByUserId).toHaveBeenCalledWith(ORG, USER);
    expect(scope).toMatchObject({ isStudentScoped: true, studentId: "student-1" });
  });

  it("returns studentId: undefined for a STUDENT with no linked profile", async () => {
    mockGetStudentByUserId.mockResolvedValue(null);
    const scope = await resolveStudentScope(ctx([SYSTEM_ROLES.STUDENT]));
    expect(scope).toMatchObject({ isStudentScoped: true, studentId: undefined });
  });
});

describe("resolveStudentDataAccessScope", () => {
  it("returns an organization scope for a non-student", async () => {
    const scope = await resolveStudentDataAccessScope(ctx([SYSTEM_ROLES.SECRETARY]));
    expect(scope).toEqual({ type: "organization", organizationId: ORG });
  });

  it("returns a student scope carrying the resolved studentId", async () => {
    mockGetStudentByUserId.mockResolvedValue({ id: "student-1" });
    const scope = await resolveStudentDataAccessScope(ctx([SYSTEM_ROLES.STUDENT]));
    expect(scope).toEqual({ type: "student", organizationId: ORG, studentId: "student-1" });
  });

  it("throws AuthorizationError for a student with no linked profile (never falls back to org-wide)", async () => {
    mockGetStudentByUserId.mockResolvedValue(null);
    await expect(resolveStudentDataAccessScope(ctx([SYSTEM_ROLES.STUDENT]))).rejects.toBeInstanceOf(AuthorizationError);
  });
});

describe("redirectIfStudentScoped", () => {
  it("redirects a student-scoped user to /student", async () => {
    mockGetStudentByUserId.mockResolvedValue({ id: "student-1" });
    await expect(redirectIfStudentScoped(ctx([SYSTEM_ROLES.STUDENT]))).rejects.toThrow("NEXT_REDIRECT");
    expect(mockRedirect).toHaveBeenCalledWith("/student");
  });

  it("redirects a student-scoped user with no linked profile too (still must not see org-wide pages)", async () => {
    mockGetStudentByUserId.mockResolvedValue(null);
    await expect(redirectIfStudentScoped(ctx([SYSTEM_ROLES.STUDENT]))).rejects.toThrow("NEXT_REDIRECT");
    expect(mockRedirect).toHaveBeenCalledWith("/student");
  });

  it("is a no-op for a non-student (SECRETARY/TEACHER/ORG_ADMIN keep org-wide access)", async () => {
    await redirectIfStudentScoped(ctx([SYSTEM_ROLES.SECRETARY]));
    await redirectIfStudentScoped(ctx([SYSTEM_ROLES.TEACHER]));
    await redirectIfStudentScoped(ctx([SYSTEM_ROLES.ORG_ADMIN]));
    expect(mockRedirect).not.toHaveBeenCalled();
  });
});

describe("STUDENT access policy — no org-wide dashboards/admin or finance writes", () => {
  const studentPerms = ROLE_PERMISSIONS.STUDENT as string[];

  it("grants STUDENT no org-wide dashboard / cross-student / admin surfaces", () => {
    const forbidden = [
      "dashboard.view",
      "students.read",
      "teacherPortal.view",
      "teachers.read",
      "class_groups.read",
      "financialReports.view",
      "users.read",
    ];
    expect(forbidden.filter((p) => studentPerms.includes(p))).toEqual([]);
  });

  it("grants STUDENT no finance write codes (invoices/payments/receipts/wallets/refunds)", () => {
    const financeWrites = studentPerms.filter((p) =>
      /^(invoices|payments|receipts|wallets|refunds|billingPolicies)\.(create|update|delete)$/.test(p)
    );
    expect(financeWrites).toEqual([]);
  });
});
