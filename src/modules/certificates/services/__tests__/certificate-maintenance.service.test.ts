import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeFakeDb, seed, type FakeDb } from "../../repositories/__tests__/_fake-db";

// =============================================================================
// CertificateMaintenanceService — Phase 14 tests
// -----------------------------------------------------------------------------
// Real certificate repositories over the fake DB. Asserts orphan / stuck / failed
// export detection + verification duplicate & projection-mismatch probes, org
// scoping, read-only (no mutation), and authz. No Academic read.
// =============================================================================

const h = vi.hoisted(() => ({ db: null as unknown as FakeDb }));
vi.mock("@/server/db", () => ({ getDb: vi.fn(async () => h.db) }));

import { AuthorizationError } from "@/shared/lib/command";
import { PERMISSIONS } from "@/server/auth/permissions";
import type { AuthContext } from "@/server/auth/context";
import { CertificateMaintenanceService } from "../certificate-maintenance.service";

const ORG = "org-A";
const OTHER = "org-B";
const NOW = new Date("2026-07-09T10:00:00.000Z");

function ctx(perms: string[] = [PERMISSIONS.CERTIFICATES_VIEW], org = ORG): AuthContext {
  const set = new Set(perms);
  return { userId: "u-1", organizationId: org, roles: [], ability: { can: (p: string) => set.has(p) } } as unknown as AuthContext;
}

function cert(id: string, o: Record<string, unknown> = {}): void {
  seed(h.db, "certificate", { id, organizationId: ORG, status: "ISSUED", deletedAt: null, ...o });
}
function exp(id: string, o: Record<string, unknown>): void {
  seed(h.db, "certificateExport", { id, organizationId: ORG, exportType: "PDF", status: "READY", createdAt: NOW, ...o });
}
function verif(id: string, o: Record<string, unknown>): void {
  seed(h.db, "certificateVerification", { id, organizationId: ORG, publicStatus: "VALID", expiresAt: null, ...o });
}

const service = new CertificateMaintenanceService();

beforeEach(() => {
  vi.clearAllMocks();
  h.db = makeFakeDb();
});
afterEach(() => vi.restoreAllMocks());

describe("export anomaly detection", () => {
  beforeEach(() => {
    cert("c-issued", { status: "ISSUED" });
    cert("c-deleted", { status: "ISSUED", deletedAt: new Date("2026-07-01T00:00:00.000Z") });
    exp("x-ok", { certificateId: "c-issued", status: "READY" });
    exp("x-orphan-deleted", { certificateId: "c-deleted", status: "READY" });
    exp("x-orphan-missing", { certificateId: "ghost", status: "READY" });
    exp("x-stuck", { certificateId: "c-issued", status: "PENDING", createdAt: new Date("2026-07-09T08:00:00.000Z") });
    exp("x-recent", { certificateId: "c-issued", status: "PENDING", createdAt: new Date("2026-07-09T09:50:00.000Z") });
    exp("x-failed", { certificateId: "c-issued", status: "FAILED" });
  });

  it("detects orphaned exports (missing or soft-deleted certificate)", async () => {
    const report = await service.getReport(ctx(), NOW);
    expect(report.orphanExports.map((o) => o.exportId).sort()).toEqual(["x-orphan-deleted", "x-orphan-missing"]);
  });

  it("detects stuck PENDING exports older than the threshold (and not recent ones)", async () => {
    const report = await service.getReport(ctx(), NOW, 60);
    expect(report.stuckPendingExports.map((s) => s.exportId)).toEqual(["x-stuck"]);
    expect(report.stuckPendingExports[0].ageMinutes).toBe(120);
    expect(report.stuckThresholdMinutes).toBe(60);
  });

  it("detects failed exports", async () => {
    const report = await service.getReport(ctx(), NOW);
    expect(report.failedExports.map((f) => f.exportId)).toEqual(["x-failed"]);
  });

  it("does not mutate any row (read-only)", async () => {
    await service.getReport(ctx(), NOW);
    const stuck = h.db.certificateExport.__store.find((r) => r.id === "x-stuck") as Record<string, unknown>;
    expect(stuck.status).toBe("PENDING");
  });
});

describe("verification integrity detection", () => {
  it("detects duplicate verification rows (by code and by certificateId)", async () => {
    cert("c-issued", { status: "ISSUED" });
    verif("v-ok", { certificateId: "c-issued", publicStatus: "VALID", verificationCode: "vc-1" });
    verif("v-dup-a", { certificateId: "c-dup", publicStatus: "VALID", verificationCode: "vc-dup" });
    verif("v-dup-b", { certificateId: "c-dup", publicStatus: "VALID", verificationCode: "vc-dup" });

    const report = await service.getReport(ctx(), NOW);
    const codeGroup = report.duplicateVerifications.find((g) => g.field === "verificationCode");
    const certGroup = report.duplicateVerifications.find((g) => g.field === "certificateId");
    // The duplicate is still REPORTED (field/count/ids), but the key is REDACTED —
    // the raw verification code must never appear (§10).
    expect(codeGroup).toMatchObject({ key: "[REDACTED]", field: "verificationCode", count: 2 });
    expect(codeGroup?.key).not.toBe("vc-dup");
    expect(codeGroup?.verificationIds.sort()).toEqual(["v-dup-a", "v-dup-b"]);
    // A certificateId key is an internal id (not sensitive) and stays as-is.
    expect(certGroup).toMatchObject({ key: "c-dup", field: "certificateId", count: 2 });
    // The serialized report never leaks the raw verification code anywhere.
    expect(JSON.stringify(report)).not.toContain("vc-dup");
  });

  it("detects a projection mismatch (REVOKED certificate but publicStatus VALID)", async () => {
    cert("c-revoked", { status: "REVOKED" });
    cert("c-issued", { status: "ISSUED" });
    verif("v-bad", { certificateId: "c-revoked", publicStatus: "VALID", verificationCode: "vc-2" });
    verif("v-good", { certificateId: "c-issued", publicStatus: "VALID", verificationCode: "vc-3" });

    const report = await service.getReport(ctx(), NOW);
    expect(report.verificationProjectionMismatches).toHaveLength(1);
    expect(report.verificationProjectionMismatches[0]).toMatchObject({
      verificationId: "v-bad",
      certificateStatus: "REVOKED",
      publicStatus: "VALID",
      expectedPublicStatus: ["REVOKED"],
    });
  });

  it("ISSUED→VALID and SUSPENDED→SUSPENDED are NOT mismatches; orphaned verifications are skipped", async () => {
    cert("c-issued", { status: "ISSUED" });
    cert("c-suspended", { status: "SUSPENDED" });
    verif("v1", { certificateId: "c-issued", publicStatus: "VALID", verificationCode: "vc-a" });
    verif("v2", { certificateId: "c-suspended", publicStatus: "SUSPENDED", verificationCode: "vc-b" });
    verif("v3", { certificateId: "missing-cert", publicStatus: "VALID", verificationCode: "vc-c" });

    const report = await service.getReport(ctx(), NOW);
    expect(report.verificationProjectionMismatches).toHaveLength(0);
  });
});

describe("scoping + authz", () => {
  it("is organization scoped (foreign-org rows are not reported)", async () => {
    seed(h.db, "certificateExport", { id: "x-foreign", organizationId: OTHER, certificateId: "ghost", exportType: "PDF", status: "FAILED", createdAt: NOW });
    const report = await service.getReport(ctx(), NOW);
    expect(report.failedExports).toHaveLength(0);
    expect(report.orphanExports).toHaveLength(0);
  });

  it("requires certificates.view", async () => {
    await expect(service.getReport(ctx([]), NOW)).rejects.toBeInstanceOf(AuthorizationError);
  });
});
