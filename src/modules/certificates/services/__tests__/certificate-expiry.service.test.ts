import { describe, expect, it } from "vitest";
import { asClient, makeFakeDb, seed, type FakeDb } from "../../repositories/__tests__/_fake-db";
import { certificateExpiryService } from "../certificate-expiry.service";

// =============================================================================
// CertificateExpiryService — behavioural tests (Phase 7)
// -----------------------------------------------------------------------------
// Drives the projection-only expiry sweep against the fake DB with real repos.
// Asserts: VALID → EXPIRED only for ISSUED certificates past expiry; Certificate
// .status is NEVER mutated; SUSPENDED/REVOKED projections are left alone; and the
// sweep is idempotent.
// =============================================================================

const ORG = "org-A";
const NOW = new Date("2026-07-08T00:00:00.000Z");
const PAST = new Date("2020-01-01T00:00:00.000Z");
const FUTURE = new Date("2030-01-01T00:00:00.000Z");

function seedPair(
  db: FakeDb,
  opts: { id: string; certStatus?: string; publicStatus?: string; expiresAt: Date | null; deletedAt?: Date | null }
): void {
  seed(db, "certificate", {
    id: opts.id,
    organizationId: ORG,
    status: opts.certStatus ?? "ISSUED",
    certificateNumber: `CERT-${opts.id}`,
    expiresAt: opts.expiresAt,
    deletedAt: opts.deletedAt ?? null,
  });
  seed(db, "certificateVerification", {
    id: `v-${opts.id}`,
    organizationId: ORG,
    certificateId: opts.id,
    verificationCode: `vc-${opts.id}`,
    publicStatus: opts.publicStatus ?? "VALID",
    verificationCount: 0,
    expiresAt: opts.expiresAt,
  });
}

const verif = (db: FakeDb, id: string) =>
  db.certificateVerification.__store.find((r) => r.id === `v-${id}`) as Record<string, unknown>;
const cert = (db: FakeDb, id: string) =>
  db.certificate.__store.find((r) => r.id === id) as Record<string, unknown>;

describe("CertificateExpiryService", () => {
  it("1. ISSUED + VALID + expiresAt past → EXPIRED", async () => {
    const db = makeFakeDb();
    seedPair(db, { id: "c1", expiresAt: PAST });
    const r = await certificateExpiryService.run({ organizationId: ORG, now: NOW }, asClient(db));
    expect(r.expiredCount).toBe(1);
    expect(verif(db, "c1").publicStatus).toBe("EXPIRED");
  });

  it("2. ISSUED + VALID + expiresAt future → unchanged", async () => {
    const db = makeFakeDb();
    seedPair(db, { id: "c1", expiresAt: FUTURE });
    const r = await certificateExpiryService.run({ organizationId: ORG, now: NOW }, asClient(db));
    expect(r.expiredCount).toBe(0);
    expect(verif(db, "c1").publicStatus).toBe("VALID");
  });

  it("2b. null expiresAt (perpetual) → never expires", async () => {
    const db = makeFakeDb();
    seedPair(db, { id: "c1", expiresAt: null });
    const r = await certificateExpiryService.run({ organizationId: ORG, now: NOW }, asClient(db));
    expect(r.expiredCount).toBe(0);
    expect(verif(db, "c1").publicStatus).toBe("VALID");
  });

  it("3. SUSPENDED certificate with a still-VALID projection is NOT expired", async () => {
    const db = makeFakeDb();
    seedPair(db, { id: "c1", certStatus: "SUSPENDED", publicStatus: "VALID", expiresAt: PAST });
    const r = await certificateExpiryService.run({ organizationId: ORG, now: NOW }, asClient(db));
    expect(r.expiredCount).toBe(0);
    expect(verif(db, "c1").publicStatus).toBe("VALID");
  });

  it("4. REVOKED certificate is not touched (projection already REVOKED)", async () => {
    const db = makeFakeDb();
    seedPair(db, { id: "c1", certStatus: "REVOKED", publicStatus: "REVOKED", expiresAt: PAST });
    const r = await certificateExpiryService.run({ organizationId: ORG, now: NOW }, asClient(db));
    expect(r.expiredCount).toBe(0);
    expect(verif(db, "c1").publicStatus).toBe("REVOKED");
  });

  it("5. Certificate.status remains ISSUED after expiry", async () => {
    const db = makeFakeDb();
    seedPair(db, { id: "c1", expiresAt: PAST });
    await certificateExpiryService.run({ organizationId: ORG, now: NOW }, asClient(db));
    expect(cert(db, "c1").status).toBe("ISSUED");
  });

  it("6. idempotent — a second run changes nothing", async () => {
    const db = makeFakeDb();
    seedPair(db, { id: "c1", expiresAt: PAST });
    const first = await certificateExpiryService.run({ organizationId: ORG, now: NOW }, asClient(db));
    const second = await certificateExpiryService.run({ organizationId: ORG, now: NOW }, asClient(db));
    expect(first.expiredCount).toBe(1);
    expect(second.expiredCount).toBe(0);
    expect(verif(db, "c1").publicStatus).toBe("EXPIRED");
  });

  it("soft-deleted certificate is not expired", async () => {
    const db = makeFakeDb();
    seedPair(db, { id: "c1", expiresAt: PAST, deletedAt: new Date("2026-01-01T00:00:00.000Z") });
    const r = await certificateExpiryService.run({ organizationId: ORG, now: NOW }, asClient(db));
    expect(r.expiredCount).toBe(0);
    expect(verif(db, "c1").publicStatus).toBe("VALID");
  });

  it("tenant-scoped: another org's expired certificates are not swept", async () => {
    const db = makeFakeDb();
    seed(db, "certificate", { id: "c1", organizationId: "org-B", status: "ISSUED", expiresAt: PAST, deletedAt: null });
    seed(db, "certificateVerification", { id: "v-c1", organizationId: "org-B", certificateId: "c1", verificationCode: "vc-c1", publicStatus: "VALID", verificationCount: 0, expiresAt: PAST });
    const r = await certificateExpiryService.run({ organizationId: ORG, now: NOW }, asClient(db));
    expect(r.expiredCount).toBe(0);
    expect(verif(db, "c1").publicStatus).toBe("VALID");
  });
});
