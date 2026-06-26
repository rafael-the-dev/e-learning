import { describe, it, expect } from "vitest";
import {
  getTeacher360TabAccess,
  resolveActiveTeacher360Tab,
  canViewTeacher360,
} from "../services/teacher-360-access.service";
import { PERMISSIONS } from "@/server/auth/permissions";

function canFrom(granted: string[]) {
  const set = new Set(granted);
  return (permission: string) => set.has(permission);
}

describe("getTeacher360TabAccess", () => {
  it("always shows the overview and timeline tabs regardless of permissions", () => {
    const access = getTeacher360TabAccess(canFrom([]));
    expect(access.find((a) => a.key === "overview")?.visible).toBe(true);
    expect(access.find((a) => a.key === "timeline")?.visible).toBe(true);
  });

  it("hides every gated tab when the user has no extra permissions", () => {
    const access = getTeacher360TabAccess(canFrom([]));
    const gated = access.filter((a) => a.key !== "overview" && a.key !== "timeline");
    expect(gated.every((a) => a.visible === false)).toBe(true);
  });

  it("shows the schedule tab only when TEACHERS_VIEW_SCHEDULE is granted", () => {
    const withPerm = getTeacher360TabAccess(canFrom([PERMISSIONS.TEACHERS_VIEW_SCHEDULE]));
    expect(withPerm.find((a) => a.key === "schedule")?.visible).toBe(true);
    expect(getTeacher360TabAccess(canFrom([])).find((a) => a.key === "schedule")?.visible).toBe(false);
  });

  it("shows classGroups/subjects/assessments/attendance via the existing module permissions", () => {
    const access = getTeacher360TabAccess(
      canFrom([
        PERMISSIONS.CLASS_GROUPS_READ,
        PERMISSIONS.SUBJECTS_VIEW,
        PERMISSIONS.ASSESSMENTS_VIEW,
        PERMISSIONS.ATTENDANCE_SESSIONS_VIEW,
      ])
    );
    expect(access.find((a) => a.key === "classGroups")?.visible).toBe(true);
    expect(access.find((a) => a.key === "subjects")?.visible).toBe(true);
    expect(access.find((a) => a.key === "assessments")?.visible).toBe(true);
    expect(access.find((a) => a.key === "attendance")?.visible).toBe(true);
  });

  it("shows the performance tab only when TEACHERS_VIEW_PERFORMANCE is granted", () => {
    const access = getTeacher360TabAccess(canFrom([PERMISSIONS.TEACHERS_VIEW_PERFORMANCE]));
    expect(access.find((a) => a.key === "performance")?.visible).toBe(true);
  });

  it("shows the documents tab only when TEACHER_DOCUMENTS_VIEW is granted", () => {
    const access = getTeacher360TabAccess(canFrom([PERMISSIONS.TEACHER_DOCUMENTS_VIEW]));
    expect(access.find((a) => a.key === "documents")?.visible).toBe(true);
  });

  it("grants every tab for a fully-permissioned role (e.g. ORG_ADMIN)", () => {
    const access = getTeacher360TabAccess(canFrom(Object.values(PERMISSIONS)));
    expect(access.every((a) => a.visible)).toBe(true);
  });
});

describe("resolveActiveTeacher360Tab", () => {
  const access = getTeacher360TabAccess(canFrom([PERMISSIONS.TEACHERS_VIEW_SCHEDULE]));

  it("returns the requested tab when it is visible", () => {
    expect(resolveActiveTeacher360Tab("schedule", access)).toBe("schedule");
  });

  it("falls back to overview when the requested tab is not visible (e.g. denied permission)", () => {
    expect(resolveActiveTeacher360Tab("performance", access)).toBe("overview");
  });

  it("falls back to overview when the requested tab does not exist", () => {
    expect(resolveActiveTeacher360Tab("not-a-real-tab", access)).toBe("overview");
  });

  it("falls back to overview when no tab is requested", () => {
    expect(resolveActiveTeacher360Tab(undefined, access)).toBe("overview");
  });
});

describe("canViewTeacher360", () => {
  it("grants access to any teacher when TEACHERS_VIEW_360 is held", () => {
    expect(canViewTeacher360(canFrom([PERMISSIONS.TEACHERS_VIEW_360]), false)).toBe(true);
    expect(canViewTeacher360(canFrom([PERMISSIONS.TEACHERS_VIEW_360]), true)).toBe(true);
  });

  it("grants access only to the caller's own profile when only TEACHERS_VIEW_OWN_360 is held", () => {
    expect(canViewTeacher360(canFrom([PERMISSIONS.TEACHERS_VIEW_OWN_360]), true)).toBe(true);
    expect(canViewTeacher360(canFrom([PERMISSIONS.TEACHERS_VIEW_OWN_360]), false)).toBe(false);
  });

  it("denies access when neither permission is held", () => {
    expect(canViewTeacher360(canFrom([]), true)).toBe(false);
    expect(canViewTeacher360(canFrom([]), false)).toBe(false);
  });
});
