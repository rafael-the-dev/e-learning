import { describe, it, expect } from "vitest";
import { PERMISSIONS, ROLE_PERMISSIONS } from "../permissions";

// ---------------------------------------------------------------------------
// Notifications Phase 3.3 — Operations Dashboard permission (test #23)
//
// No component-rendering test harness exists in this codebase (no
// @testing-library/react / jsdom setup) to assert the "Operações" tab is
// hidden in JSX — the tab's visibility is a single `canViewOperations &&`
// guard around the same `ability.can()` check this test pins, so covering
// the permission catalog/grants here is the meaningful regression test.
// ---------------------------------------------------------------------------

describe("NOTIFICATIONS_VIEW_OPERATIONS — permission enforced (test #23)", () => {
  it("is registered in the permission catalog", () => {
    expect(PERMISSIONS.NOTIFICATIONS_VIEW_OPERATIONS).toBe("notifications.viewOperations");
  });

  it("is granted to SUPER_ADMIN and ORG_ADMIN by default", () => {
    expect(ROLE_PERMISSIONS.SUPER_ADMIN).toContain(PERMISSIONS.NOTIFICATIONS_VIEW_OPERATIONS);
    expect(ROLE_PERMISSIONS.ORG_ADMIN).toContain(PERMISSIONS.NOTIFICATIONS_VIEW_OPERATIONS);
  });

  it("is NOT granted to SECRETARY, TEACHER, or STUDENT by default", () => {
    expect(ROLE_PERMISSIONS.SECRETARY).not.toContain(PERMISSIONS.NOTIFICATIONS_VIEW_OPERATIONS);
    expect(ROLE_PERMISSIONS.TEACHER).not.toContain(PERMISSIONS.NOTIFICATIONS_VIEW_OPERATIONS);
    expect(ROLE_PERMISSIONS.STUDENT).not.toContain(PERMISSIONS.NOTIFICATIONS_VIEW_OPERATIONS);
  });
});
