import { describe, it, expect } from "vitest";
import { PERMISSIONS, ROLE_PERMISSIONS } from "../permissions";

// ---------------------------------------------------------------------------
// Student Portal permission — STUDENT_PORTAL_VIEW
//
// Gates /student (the self-service workspace), distinct from the administrative
// Student 360 view at /students/[studentId] (gated by students.read).
// ---------------------------------------------------------------------------

describe("STUDENT_PORTAL_VIEW — registered in catalog", () => {
  it("is registered with the expected code", () => {
    expect(PERMISSIONS.STUDENT_PORTAL_VIEW).toBe("studentPortal.view");
  });
});

describe("STUDENT — granted", () => {
  it("is granted STUDENT_PORTAL_VIEW", () => {
    expect(ROLE_PERMISSIONS.STUDENT).toContain(PERMISSIONS.STUDENT_PORTAL_VIEW);
  });
});

describe("ORG_ADMIN / SUPER_ADMIN — granted for preview/support", () => {
  it("ORG_ADMIN is granted STUDENT_PORTAL_VIEW (via wildcard)", () => {
    expect(ROLE_PERMISSIONS.ORG_ADMIN).toContain(PERMISSIONS.STUDENT_PORTAL_VIEW);
  });

  it("SUPER_ADMIN is granted STUDENT_PORTAL_VIEW (via wildcard)", () => {
    expect(ROLE_PERMISSIONS.SUPER_ADMIN).toContain(PERMISSIONS.STUDENT_PORTAL_VIEW);
  });
});

describe("SECRETARY / TEACHER — no access", () => {
  it("SECRETARY is NOT granted STUDENT_PORTAL_VIEW", () => {
    expect(ROLE_PERMISSIONS.SECRETARY).not.toContain(PERMISSIONS.STUDENT_PORTAL_VIEW);
  });

  it("TEACHER is NOT granted STUDENT_PORTAL_VIEW", () => {
    expect(ROLE_PERMISSIONS.TEACHER).not.toContain(PERMISSIONS.STUDENT_PORTAL_VIEW);
  });
});
