import { describe, it, expect } from "vitest";
import { PERMISSIONS, ROLE_PERMISSIONS, SYSTEM_ROLES } from "../permissions";

// ---------------------------------------------------------------------------
// Guardian Portal permissions — GUARDIAN_PORTAL_VIEW + GUARDIAN_LINKS_MANAGE
//
// GUARDIAN_PORTAL_VIEW gates /guardian (the responsible-party workspace).
// GUARDIAN_LINKS_MANAGE gates the Student 360 "Encarregados" admin card.
// ---------------------------------------------------------------------------

describe("GUARDIAN role + permissions — catalog", () => {
  it("registers GUARDIAN_PORTAL_VIEW with the expected code", () => {
    expect(PERMISSIONS.GUARDIAN_PORTAL_VIEW).toBe("guardianPortal.view");
  });

  it("registers GUARDIAN_LINKS_MANAGE with the expected code", () => {
    expect(PERMISSIONS.GUARDIAN_LINKS_MANAGE).toBe("guardianLinks.manage");
  });

  it("defines the GUARDIAN system role", () => {
    expect(SYSTEM_ROLES.GUARDIAN).toBe("GUARDIAN");
    expect(ROLE_PERMISSIONS.GUARDIAN).toBeDefined();
  });
});

describe("GUARDIAN_PORTAL_VIEW — grants", () => {
  it("GUARDIAN is granted GUARDIAN_PORTAL_VIEW", () => {
    expect(ROLE_PERMISSIONS.GUARDIAN).toContain(PERMISSIONS.GUARDIAN_PORTAL_VIEW);
  });

  it("ORG_ADMIN / SUPER_ADMIN are granted it (preview/support via wildcard)", () => {
    expect(ROLE_PERMISSIONS.ORG_ADMIN).toContain(PERMISSIONS.GUARDIAN_PORTAL_VIEW);
    expect(ROLE_PERMISSIONS.SUPER_ADMIN).toContain(PERMISSIONS.GUARDIAN_PORTAL_VIEW);
  });

  it("STUDENT / TEACHER / SECRETARY are NOT granted GUARDIAN_PORTAL_VIEW", () => {
    expect(ROLE_PERMISSIONS.STUDENT).not.toContain(PERMISSIONS.GUARDIAN_PORTAL_VIEW);
    expect(ROLE_PERMISSIONS.TEACHER).not.toContain(PERMISSIONS.GUARDIAN_PORTAL_VIEW);
    expect(ROLE_PERMISSIONS.SECRETARY).not.toContain(PERMISSIONS.GUARDIAN_PORTAL_VIEW);
  });
});

describe("GUARDIAN_LINKS_MANAGE — grants", () => {
  it("SECRETARY can manage guardian links", () => {
    expect(ROLE_PERMISSIONS.SECRETARY).toContain(PERMISSIONS.GUARDIAN_LINKS_MANAGE);
  });

  it("ORG_ADMIN / SUPER_ADMIN can manage guardian links (via wildcard)", () => {
    expect(ROLE_PERMISSIONS.ORG_ADMIN).toContain(PERMISSIONS.GUARDIAN_LINKS_MANAGE);
    expect(ROLE_PERMISSIONS.SUPER_ADMIN).toContain(PERMISSIONS.GUARDIAN_LINKS_MANAGE);
  });

  it("GUARDIAN / STUDENT / TEACHER cannot manage guardian links", () => {
    expect(ROLE_PERMISSIONS.GUARDIAN).not.toContain(PERMISSIONS.GUARDIAN_LINKS_MANAGE);
    expect(ROLE_PERMISSIONS.STUDENT).not.toContain(PERMISSIONS.GUARDIAN_LINKS_MANAGE);
    expect(ROLE_PERMISSIONS.TEACHER).not.toContain(PERMISSIONS.GUARDIAN_LINKS_MANAGE);
  });
});

describe("GUARDIAN role — minimal blast radius", () => {
  it("does not grant administrative/student/teacher data permissions", () => {
    expect(ROLE_PERMISSIONS.GUARDIAN).not.toContain(PERMISSIONS.STUDENTS_READ);
    expect(ROLE_PERMISSIONS.GUARDIAN).not.toContain(PERMISSIONS.STUDENT_PORTAL_VIEW);
    expect(ROLE_PERMISSIONS.GUARDIAN).not.toContain(PERMISSIONS.TEACHER_PORTAL_VIEW);
    expect(ROLE_PERMISSIONS.GUARDIAN).not.toContain(PERMISSIONS.FINANCIAL_REPORTS_VIEW);
    expect(ROLE_PERMISSIONS.GUARDIAN).not.toContain(PERMISSIONS.DASHBOARD_VIEW);
  });
});
