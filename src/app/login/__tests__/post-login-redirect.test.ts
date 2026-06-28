import { describe, it, expect, vi, beforeEach } from "vitest";
import { PERMISSIONS, SYSTEM_ROLES } from "@/server/auth/permissions";

const { mockGetSession, mockIsSuperAdmin, mockRequireOrganization } = vi.hoisted(() => ({
  mockGetSession: vi.fn(),
  mockIsSuperAdmin: vi.fn(),
  mockRequireOrganization: vi.fn(),
}));

vi.mock("@/server/auth/session", () => ({ getSession: mockGetSession }));
vi.mock("@/server/auth/rbac", () => ({ isSuperAdmin: mockIsSuperAdmin }));
vi.mock("@/server/auth/context", () => ({ requireOrganization: mockRequireOrganization }));

import { getPostLoginRedirect } from "../actions";

/** A fake Ability whose `can()` returns true only for the granted permission codes. */
function abilityFor(granted: string[]) {
  const set = new Set(granted);
  return { can: (p: string) => set.has(p), canAll: () => false, canAny: () => false };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetSession.mockResolvedValue({ user: { id: "user-1" } });
  mockIsSuperAdmin.mockResolvedValue(false);
});

describe("getPostLoginRedirect", () => {
  it("sends SUPER_ADMIN to /organizations (resolved before requireOrganization, which may throw for an org-less user)", async () => {
    mockIsSuperAdmin.mockResolvedValue(true);
    mockRequireOrganization.mockRejectedValue(new Error("no org membership"));

    expect(await getPostLoginRedirect()).toBe("/organizations");
    expect(mockRequireOrganization).not.toHaveBeenCalled();
  });

  it("sends ORG_ADMIN to /dashboard", async () => {
    mockRequireOrganization.mockResolvedValue({
      roles: [SYSTEM_ROLES.ORG_ADMIN],
      ability: abilityFor(Object.values(PERMISSIONS)),
    });

    expect(await getPostLoginRedirect()).toBe("/dashboard");
  });

  it("sends a TEACHER to /teacher — NOT /dashboard, which is ORG_ADMIN-role-gated and would bounce them to /forbidden", async () => {
    mockRequireOrganization.mockResolvedValue({
      roles: [SYSTEM_ROLES.TEACHER],
      // TEACHER holds both TEACHER_PORTAL_VIEW and STUDENTS_READ — portal wins.
      ability: abilityFor([PERMISSIONS.TEACHER_PORTAL_VIEW, PERMISSIONS.STUDENTS_READ]),
    });

    expect(await getPostLoginRedirect()).toBe("/teacher");
  });

  it("sends a SECRETARY (student access, no portal/admin) to /students", async () => {
    mockRequireOrganization.mockResolvedValue({
      roles: [SYSTEM_ROLES.SECRETARY],
      ability: abilityFor([PERMISSIONS.STUDENTS_READ]),
    });

    expect(await getPostLoginRedirect()).toBe("/students");
  });

  it("sends a GUARDIAN to /guardian — their role lacks STUDENTS_READ, so without the branch they'd fall through to /notifications", async () => {
    mockRequireOrganization.mockResolvedValue({
      roles: [SYSTEM_ROLES.GUARDIAN],
      ability: abilityFor([PERMISSIONS.GUARDIAN_PORTAL_VIEW, PERMISSIONS.NOTIFICATIONS_VIEW_OWN]),
    });

    expect(await getPostLoginRedirect()).toBe("/guardian");
  });

  it("falls back to /notifications for a role with none of the above (never /forbidden)", async () => {
    mockRequireOrganization.mockResolvedValue({
      roles: [SYSTEM_ROLES.STUDENT],
      ability: abilityFor([PERMISSIONS.NOTIFICATIONS_VIEW_OWN]),
    });

    expect(await getPostLoginRedirect()).toBe("/notifications");
  });

  it("returns /login when the session/org cannot be resolved", async () => {
    mockIsSuperAdmin.mockRejectedValue(new Error("not authenticated"));

    expect(await getPostLoginRedirect()).toBe("/login");
  });
});
