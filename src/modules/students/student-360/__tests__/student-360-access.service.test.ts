import { describe, it, expect } from "vitest";
import {
  getStudent360TabAccess,
  resolveActiveStudent360Tab,
  resolveStudent360Capabilities,
} from "../services/student-360-access.service";
import { PERMISSIONS } from "@/server/auth/permissions";

function canFrom(granted: string[]) {
  const set = new Set(granted);
  return (permission: string) => set.has(permission);
}

describe("getStudent360TabAccess", () => {
  it("always shows the overview tab regardless of permissions", () => {
    const access = getStudent360TabAccess(canFrom([]));
    expect(access.find((a) => a.key === "overview")?.visible).toBe(true);
  });

  it("hides every other tab when the user has no extra permissions", () => {
    const access = getStudent360TabAccess(canFrom([]));
    const hidden = access.filter((a) => a.key !== "overview");
    expect(hidden.every((a) => a.visible === false)).toBe(true);
  });

  it("shows the finance tab only when INVOICES_VIEW is granted", () => {
    const withPerm = getStudent360TabAccess(canFrom([PERMISSIONS.INVOICES_VIEW]));
    expect(withPerm.find((a) => a.key === "finance")?.visible).toBe(true);

    const without = getStudent360TabAccess(canFrom([]));
    expect(without.find((a) => a.key === "finance")?.visible).toBe(false);
  });

  it("shows the progress tab if either level or course progress permission is granted", () => {
    const withLevel = getStudent360TabAccess(canFrom([PERMISSIONS.STUDENT_LEVEL_PROGRESS_VIEW]));
    const withCourse = getStudent360TabAccess(canFrom([PERMISSIONS.STUDENT_COURSE_PROGRESS_VIEW]));
    expect(withLevel.find((a) => a.key === "progress")?.visible).toBe(true);
    expect(withCourse.find((a) => a.key === "progress")?.visible).toBe(true);
  });

  it("shows the documents tab only when STUDENT_DOCUMENTS_VIEW is granted", () => {
    const access = getStudent360TabAccess(canFrom([PERMISSIONS.STUDENT_DOCUMENTS_VIEW]));
    expect(access.find((a) => a.key === "documents")?.visible).toBe(true);
  });

  it("grants every tab for a fully-permissioned role (e.g. ORG_ADMIN)", () => {
    const access = getStudent360TabAccess(canFrom(Object.values(PERMISSIONS)));
    expect(access.every((a) => a.visible)).toBe(true);
  });
});

describe("resolveStudent360Capabilities (F-M6)", () => {
  it("denies every dimension for a role with no permissions", () => {
    const caps = resolveStudent360Capabilities(canFrom([]));
    expect(caps).toEqual({
      canViewInvoices: false,
      canViewWallet: false,
      canViewAcademic: false,
      canViewAttendance: false,
      canViewProgression: false,
      canViewDocuments: false,
      canViewTimeline: false,
    });
  });

  it("maps each dimension to its own permission (grades → academic, attendance sessions → attendance, …)", () => {
    expect(resolveStudent360Capabilities(canFrom([PERMISSIONS.GRADES_VIEW])).canViewAcademic).toBe(true);
    expect(
      resolveStudent360Capabilities(canFrom([PERMISSIONS.ATTENDANCE_SESSIONS_VIEW])).canViewAttendance
    ).toBe(true);
    expect(
      resolveStudent360Capabilities(canFrom([PERMISSIONS.STUDENT_DOCUMENTS_VIEW])).canViewDocuments
    ).toBe(true);
    expect(
      resolveStudent360Capabilities(canFrom([PERMISSIONS.STUDENT_TIMELINE_VIEW])).canViewTimeline
    ).toBe(true);
  });

  it("grants progression when EITHER level or course progress permission is present", () => {
    expect(
      resolveStudent360Capabilities(canFrom([PERMISSIONS.STUDENT_LEVEL_PROGRESS_VIEW])).canViewProgression
    ).toBe(true);
    expect(
      resolveStudent360Capabilities(canFrom([PERMISSIONS.STUDENT_COURSE_PROGRESS_VIEW])).canViewProgression
    ).toBe(true);
  });

  it("a single permission never leaks any other dimension", () => {
    const caps = resolveStudent360Capabilities(canFrom([PERMISSIONS.GRADES_VIEW]));
    expect(caps.canViewAttendance).toBe(false);
    expect(caps.canViewProgression).toBe(false);
    expect(caps.canViewDocuments).toBe(false);
    expect(caps.canViewInvoices).toBe(false);
    expect(caps.canViewWallet).toBe(false);
  });

  it("grants every dimension for a fully-permissioned role", () => {
    const caps = resolveStudent360Capabilities(canFrom(Object.values(PERMISSIONS)));
    expect(Object.values(caps).every(Boolean)).toBe(true);
  });
});

describe("resolveActiveStudent360Tab", () => {
  const access = getStudent360TabAccess(canFrom([PERMISSIONS.INVOICES_VIEW]));

  it("returns the requested tab when it is visible", () => {
    expect(resolveActiveStudent360Tab("finance", access)).toBe("finance");
  });

  it("falls back to overview when the requested tab is not visible (e.g. denied permission)", () => {
    expect(resolveActiveStudent360Tab("grades", access)).toBe("overview");
  });

  it("falls back to overview when the requested tab does not exist", () => {
    expect(resolveActiveStudent360Tab("not-a-real-tab", access)).toBe("overview");
  });

  it("falls back to overview when no tab is requested", () => {
    expect(resolveActiveStudent360Tab(undefined, access)).toBe("overview");
  });
});
