import { describe, it, expect } from "vitest";
import { buildTeacherQuickActions } from "../components/teacher-quick-actions";

const TEACHER_ID = "teacher-1";

const UNSAFE_ORG_WIDE_HREFS = ["/attendance/sessions", "/assessments", "/class-groups"];

describe("buildTeacherQuickActions", () => {
  it("never links a plain TEACHER (canViewOrgWide=false) to an unfiltered org-wide page", () => {
    const actions = buildTeacherQuickActions(TEACHER_ID, false);
    const hrefs = actions.map((a) => a.href);

    for (const unsafeHref of UNSAFE_ORG_WIDE_HREFS) {
      expect(hrefs).not.toContain(unsafeHref);
    }
  });

  it("anchors the attendance/grading/classes actions to in-page portal sections instead", () => {
    const actions = buildTeacherQuickActions(TEACHER_ID, false);
    const byKey = new Map(actions.map((a) => [a.key, a.href]));

    expect(byKey.get("attendance")).toBe("#today-schedule");
    expect(byKey.get("grading")).toBe("#pending-work");
    expect(byKey.get("classes")).toBe("#my-classes");
  });

  it("still links Notificações and the teacher's own Teacher 360 profile, regardless of canViewOrgWide", () => {
    const actions = buildTeacherQuickActions(TEACHER_ID, false);
    const byKey = new Map(actions.map((a) => [a.key, a.href]));

    expect(byKey.get("notifications")).toBe("/notifications");
    expect(byKey.get("teacher360")).toBe(`/teachers/${TEACHER_ID}`);
  });

  it("restores the real org-wide links for ORG_ADMIN/SUPER_ADMIN previewing the portal (canViewOrgWide=true) — intentional, not an oversight", () => {
    const actions = buildTeacherQuickActions(TEACHER_ID, true);
    const hrefs = actions.map((a) => a.href);

    for (const orgWideHref of UNSAFE_ORG_WIDE_HREFS) {
      expect(hrefs).toContain(orgWideHref);
    }
  });

  it("never exposes a teacherId query param or any other teacher's id on any link", () => {
    const actions = buildTeacherQuickActions(TEACHER_ID, true);
    for (const action of actions) {
      expect(action.href).not.toContain("teacherId=");
    }
  });
});
