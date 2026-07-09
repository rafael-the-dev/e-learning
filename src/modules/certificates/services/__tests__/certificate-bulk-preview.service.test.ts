import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeFakeDb, seed, type FakeDb } from "../../repositories/__tests__/_fake-db";

// =============================================================================
// BulkCertificateOperationPreviewService — Phase 13 tests
// -----------------------------------------------------------------------------
// Real certificate repository reads over the fake DB. Asserts canIssue (status-based)
// and canGenerate (shallow duplicate check), org scoping, no mutation, and authz.
// =============================================================================

const h = vi.hoisted(() => ({ db: null as unknown as FakeDb }));
vi.mock("@/server/db", () => ({ getDb: vi.fn(async () => h.db) }));

import { AuthorizationError } from "@/shared/lib/command";
import { PERMISSIONS } from "@/server/auth/permissions";
import type { AuthContext } from "@/server/auth/context";
import { BulkCertificateOperationPreviewService } from "../certificate-bulk-preview.service";

const ORG = "org-A";
const OTHER_ORG = "org-B";

function ctx(perms: string[] = [PERMISSIONS.CERTIFICATES_VIEW], org = ORG): AuthContext {
  const set = new Set(perms);
  return { userId: "u-1", organizationId: org, roles: [], ability: { can: (p: string) => set.has(p) } } as unknown as AuthContext;
}

function seedCert(id: string, o: Record<string, unknown> = {}): void {
  seed(h.db, "certificate", {
    id, organizationId: ORG, studentId: "stu-1", transcriptVersionId: "ver-1",
    certificateType: "COURSE_COMPLETION", status: "ISSUED", deletedAt: null, ...o,
  });
}

const service = new BulkCertificateOperationPreviewService();

beforeEach(() => {
  vi.clearAllMocks();
  h.db = makeFakeDb();
});
afterEach(() => vi.restoreAllMocks());

describe("previewIssue", () => {
  it("reports canIssue by status; missing id → NOT_FOUND; no mutation", async () => {
    seedCert("draft", { status: "DRAFT" });
    seedCert("issued", { status: "ISSUED" });
    const res = await service.previewIssue(ctx(), ["draft", "issued", "ghost"]);
    expect(res).toEqual([
      { certificateId: "draft", found: true, currentStatus: "DRAFT", canIssue: true },
      { certificateId: "issued", found: true, currentStatus: "ISSUED", canIssue: false, reason: "NOT_ISSUABLE_FROM_ISSUED" },
      { certificateId: "ghost", found: false, currentStatus: null, canIssue: false, reason: "NOT_FOUND" },
    ]);
    // nothing changed
    expect((h.db.certificate.__store.find((r) => r.id === "draft") as Record<string, unknown>).status).toBe("DRAFT");
  });

  it("is organization scoped (a foreign-org cert reads as NOT_FOUND)", async () => {
    seedCert("mine", { status: "DRAFT" });
    const res = await service.previewIssue(ctx([PERMISSIONS.CERTIFICATES_VIEW], OTHER_ORG), ["mine"]);
    expect(res[0]).toMatchObject({ found: false, canIssue: false });
  });

  it("requires certificates.view", async () => {
    await expect(service.previewIssue(ctx([]), ["x"])).rejects.toBeInstanceOf(AuthorizationError);
  });
});

describe("previewGenerate", () => {
  it("canGenerate is false when an active certificate already exists for (version, type)", async () => {
    seedCert("active", { status: "ISSUED", transcriptVersionId: "ver-1", certificateType: "COURSE_COMPLETION" });
    const res = await service.previewGenerate(ctx(), [
      { transcriptVersionId: "ver-1", certificateType: "COURSE_COMPLETION" },
      { transcriptVersionId: "ver-2", certificateType: "COURSE_COMPLETION" },
    ]);
    expect(res[0]).toMatchObject({ canGenerate: false, reason: "CERTIFICATE_ALREADY_ACTIVE" });
    expect(res[1]).toMatchObject({ canGenerate: true });
  });

  it("a REVOKED/STALE certificate does not block generation", async () => {
    seedCert("stale", { status: "STALE", transcriptVersionId: "ver-1", certificateType: "COURSE_COMPLETION" });
    const res = await service.previewGenerate(ctx(), [{ transcriptVersionId: "ver-1", certificateType: "COURSE_COMPLETION" }]);
    expect(res[0].canGenerate).toBe(true);
  });

  it("performs ONE batched read regardless of item count (no N+1)", async () => {
    const findMany = vi.spyOn(h.db.certificate, "findMany");
    await service.previewGenerate(ctx(), [
      { transcriptVersionId: "ver-1", certificateType: "COURSE_COMPLETION" },
      { transcriptVersionId: "ver-2", certificateType: "COURSE_COMPLETION" },
      { transcriptVersionId: "ver-3", certificateType: "DIPLOMA" },
    ]);
    expect(findMany).toHaveBeenCalledTimes(1);
  });

  it("requires certificates.view", async () => {
    await expect(
      service.previewGenerate(ctx([]), [{ transcriptVersionId: "ver-1", certificateType: "COURSE_COMPLETION" }])
    ).rejects.toBeInstanceOf(AuthorizationError);
  });
});
