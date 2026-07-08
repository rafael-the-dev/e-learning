import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeFakeDb, seed, asClient, type FakeDb } from "../../repositories/__tests__/_fake-db";

// =============================================================================
// ReconcileCertificateStalenessCommand — Phase 9 tests (14–21) + repository
// methods (22–24) + architecture guards (25–30)
// -----------------------------------------------------------------------------
// Real repositories + the shared applier run against the rollback-capable fake DB;
// the event publisher and RBAC are mocked. Asserts dry-run planning, apply-mode
// transitions, idempotency, per-certificate partial-failure isolation, authorization,
// tenant isolation, and that NO regeneration/export happens.
// =============================================================================

const h = vi.hoisted(() => ({ db: null as unknown as FakeDb }));
const authState = vi.hoisted(() => ({ allow: true, checked: [] as string[] }));
const published = vi.hoisted(() => ({ events: [] as Array<Record<string, unknown>> }));

vi.mock("@/server/db", () => ({ getDb: vi.fn(async () => h.db) }));
vi.mock("@/server/auth/rbac", () => ({
  getUserPermissions: vi.fn(async () => new Set<string>()),
  createAbility: () => ({
    can: (perm: string) => {
      authState.checked.push(perm);
      return authState.allow;
    },
  }),
}));
vi.mock("@/server/events/event-publisher", () => ({
  eventPublisher: { publish: vi.fn(async (e: Record<string, unknown>) => void published.events.push(e)) },
}));

import { AuthorizationError, NotFoundError } from "@/shared/lib/command";
import type { ServiceContext } from "@/shared/types/common";
import { ReconcileCertificateStalenessCommand } from "../reconcile-certificate-staleness.command";
import {
  markCertificateStale,
  setCertificateStaleMetadata,
} from "../../repositories/certificate.repository";
import { updatePublicStatusByCertificateId } from "../../repositories/certificate-verification.repository";

const ORG = "org-A";
const OTHER_ORG = "org-B";
const ctx: ServiceContext = { userId: "u-1", organizationId: ORG };
const store = (name: string) => h.db[name].__store;
const certById = (id: string) => store("certificate").find((c) => c.id === id) as Record<string, unknown>;
const verifByCert = (id: string) =>
  store("certificateVerification").find((v) => v.certificateId === id) as Record<string, unknown>;

function seedCert(id: string, overrides: Record<string, unknown> = {}): void {
  seed(h.db, "certificate", {
    id,
    organizationId: ORG,
    studentId: "stu-1",
    enrollmentId: "enr-1",
    courseId: "course-1",
    transcriptVersionId: "ver-1",
    transcriptNumber: "TR-2026-000001",
    transcriptChecksum: "chk-1",
    certificatePolicyId: "pol-1",
    certificateTemplateId: null,
    certificateNumber: "CERT-2026-000001",
    certificateType: "COURSE_COMPLETION",
    status: "ISSUED",
    studentSnapshot: "{}",
    courseSnapshot: null,
    issueBasisSnapshot: "{}",
    financialClearanceStatus: "NOT_REQUIRED",
    financialClearanceCheckedAt: null,
    financialClearanceReference: null,
    verificationCode: `vc-${id}`,
    verificationUrl: null,
    checksum: "sum-1",
    issuedAt: new Date("2026-07-05T00:00:00.000Z"),
    issuedBy: "u-0",
    revokedAt: null,
    revokedBy: null,
    revokeReason: null,
    suspendedAt: null,
    suspendedBy: null,
    suspendReason: null,
    staleDetectedAt: null,
    staleReason: null,
    expiresAt: null,
    deletedAt: null,
    ...overrides,
  });
}

function seedVerification(certId: string, overrides: Record<string, unknown> = {}): void {
  seed(h.db, "certificateVerification", {
    id: `vrow-${certId}`,
    organizationId: ORG,
    certificateId: certId,
    verificationCode: `vc-${certId}`,
    publicStatus: "VALID",
    verificationCount: 0,
    lastVerifiedAt: null,
    expiresAt: null,
    ...overrides,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  h.db = makeFakeDb();
  authState.allow = true;
  authState.checked.length = 0;
  published.events.length = 0;
});
afterEach(() => vi.restoreAllMocks());

// ─── Command (14–21) ─────────────────────────────────────────────────────────

describe("ReconcileCertificateStalenessCommand", () => {
  it("14. dryRun by certificate returns the planned change without writing", async () => {
    seedCert("cert-1"); seedVerification("cert-1");
    const res = await new ReconcileCertificateStalenessCommand(
      { certificateId: "cert-1", reason: "TRANSCRIPT_SUPERSEDED" },
      ctx
    ).run();

    expect(res.dryRun).toBe(true);
    expect(res.processed).toBe(1);
    expect(res.changed).toBe(1);
    expect(res.items[0]).toMatchObject({ certificateId: "cert-1", action: "stale", changed: true, newStatus: "STALE" });
    // Nothing written.
    expect(certById("cert-1").status).toBe("ISSUED");
    expect(store("certificateEvent")).toHaveLength(0);
    expect(store("auditLog")).toHaveLength(0);
    expect(published.events).toHaveLength(0);
  });

  it("15. dryRun by transcriptVersion returns a plan per linked certificate", async () => {
    seedCert("cert-1", { status: "ISSUED" }); seedVerification("cert-1");
    seedCert("cert-2", { status: "SUSPENDED", verificationCode: "vc-cert-2" }); seedVerification("cert-2", { publicStatus: "SUSPENDED" });
    seedCert("cert-3", { status: "REVOKED", verificationCode: "vc-cert-3" }); seedVerification("cert-3", { publicStatus: "REVOKED" });

    const res = await new ReconcileCertificateStalenessCommand(
      { transcriptVersionId: "ver-1", reason: "TRANSCRIPT_REVOKED", dryRun: true },
      ctx
    ).run();

    expect(res.processed).toBe(2); // REVOKED excluded by the status filter
    expect(res.changed).toBe(2);
    expect(certById("cert-1").status).toBe("ISSUED");
    expect(certById("cert-2").status).toBe("SUSPENDED");
  });

  it("16. apply marks one ISSUED certificate STALE with the full projection + event/audit", async () => {
    seedCert("cert-1"); seedVerification("cert-1");
    const res = await new ReconcileCertificateStalenessCommand(
      { certificateId: "cert-1", reason: "TRANSCRIPT_SUPERSEDED", dryRun: false },
      ctx
    ).run();

    expect(res.dryRun).toBe(false);
    expect(res.changed).toBe(1);
    expect(certById("cert-1").status).toBe("STALE");
    expect(certById("cert-1").staleReason).toBe("TRANSCRIPT_SUPERSEDED");
    expect(certById("cert-1").staleDetectedAt).toBeInstanceOf(Date);
    expect(verifByCert("cert-1").publicStatus).toBe("SUSPENDED");

    const events = store("certificateEvent").filter((e) => e.eventType === "certificate.marked_stale");
    expect(events).toHaveLength(1);
    expect(events[0].actorId).toBe("u-1");
    const audits = store("auditLog").filter((a) => a.action === "certificate.marked_stale");
    expect(audits).toHaveLength(1);
    expect(published.events.filter((e) => e.eventType === "certificate.marked_stale")).toHaveLength(1);
  });

  it("17. apply is idempotent — a second run changes nothing", async () => {
    seedCert("cert-1"); seedVerification("cert-1");
    const first = await new ReconcileCertificateStalenessCommand(
      { certificateId: "cert-1", reason: "TRANSCRIPT_SUPERSEDED", dryRun: false },
      ctx
    ).run();
    expect(first.changed).toBe(1);

    const second = await new ReconcileCertificateStalenessCommand(
      { certificateId: "cert-1", reason: "TRANSCRIPT_SUPERSEDED", dryRun: false },
      ctx
    ).run();
    expect(second.changed).toBe(0);
    expect(second.skipped).toBe(1);
    expect(second.items[0].skipReason).toBe("ALREADY_STALE");
    // No duplicate event / audit / domain event.
    expect(store("certificateEvent").filter((e) => e.eventType === "certificate.marked_stale")).toHaveLength(1);
    expect(store("auditLog").filter((a) => a.action === "certificate.marked_stale")).toHaveLength(1);
    expect(published.events.filter((e) => e.eventType === "certificate.marked_stale")).toHaveLength(1);
  });

  it("18. a per-certificate failure is isolated and counted (failed), others still apply", async () => {
    seedCert("cert-ok"); seedVerification("cert-ok");
    seedCert("cert-bad", { verificationCode: "vc-cert-bad" }); // no verification row → projection update count 0 → throws

    const res = await new ReconcileCertificateStalenessCommand(
      { transcriptVersionId: "ver-1", reason: "TRANSCRIPT_SUPERSEDED", dryRun: false },
      ctx
    ).run();

    expect(res.processed).toBe(2);
    expect(res.changed).toBe(1);
    expect(res.failed).toBe(1);
    expect(certById("cert-ok").status).toBe("STALE");
    // The failed certificate rolled back — still ISSUED, no orphan event/audit.
    expect(certById("cert-bad").status).toBe("ISSUED");
    expect(store("certificateEvent").filter((e) => e.certificateId === "cert-bad")).toHaveLength(0);
    expect(store("auditLog").filter((a) => a.entityId === "cert-bad")).toHaveLength(0);
    expect(published.events.filter((e) => (e.payload as Record<string, unknown>)?.certificateId === "cert-bad")).toHaveLength(0);
  });

  it("19. authorization is required (certificates.suspend)", async () => {
    seedCert("cert-1"); seedVerification("cert-1");
    authState.allow = false;
    await expect(
      new ReconcileCertificateStalenessCommand({ certificateId: "cert-1", dryRun: false }, ctx).run()
    ).rejects.toBeInstanceOf(AuthorizationError);
    expect(authState.checked).toContain("certificates.suspend");
    expect(certById("cert-1").status).toBe("ISSUED");
  });

  it("20. a cross-tenant certificate is NOT_FOUND", async () => {
    seedCert("cert-1"); seedVerification("cert-1");
    const otherCtx: ServiceContext = { userId: "u-2", organizationId: OTHER_ORG };
    await expect(
      new ReconcileCertificateStalenessCommand({ certificateId: "cert-1", dryRun: false }, otherCtx).run()
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("21. no regeneration / re-issue / export — number & checksum untouched, no export row", async () => {
    seedCert("cert-1", { certificateNumber: "CERT-2026-000042", checksum: "frozen-sum" });
    seedVerification("cert-1");
    await new ReconcileCertificateStalenessCommand(
      { certificateId: "cert-1", reason: "TRANSCRIPT_REVOKED", dryRun: false },
      ctx
    ).run();
    expect(certById("cert-1").certificateNumber).toBe("CERT-2026-000042");
    expect(certById("cert-1").checksum).toBe("frozen-sum");
    expect(store("certificateExport")).toHaveLength(0);
  });
});

// ─── Repository methods (22–24) ────────────────────────────────────────────────

describe("Phase 9 repository methods", () => {
  it("22. markCertificateStale flips an ISSUED certificate (count 1)", async () => {
    const db = makeFakeDb();
    seed(db, "certificate", { id: "c1", organizationId: ORG, status: "ISSUED", staleReason: null, deletedAt: null });
    const res = await markCertificateStale(
      { id: "c1", organizationId: ORG, staleReason: "TRANSCRIPT_SUPERSEDED", staleDetectedAt: new Date("2026-07-08T00:00:00.000Z") },
      asClient(db)
    );
    expect(res.count).toBe(1);
    expect((db.certificate.__store[0] as Record<string, unknown>).status).toBe("STALE");
  });

  it("23. markCertificateStale is a no-op for a non-ISSUED certificate (count 0)", async () => {
    const db = makeFakeDb();
    for (const status of ["SUSPENDED", "REVOKED", "STALE", "DRAFT", "PENDING_APPROVAL"]) {
      seed(db, "certificate", { id: `c-${status}`, organizationId: ORG, status, deletedAt: null });
      const res = await markCertificateStale(
        { id: `c-${status}`, organizationId: ORG, staleReason: "TRANSCRIPT_SUPERSEDED" },
        asClient(db)
      );
      expect(res.count, `status ${status}`).toBe(0);
    }
  });

  it("23b. setCertificateStaleMetadata updates ISSUED/SUSPENDED/STALE only, never REVOKED/DRAFT", async () => {
    const db = makeFakeDb();
    for (const status of ["ISSUED", "SUSPENDED", "STALE"]) {
      seed(db, "certificate", { id: `c-${status}`, organizationId: ORG, status, deletedAt: null });
      expect((await setCertificateStaleMetadata({ id: `c-${status}`, organizationId: ORG, staleReason: "TRANSCRIPT_REVOKED" }, asClient(db))).count).toBe(1);
      // status column untouched.
      expect((db.certificate.__store.find((r) => r.id === `c-${status}`) as Record<string, unknown>).status).toBe(status);
    }
    for (const status of ["REVOKED", "DRAFT", "PENDING_APPROVAL"]) {
      seed(db, "certificate", { id: `c-${status}`, organizationId: ORG, status, deletedAt: null });
      expect((await setCertificateStaleMetadata({ id: `c-${status}`, organizationId: ORG, staleReason: "TRANSCRIPT_REVOKED" }, asClient(db))).count).toBe(0);
    }
  });

  it("24. updatePublicStatusByCertificateId is organization scoped", async () => {
    const db = makeFakeDb();
    seed(db, "certificateVerification", { id: "v1", organizationId: ORG, certificateId: "cert-1", publicStatus: "VALID" });
    seed(db, "certificateVerification", { id: "v2", organizationId: OTHER_ORG, certificateId: "cert-1", publicStatus: "VALID" });

    const res = await updatePublicStatusByCertificateId(
      { organizationId: ORG, certificateId: "cert-1", publicStatus: "SUSPENDED" },
      asClient(db)
    );
    expect(res.count).toBe(1);
    expect((db.certificateVerification.__store.find((r) => r.id === "v1") as Record<string, unknown>).publicStatus).toBe("SUSPENDED");
    // Foreign org untouched.
    expect((db.certificateVerification.__store.find((r) => r.id === "v2") as Record<string, unknown>).publicStatus).toBe("VALID");
  });
});

// ─── Architecture guards (25–30; static) ───────────────────────────────────────

describe("Phase 9 architecture guards", () => {
  const CERT_DIR = join(process.cwd(), "src", "modules", "certificates");
  const SHARED = readFileSync(join(CERT_DIR, "commands", "certificate-staleness-shared.ts"), "utf8");
  const COMMAND = readFileSync(join(CERT_DIR, "commands", "reconcile-certificate-staleness.command.ts"), "utf8");
  const HANDLER = readFileSync(
    join(process.cwd(), "src", "server", "events", "handlers", "certificate-transcript-staleness.handler.ts"),
    "utf8"
  );
  const ALL = [SHARED, COMMAND, HANDLER];
  const each = (fn: (src: string) => void) => ALL.forEach(fn);

  it("25. no Academic Core imports", () => {
    each((src) => {
      expect(src).not.toMatch(/modules\/(grades|attendance|assessments|academic|enrollments)/);
      expect(src).not.toMatch(/StudentCourseProgress|StudentSubjectProgress|StudentLevelProgress/);
    });
  });

  it("26. no Transcript repository / table imports", () => {
    each((src) => {
      expect(src).not.toMatch(/modules\/transcripts/);
      expect(src).not.toMatch(/AcademicTranscript/);
    });
  });

  it("27. no Grade / Attendance engine imports", () => {
    each((src) => {
      expect(src).not.toMatch(/GradeCalculation|grade-calculation|AttendanceCalculation|attendance-calculation/);
    });
  });

  it("28. no Eligibility engine imports", () => {
    each((src) => {
      expect(src).not.toMatch(/certificate-eligibility|EligibilityEngine|evaluateCertificateEligibility/);
    });
  });

  it("29. no Export / PDF imports", () => {
    each((src) => {
      expect(src).not.toMatch(/export-certificate\.command|certificate-pdf|certificate-export|react-pdf|renderToBuffer|generatePdf/i);
    });
  });

  it("30. no Generate / Issue / Revoke / Suspend / Restore command imports", () => {
    each((src) => {
      expect(src).not.toMatch(
        /generate-certificate\.command|issue-certificate\.command|revoke-certificate\.command|suspend-certificate\.command|restore-certificate\.command/
      );
    });
  });
});
