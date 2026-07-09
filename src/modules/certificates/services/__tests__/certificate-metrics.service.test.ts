import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeFakeDb, seed, type FakeDb } from "../../repositories/__tests__/_fake-db";

// =============================================================================
// CertificateMetricsService — Phase 14 tests
// -----------------------------------------------------------------------------
// Windowed action counts (today / 7d / 30d) sourced from existing tables only.
// Verifies bucketing boundaries, event-type routing, the 30-day cutoff, and authz.
// =============================================================================

const h = vi.hoisted(() => ({ db: null as unknown as FakeDb }));
vi.mock("@/server/db", () => ({ getDb: vi.fn(async () => h.db) }));

import { AuthorizationError } from "@/shared/lib/command";
import { PERMISSIONS } from "@/server/auth/permissions";
import type { AuthContext } from "@/server/auth/context";
import { CertificateMetricsService } from "../certificate-metrics.service";

const ORG = "org-A";
const NOW = new Date("2026-07-09T10:00:00.000Z");
const TODAY = new Date("2026-07-09T09:00:00.000Z");
const D3 = new Date("2026-07-06T00:00:00.000Z");
const D20 = new Date("2026-06-19T00:00:00.000Z");
const D40 = new Date("2026-05-30T00:00:00.000Z");

function ctx(perms: string[] = [PERMISSIONS.CERTIFICATES_VIEW]): AuthContext {
  const set = new Set(perms);
  return { userId: "u-1", organizationId: ORG, roles: [], ability: { can: (p: string) => set.has(p) } } as unknown as AuthContext;
}

const service = new CertificateMetricsService();

beforeEach(() => {
  vi.clearAllMocks();
  h.db = makeFakeDb();
});
afterEach(() => vi.restoreAllMocks());

function seedWorld(): void {
  const c = (id: string, createdAt: Date, o: Record<string, unknown> = {}) =>
    seed(h.db, "certificate", { id, organizationId: ORG, status: "ISSUED", deletedAt: null, createdAt, ...o });
  c("g-today", TODAY);
  c("g-3d", D3);
  c("g-20d", D20);
  c("g-40d", D40); // outside 30d → never fetched

  const ev = (id: string, eventType: string, createdAt: Date) =>
    seed(h.db, "certificateEvent", { id, organizationId: ORG, certificateId: "x", eventType, createdAt });
  ev("e-issue", "certificate.issued", TODAY);
  ev("e-revoke", "certificate.revoked", D3);
  ev("e-suspend", "certificate.suspended", D20);
  ev("e-restore", "certificate.restored", TODAY);
  ev("e-exported", "certificate.exported", TODAY); // must NOT count toward lifecycle metrics

  const x = (id: string, createdAt: Date) =>
    seed(h.db, "certificateExport", { id, organizationId: ORG, certificateId: "x", exportType: "PDF", status: "READY", createdAt });
  x("x-today", TODAY);
  x("x-20d", D20);

  const v = (id: string, lastVerifiedAt: Date | null) =>
    seed(h.db, "certificateVerification", { id, organizationId: ORG, certificateId: id, verificationCode: id, publicStatus: "VALID", lastVerifiedAt });
  v("v-today", TODAY);
  v("v-3d", D3);
  v("v-null", null); // never verified → excluded

  const q = (id: string, createdAt: Date, o: Record<string, unknown> = {}) =>
    seed(h.db, "certificateRequest", { id, organizationId: ORG, status: "PENDING", deletedAt: null, createdAt, ...o });
  q("q-today", TODAY);
  q("q-20d", D20);
  q("q-del", TODAY, { deletedAt: new Date("2026-07-01T00:00:00.000Z") }); // excluded
}

describe("getMetrics windows", () => {
  it("buckets generate by today / 7d / 30d (40-day-old row excluded)", async () => {
    seedWorld();
    const m = await service.getMetrics(ctx(), NOW);
    expect(m.today.generate).toBe(1);
    expect(m.last7Days.generate).toBe(2);
    expect(m.last30Days.generate).toBe(3);
  });

  it("routes lifecycle events by type and ignores non-lifecycle events", async () => {
    seedWorld();
    const m = await service.getMetrics(ctx(), NOW);
    expect(m.last30Days).toMatchObject({ issue: 1, revoke: 1, suspend: 1, restore: 1 });
    expect(m.today).toMatchObject({ issue: 1, revoke: 0, suspend: 0, restore: 1 });
    expect(m.last7Days).toMatchObject({ issue: 1, revoke: 1, suspend: 0, restore: 1 });
  });

  it("counts export / verification / request per window (null lastVerifiedAt + soft-deleted excluded)", async () => {
    seedWorld();
    const m = await service.getMetrics(ctx(), NOW);
    expect(m.today).toMatchObject({ export: 1, verification: 1, request: 1 });
    expect(m.last7Days).toMatchObject({ export: 1, verification: 2, request: 1 });
    expect(m.last30Days).toMatchObject({ export: 2, verification: 2, request: 2 });
    expect(m.generatedAt).toEqual(NOW);
  });

  it("requires certificates.view", async () => {
    await expect(service.getMetrics(ctx([]), NOW)).rejects.toBeInstanceOf(AuthorizationError);
  });
});
