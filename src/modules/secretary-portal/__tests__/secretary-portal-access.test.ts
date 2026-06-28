import { describe, it, expect } from "vitest";
import { ROLE_PERMISSIONS, PERMISSIONS, SYSTEM_ROLES } from "@/server/auth/permissions";

// =============================================================================
// SECRETARY PORTAL — ACCESS CONTROL
// SECRETARY_PORTAL_VIEW gates /secretary. SECRETARY/ORG_ADMIN/SUPER_ADMIN may
// access; TEACHER/STUDENT may not. Also asserts the role stays free of
// admin-only surfaces (roles/permissions, cross-org).
// =============================================================================

describe("SECRETARY_PORTAL_VIEW permission", () => {
  it("exists in the permission catalog", () => {
    expect(PERMISSIONS.SECRETARY_PORTAL_VIEW).toBe("secretaryPortal.view");
  });

  it("(1) SECRETARY can access", () => {
    expect(ROLE_PERMISSIONS[SYSTEM_ROLES.SECRETARY]).toContain(PERMISSIONS.SECRETARY_PORTAL_VIEW);
  });

  it("(2) ORG_ADMIN can access", () => {
    expect(ROLE_PERMISSIONS[SYSTEM_ROLES.ORG_ADMIN]).toContain(PERMISSIONS.SECRETARY_PORTAL_VIEW);
  });

  it("(3) SUPER_ADMIN can access", () => {
    expect(ROLE_PERMISSIONS[SYSTEM_ROLES.SUPER_ADMIN]).toContain(PERMISSIONS.SECRETARY_PORTAL_VIEW);
  });

  it("(4) TEACHER cannot access", () => {
    expect(ROLE_PERMISSIONS[SYSTEM_ROLES.TEACHER]).not.toContain(PERMISSIONS.SECRETARY_PORTAL_VIEW);
  });

  it("(5) STUDENT cannot access", () => {
    expect(ROLE_PERMISSIONS[SYSTEM_ROLES.STUDENT]).not.toContain(PERMISSIONS.SECRETARY_PORTAL_VIEW);
  });
});

describe("SECRETARY role stays within operational bounds", () => {
  const secretary = ROLE_PERMISSIONS[SYSTEM_ROLES.SECRETARY] as string[];

  it("(17) exposes no role/permission management", () => {
    expect(secretary.some((p) => p.startsWith("roles."))).toBe(false);
    expect(secretary.some((p) => p.startsWith("organizationRoles."))).toBe(false);
  });

  it("(18) exposes no global / cross-organization management", () => {
    expect(secretary.some((p) => p.startsWith("organizations."))).toBe(false);
    expect(secretary.some((p) => p.startsWith("users."))).toBe(false);
  });
});
