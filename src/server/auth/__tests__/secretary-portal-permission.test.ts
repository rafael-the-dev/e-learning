import { describe, it, expect } from "vitest";
import { PERMISSIONS, ROLE_PERMISSIONS } from "../permissions";

// ---------------------------------------------------------------------------
// Secretary Portal permission — SECRETARY_PORTAL_VIEW
//
// Gates /secretary (the operational workspace), distinct from the strategic
// Executive Dashboard at /dashboard (gated by dashboard.view).
//
// The seed (prisma/seed.ts) is data-driven from PERMISSIONS + ROLE_PERMISSIONS,
// so a permission present here is inserted into the Permission table and granted
// to each role's RolePermission rows on `pnpm db:seed`. This test is the
// deployment guard: it fails if the catalog/role wiring ever drifts, which is
// the same drift the runtime authorization (DB-backed) depends on.
// ---------------------------------------------------------------------------

describe("SECRETARY_PORTAL_VIEW — registered in catalog", () => {
  it("is registered with the expected code", () => {
    expect(PERMISSIONS.SECRETARY_PORTAL_VIEW).toBe("secretaryPortal.view");
  });

  it("is included in the seedable permission catalog", () => {
    expect(Object.values(PERMISSIONS)).toContain(PERMISSIONS.SECRETARY_PORTAL_VIEW);
  });
});

describe("SECRETARY — granted", () => {
  it("is granted SECRETARY_PORTAL_VIEW", () => {
    expect(ROLE_PERMISSIONS.SECRETARY).toContain(PERMISSIONS.SECRETARY_PORTAL_VIEW);
  });
});

describe("ORG_ADMIN / SUPER_ADMIN — granted via wildcard (preview/support)", () => {
  it("ORG_ADMIN is granted SECRETARY_PORTAL_VIEW", () => {
    expect(ROLE_PERMISSIONS.ORG_ADMIN).toContain(PERMISSIONS.SECRETARY_PORTAL_VIEW);
  });

  it("SUPER_ADMIN is granted SECRETARY_PORTAL_VIEW", () => {
    expect(ROLE_PERMISSIONS.SUPER_ADMIN).toContain(PERMISSIONS.SECRETARY_PORTAL_VIEW);
  });
});

describe("TEACHER / STUDENT — no access", () => {
  it("TEACHER is NOT granted SECRETARY_PORTAL_VIEW", () => {
    expect(ROLE_PERMISSIONS.TEACHER).not.toContain(PERMISSIONS.SECRETARY_PORTAL_VIEW);
  });

  it("STUDENT is NOT granted SECRETARY_PORTAL_VIEW", () => {
    expect(ROLE_PERMISSIONS.STUDENT).not.toContain(PERMISSIONS.SECRETARY_PORTAL_VIEW);
  });
});
