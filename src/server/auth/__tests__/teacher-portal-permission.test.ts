import { describe, it, expect } from "vitest";
import { PERMISSIONS, ROLE_PERMISSIONS } from "../permissions";

// ---------------------------------------------------------------------------
// Teacher Portal permission — TEACHER_PORTAL_VIEW
//
// Gates /teacher (the operational workspace), distinct from
// TEACHERS_VIEW_OWN_360 which gates /teachers/[teacherId] (the profile).
// ---------------------------------------------------------------------------

describe("TEACHER_PORTAL_VIEW — registered in catalog", () => {
  it("is registered with the expected code", () => {
    expect(PERMISSIONS.TEACHER_PORTAL_VIEW).toBe("teacherPortal.view");
  });
});

describe("ORG_ADMIN / SUPER_ADMIN — granted for preview/support", () => {
  // Both are computed wildcards (Object.values(PERMISSIONS), ORG_ADMIN minus
  // organizations.delete*) — no explicit listing needed; this just guards
  // against TEACHER_PORTAL_VIEW ever being excluded by a future filter tweak.
  it("ORG_ADMIN is granted TEACHER_PORTAL_VIEW", () => {
    expect(ROLE_PERMISSIONS.ORG_ADMIN).toContain(PERMISSIONS.TEACHER_PORTAL_VIEW);
  });

  it("SUPER_ADMIN is granted TEACHER_PORTAL_VIEW", () => {
    expect(ROLE_PERMISSIONS.SUPER_ADMIN).toContain(PERMISSIONS.TEACHER_PORTAL_VIEW);
  });
});

describe("TEACHER — granted", () => {
  it("is granted TEACHER_PORTAL_VIEW", () => {
    expect(ROLE_PERMISSIONS.TEACHER).toContain(PERMISSIONS.TEACHER_PORTAL_VIEW);
  });
});

describe("SECRETARY / STUDENT — no access", () => {
  it("SECRETARY is NOT granted TEACHER_PORTAL_VIEW", () => {
    expect(ROLE_PERMISSIONS.SECRETARY).not.toContain(PERMISSIONS.TEACHER_PORTAL_VIEW);
  });

  it("STUDENT is NOT granted TEACHER_PORTAL_VIEW", () => {
    expect(ROLE_PERMISSIONS.STUDENT).not.toContain(PERMISSIONS.TEACHER_PORTAL_VIEW);
  });
});
