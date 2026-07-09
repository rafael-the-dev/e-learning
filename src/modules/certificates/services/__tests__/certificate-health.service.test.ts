import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeFakeDb, seed, type FakeDb } from "../../repositories/__tests__/_fake-db";

// =============================================================================
// CertificateHealthService — Phase 14 tests
// -----------------------------------------------------------------------------
// Aggregate KPI counts over the fake DB: certificate/export/request status counts,
// verification totals + mismatches, soft-deleted exclusion, org scoping, authz.
// =============================================================================

const h = vi.hoisted(() => ({ db: null as unknown as FakeDb }));
vi.mock("@/server/db", () => ({ getDb: vi.fn(async () => h.db) }));

import { AuthorizationError } from "@/shared/lib/command";
import { PERMISSIONS } from "@/server/auth/permissions";
import type { AuthContext } from "@/server/auth/context";
import { CertificateHealthService } from "../certificate-health.service";

const ORG = "org-A";
const OTHER = "org-B";
const NOW = new Date("2026-07-09T10:00:00.000Z");

function ctx(perms: string[] = [PERMISSIONS.CERTIFICATES_VIEW], org = ORG): AuthContext {
  const set = new Set(perms);
  return { userId: "u-1", organizationId: org, roles: [], ability: { can: (p: string) => set.has(p) } } as unknown as AuthContext;
}

const service = new CertificateHealthService();

beforeEach(() => {
  vi.clearAllMocks();
  h.db = makeFakeDb();
});
afterEach(() => vi.restoreAllMocks());

function seedWorld(): void {
  const cert = (id: string, o: Record<string, unknown>) =>
    seed(h.db, "certificate", { id, organizationId: ORG, status: "ISSUED", deletedAt: null, ...o });
  cert("i1", { status: "ISSUED" });
  cert("i2", { status: "ISSUED" });
  cert("r1", { status: "REVOKED" });
  cert("s1", { status: "SUSPENDED" });
  cert("st1", { status: "STALE" });
  cert("p1", { status: "PENDING_APPROVAL" });
  cert("d1", { status: "DRAFT" });
  cert("del", { status: "ISSUED", deletedAt: new Date("2026-07-01T00:00:00.000Z") }); // excluded
  // a foreign-org row that must not count
  seed(h.db, "certificate", { id: "foreign", organizationId: OTHER, status: "ISSUED", deletedAt: null });

  seed(h.db, "certificateExport", { id: "x1", organizationId: ORG, certificateId: "i1", exportType: "PDF", status: "READY", createdAt: NOW });
  seed(h.db, "certificateExport", { id: "x2", organizationId: ORG, certificateId: "i1", exportType: "PDF", status: "FAILED", createdAt: NOW });
  seed(h.db, "certificateExport", { id: "x3", organizationId: ORG, certificateId: "i1", exportType: "PDF", status: "PENDING", createdAt: NOW });

  seed(h.db, "certificateRequest", { id: "q1", organizationId: ORG, status: "PENDING", deletedAt: null });
  seed(h.db, "certificateRequest", { id: "q2", organizationId: ORG, status: "APPROVED", deletedAt: null });
  seed(h.db, "certificateRequest", { id: "q3", organizationId: ORG, status: "FULFILLED", deletedAt: null });
  seed(h.db, "certificateRequest", { id: "q4", organizationId: ORG, status: "PENDING", deletedAt: new Date("2026-07-01T00:00:00.000Z") }); // excluded

  seed(h.db, "certificateVerification", { id: "v-ok", organizationId: ORG, certificateId: "i1", publicStatus: "VALID", verificationCode: "vc-1", expiresAt: null });
  seed(h.db, "certificateVerification", { id: "v-bad", organizationId: ORG, certificateId: "r1", publicStatus: "VALID", verificationCode: "vc-2", expiresAt: null }); // REVOKED→VALID mismatch
}

describe("getHealth KPIs", () => {
  it("counts certificate statuses (excluding soft-deleted + foreign org)", async () => {
    seedWorld();
    const kpi = await service.getHealth(ctx(), NOW);
    expect(kpi).toMatchObject({
      totalCertificates: 7,
      issued: 2,
      revoked: 1,
      suspended: 1,
      stale: 1,
      pendingApproval: 1,
      draft: 1,
    });
  });

  it("counts exports (ready/failed), requests (pending/approved/fulfilled), verifications + mismatches", async () => {
    seedWorld();
    const kpi = await service.getHealth(ctx(), NOW);
    expect(kpi).toMatchObject({
      exportsReady: 1,
      exportsFailed: 1,
      requestsPending: 1,
      requestsApproved: 1,
      requestsFulfilled: 1,
      verificationRows: 2,
      verificationMismatches: 1,
    });
    expect(kpi.generatedAt).toEqual(NOW);
  });

  it("requires certificates.view", async () => {
    await expect(service.getHealth(ctx([]), NOW)).rejects.toBeInstanceOf(AuthorizationError);
  });
});
