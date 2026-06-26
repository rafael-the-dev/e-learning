import { describe, it, expect } from "vitest";
import { PERMISSIONS, ROLE_PERMISSIONS } from "../permissions";

// ---------------------------------------------------------------------------
// Teacher 360 permissions — TEACHERS_VIEW_360 / TEACHERS_VIEW_OWN_360 /
// TEACHERS_VIEW_SCHEDULE / TEACHERS_VIEW_PERFORMANCE / TEACHER_DOCUMENTS_*
//
// TEACHERS_VIEW_360 grants access to ANY teacher's 360 page; TEACHERS_VIEW_OWN_360
// only grants access to the caller's own linked Teacher record (enforced in
// teacher-360-access.service.ts, not by this permission alone) — TEACHER gets
// the OWN variant, never the unscoped one.
// ---------------------------------------------------------------------------

describe("Teacher 360 permissions — registered in catalog", () => {
  it("are registered with the expected codes", () => {
    expect(PERMISSIONS.TEACHERS_VIEW_360).toBe("teachers.view360");
    expect(PERMISSIONS.TEACHERS_VIEW_OWN_360).toBe("teachers.viewOwn360");
    expect(PERMISSIONS.TEACHERS_VIEW_SCHEDULE).toBe("teachers.viewSchedule");
    expect(PERMISSIONS.TEACHERS_VIEW_PERFORMANCE).toBe("teachers.viewPerformance");
    expect(PERMISSIONS.TEACHER_DOCUMENTS_VIEW).toBe("teacherDocuments.view");
    expect(PERMISSIONS.TEACHER_DOCUMENTS_UPLOAD).toBe("teacherDocuments.upload");
    expect(PERMISSIONS.TEACHER_DOCUMENTS_DELETE).toBe("teacherDocuments.delete");
  });
});

describe("ORG_ADMIN / SUPER_ADMIN — full access via wildcard", () => {
  it("are granted every Teacher 360 permission", () => {
    const all = [
      PERMISSIONS.TEACHERS_VIEW_360,
      PERMISSIONS.TEACHERS_VIEW_OWN_360,
      PERMISSIONS.TEACHERS_VIEW_SCHEDULE,
      PERMISSIONS.TEACHERS_VIEW_PERFORMANCE,
      PERMISSIONS.TEACHER_DOCUMENTS_VIEW,
      PERMISSIONS.TEACHER_DOCUMENTS_UPLOAD,
      PERMISSIONS.TEACHER_DOCUMENTS_DELETE,
    ];
    for (const perm of all) {
      expect(ROLE_PERMISSIONS.SUPER_ADMIN).toContain(perm);
      expect(ROLE_PERMISSIONS.ORG_ADMIN).toContain(perm);
    }
  });
});

describe("SECRETARY — view-any-teacher + schedule + performance + documents (no delete)", () => {
  it("is granted the unscoped 360 view plus schedule/performance/document-view/upload", () => {
    expect(ROLE_PERMISSIONS.SECRETARY).toContain(PERMISSIONS.TEACHERS_VIEW_360);
    expect(ROLE_PERMISSIONS.SECRETARY).toContain(PERMISSIONS.TEACHERS_VIEW_SCHEDULE);
    expect(ROLE_PERMISSIONS.SECRETARY).toContain(PERMISSIONS.TEACHERS_VIEW_PERFORMANCE);
    expect(ROLE_PERMISSIONS.SECRETARY).toContain(PERMISSIONS.TEACHER_DOCUMENTS_VIEW);
    expect(ROLE_PERMISSIONS.SECRETARY).toContain(PERMISSIONS.TEACHER_DOCUMENTS_UPLOAD);
  });

  it("is NOT granted the own-only variant or document delete", () => {
    expect(ROLE_PERMISSIONS.SECRETARY).not.toContain(PERMISSIONS.TEACHERS_VIEW_OWN_360);
    expect(ROLE_PERMISSIONS.SECRETARY).not.toContain(PERMISSIONS.TEACHER_DOCUMENTS_DELETE);
  });
});

describe("TEACHER — own-profile only", () => {
  it("is granted the own-only 360 view plus schedule/performance/document-view", () => {
    expect(ROLE_PERMISSIONS.TEACHER).toContain(PERMISSIONS.TEACHERS_VIEW_OWN_360);
    expect(ROLE_PERMISSIONS.TEACHER).toContain(PERMISSIONS.TEACHERS_VIEW_SCHEDULE);
    expect(ROLE_PERMISSIONS.TEACHER).toContain(PERMISSIONS.TEACHERS_VIEW_PERFORMANCE);
    expect(ROLE_PERMISSIONS.TEACHER).toContain(PERMISSIONS.TEACHER_DOCUMENTS_VIEW);
  });

  it("is NOT granted unscoped 360 view, document upload, or document delete", () => {
    expect(ROLE_PERMISSIONS.TEACHER).not.toContain(PERMISSIONS.TEACHERS_VIEW_360);
    expect(ROLE_PERMISSIONS.TEACHER).not.toContain(PERMISSIONS.TEACHER_DOCUMENTS_UPLOAD);
    expect(ROLE_PERMISSIONS.TEACHER).not.toContain(PERMISSIONS.TEACHER_DOCUMENTS_DELETE);
  });
});

describe("STUDENT — no access", () => {
  it("is granted none of the Teacher 360 permissions", () => {
    const all = [
      PERMISSIONS.TEACHERS_VIEW_360,
      PERMISSIONS.TEACHERS_VIEW_OWN_360,
      PERMISSIONS.TEACHERS_VIEW_SCHEDULE,
      PERMISSIONS.TEACHERS_VIEW_PERFORMANCE,
      PERMISSIONS.TEACHER_DOCUMENTS_VIEW,
      PERMISSIONS.TEACHER_DOCUMENTS_UPLOAD,
      PERMISSIONS.TEACHER_DOCUMENTS_DELETE,
    ];
    for (const perm of all) {
      expect(ROLE_PERMISSIONS.STUDENT).not.toContain(perm);
    }
  });
});
