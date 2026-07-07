import { describe, it, expect } from "vitest";
import { PERMISSIONS, ROLE_PERMISSIONS } from "@/server/auth/permissions";

// =============================================================================
// PHASE 0 — RBAC (tests 14–18)
// -----------------------------------------------------------------------------
// The seed derives from PERMISSIONS / ROLE_PERMISSIONS, so asserting the mapping
// here also protects the seed. Existing roles must not be weakened; these tests
// only assert the certificate-permission surface.
// =============================================================================

const ALL_CERT_PERMS = [
  PERMISSIONS.CERTIFICATES_VIEW,
  PERMISSIONS.CERTIFICATES_VIEW_OWN,
  PERMISSIONS.CERTIFICATES_GENERATE,
  PERMISSIONS.CERTIFICATES_ISSUE,
  PERMISSIONS.CERTIFICATES_REVOKE,
  PERMISSIONS.CERTIFICATES_SUSPEND,
  PERMISSIONS.CERTIFICATES_EXPORT,
  PERMISSIONS.CERTIFICATES_VERIFY,
  PERMISSIONS.CERTIFICATES_REQUEST,
  PERMISSIONS.CERTIFICATE_POLICIES_MANAGE,
  PERMISSIONS.CERTIFICATE_TEMPLATES_MANAGE,
];

function certPermsOf(role: keyof typeof ROLE_PERMISSIONS): string[] {
  return ROLE_PERMISSIONS[role].filter((p) =>
    (ALL_CERT_PERMS as string[]).includes(p as string)
  );
}

describe("certificate permissions — admin roles (test 14)", () => {
  it("SUPER_ADMIN gets every certificate permission (via Object.values wildcard)", () => {
    for (const perm of ALL_CERT_PERMS) {
      expect(ROLE_PERMISSIONS.SUPER_ADMIN).toContain(perm);
    }
  });

  it("ORG_ADMIN gets every certificate permission (auto, minus only organizations.delete)", () => {
    for (const perm of ALL_CERT_PERMS) {
      expect(ROLE_PERMISSIONS.ORG_ADMIN).toContain(perm);
    }
  });
});

describe("certificate permissions — SECRETARY (test 15)", () => {
  it("has exactly view/generate/export/request/verify — no issue/revoke/suspend/manage", () => {
    expect(certPermsOf("SECRETARY").sort()).toEqual(
      [
        PERMISSIONS.CERTIFICATES_VIEW,
        PERMISSIONS.CERTIFICATES_GENERATE,
        PERMISSIONS.CERTIFICATES_EXPORT,
        PERMISSIONS.CERTIFICATES_REQUEST,
        PERMISSIONS.CERTIFICATES_VERIFY,
      ].sort()
    );
    expect(ROLE_PERMISSIONS.SECRETARY).not.toContain(PERMISSIONS.CERTIFICATES_ISSUE);
    expect(ROLE_PERMISSIONS.SECRETARY).not.toContain(PERMISSIONS.CERTIFICATES_REVOKE);
    expect(ROLE_PERMISSIONS.SECRETARY).not.toContain(PERMISSIONS.CERTIFICATES_SUSPEND);
    expect(ROLE_PERMISSIONS.SECRETARY).not.toContain(PERMISSIONS.CERTIFICATE_POLICIES_MANAGE);
    expect(ROLE_PERMISSIONS.SECRETARY).not.toContain(PERMISSIONS.CERTIFICATE_TEMPLATES_MANAGE);
  });
});

describe("certificate permissions — STUDENT (test 16)", () => {
  it("has exactly viewOwn + request", () => {
    expect(certPermsOf("STUDENT").sort()).toEqual(
      [PERMISSIONS.CERTIFICATES_VIEW_OWN, PERMISSIONS.CERTIFICATES_REQUEST].sort()
    );
  });
});

describe("certificate permissions — TEACHER (test 17)", () => {
  it("has no certificate permissions by default", () => {
    expect(certPermsOf("TEACHER")).toEqual([]);
  });
});

describe("certificate permissions — GUARDIAN (test 18)", () => {
  it("has no certificate permissions yet (linked-student scope comes later)", () => {
    expect(certPermsOf("GUARDIAN")).toEqual([]);
  });
});
