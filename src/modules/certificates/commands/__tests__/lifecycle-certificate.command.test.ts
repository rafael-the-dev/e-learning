import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeFakeDb, seed, type FakeDb } from "../../repositories/__tests__/_fake-db";

// =============================================================================
// Certificate lifecycle commands — Phase 6 tests (Revoke / Suspend / Restore)
// -----------------------------------------------------------------------------
// Drives the three post-issue lifecycle commands against the rollback-capable
// fake DB. Real repositories + audit service run; the event publisher and RBAC
// are mocked. Asserts transitions, verification projection, event/audit/domain
// event, immutability, concurrency guards, authorization, and boundaries.
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

import { AuthorizationError, BusinessRuleError, NotFoundError, ValidationError } from "@/shared/lib/command";
import type { ServiceContext } from "@/shared/types/common";
import { RevokeCertificateCommand } from "../revoke-certificate.command";
import { SuspendCertificateCommand } from "../suspend-certificate.command";
import { RestoreCertificateCommand } from "../restore-certificate.command";

const ORG = "org-A";
const OTHER_ORG = "org-B";
const ctx: ServiceContext = { userId: "u-1", organizationId: ORG };
const store = (name: string) => h.db[name].__store;
const cert = () => store("certificate")[0] as Record<string, unknown>;
const verif = () => store("certificateVerification")[0] as Record<string, unknown>;
const eventsOf = (type: string) => published.events.filter((e) => e.eventType === type);

const FROZEN = {
  studentSnapshot: JSON.stringify({ studentId: "stu-1", fullName: "João Silva" }),
  courseSnapshot: JSON.stringify({ courseId: "course-1", enrollmentId: "enr-1" }),
  issueBasisSnapshot: JSON.stringify({ transcriptVersionId: "ver-1", certificateType: "COURSE_COMPLETION" }),
};

function seedCert(overrides: Record<string, unknown> = {}): void {
  seed(h.db, "certificate", {
    id: "cert-1", organizationId: ORG, studentId: "stu-1", enrollmentId: "enr-1", courseId: "course-1",
    transcriptVersionId: "ver-1", transcriptNumber: "TR-2026-000001", transcriptChecksum: "chk-1",
    certificatePolicyId: "pol-1", certificateTemplateId: null, certificateNumber: "CERT-2026-000001",
    certificateType: "COURSE_COMPLETION", status: "ISSUED",
    studentSnapshot: FROZEN.studentSnapshot, courseSnapshot: FROZEN.courseSnapshot, issueBasisSnapshot: FROZEN.issueBasisSnapshot,
    financialClearanceStatus: "NOT_REQUIRED", financialClearanceCheckedAt: null, financialClearanceReference: null,
    verificationCode: "vc-1", verificationUrl: null, checksum: "sum-1",
    issuedAt: new Date("2026-07-05T00:00:00.000Z"), issuedBy: "u-0",
    revokedAt: null, revokedBy: null, revokeReason: null,
    suspendedAt: null, suspendedBy: null, suspendReason: null,
    staleDetectedAt: null, staleReason: null, expiresAt: null, deletedAt: null,
    ...overrides,
  });
}

function seedVerification(overrides: Record<string, unknown> = {}): void {
  seed(h.db, "certificateVerification", {
    id: "vrow-1", organizationId: ORG, certificateId: "cert-1", verificationCode: "vc-1",
    publicStatus: "VALID", verificationCount: 0, lastVerifiedAt: null, expiresAt: null, ...overrides,
  });
}

const revoke = (reason = "erro nos dados", context = ctx) =>
  new RevokeCertificateCommand({ certificateId: "cert-1", reason }, context).run();
const suspend = (reason = "sob revisão", context = ctx) =>
  new SuspendCertificateCommand({ certificateId: "cert-1", reason }, context).run();
const restore = (context = ctx, reason?: string) =>
  new RestoreCertificateCommand({ certificateId: "cert-1", reason }, context).run();

beforeEach(() => {
  vi.clearAllMocks();
  h.db = makeFakeDb();
  authState.allow = true;
  authState.checked.length = 0;
  published.events.length = 0;
});
afterEach(() => vi.restoreAllMocks());

// ─── Revoke (1–10) ───────────────────────────────────────────────────────────

describe("RevokeCertificateCommand", () => {
  it("1. ISSUED → REVOKED", async () => {
    seedCert(); seedVerification();
    const r = await revoke();
    expect(r.status).toBe("REVOKED");
    expect(cert().status).toBe("REVOKED");
    expect(cert().revokedBy).toBe("u-1");
    expect(cert().revokeReason).toBe("erro nos dados");
  });

  it("2. SUSPENDED → REVOKED", async () => {
    seedCert({ status: "SUSPENDED", suspendedAt: new Date("2026-07-06T00:00:00.000Z"), suspendedBy: "u-0", suspendReason: "x" });
    seedVerification({ publicStatus: "SUSPENDED" });
    const r = await revoke();
    expect(r.status).toBe("REVOKED");
    expect(cert().status).toBe("REVOKED");
  });

  it.each(["DRAFT", "PENDING_APPROVAL", "REVOKED", "STALE"])("3–5. cannot revoke a %s certificate", async (status) => {
    seedCert({ status }); seedVerification();
    await expect(revoke()).rejects.toBeInstanceOf(BusinessRuleError);
    expect(published.events).toHaveLength(0);
  });

  it("6. reason is required", async () => {
    seedCert(); seedVerification();
    await expect(new RevokeCertificateCommand({ certificateId: "cert-1", reason: "" }, ctx).run()).rejects.toBeInstanceOf(ValidationError);
  });

  it("7. verification publicStatus → REVOKED", async () => {
    seedCert(); seedVerification();
    await revoke();
    expect(verif().publicStatus).toBe("REVOKED");
  });

  it("8. writes event + audit + domain event", async () => {
    seedCert(); seedVerification();
    await revoke();
    expect(store("certificateEvent").some((e) => (e as { eventType: string }).eventType === "certificate.revoked")).toBe(true);
    expect(store("auditLog").some((a) => (a as { action: string }).action === "certificate.revoked")).toBe(true);
    expect(eventsOf("certificate.revoked")).toHaveLength(1);
  });

  it("9. rollback emits nothing and leaves the certificate unchanged", async () => {
    seedCert(); seedVerification();
    h.db.certificateEvent.create = async () => { throw new Error("boom"); };
    await expect(revoke()).rejects.toThrow(/boom/);
    expect(published.events).toHaveLength(0);
    expect(cert().status).toBe("ISSUED");
    expect(verif().publicStatus).toBe("VALID");
    expect(store("auditLog")).toHaveLength(0);
  });

  it("10. double revoke fails (terminal)", async () => {
    seedCert(); seedVerification();
    await revoke();
    await expect(revoke()).rejects.toBeInstanceOf(BusinessRuleError);
    expect(eventsOf("certificate.revoked")).toHaveLength(1);
  });
});

// ─── Suspend (11–20) ───────────────────────────────────────────────────────────

describe("SuspendCertificateCommand", () => {
  it("11. ISSUED → SUSPENDED", async () => {
    seedCert(); seedVerification();
    const r = await suspend();
    expect(r.status).toBe("SUSPENDED");
    expect(cert().status).toBe("SUSPENDED");
    expect(cert().suspendedBy).toBe("u-1");
    expect(cert().suspendReason).toBe("sob revisão");
  });

  it.each(["DRAFT", "PENDING_APPROVAL", "SUSPENDED", "REVOKED", "STALE"])("12–15. cannot suspend a %s certificate", async (status) => {
    seedCert({ status }); seedVerification();
    await expect(suspend()).rejects.toBeInstanceOf(BusinessRuleError);
    expect(published.events).toHaveLength(0);
  });

  it("16. reason is required", async () => {
    seedCert(); seedVerification();
    await expect(new SuspendCertificateCommand({ certificateId: "cert-1", reason: "" }, ctx).run()).rejects.toBeInstanceOf(ValidationError);
  });

  it("17. verification publicStatus → SUSPENDED", async () => {
    seedCert(); seedVerification();
    await suspend();
    expect(verif().publicStatus).toBe("SUSPENDED");
  });

  it("18. writes event + audit + domain event", async () => {
    seedCert(); seedVerification();
    await suspend();
    expect(store("certificateEvent").some((e) => (e as { eventType: string }).eventType === "certificate.suspended")).toBe(true);
    expect(store("auditLog").some((a) => (a as { action: string }).action === "certificate.suspended")).toBe(true);
    expect(eventsOf("certificate.suspended")).toHaveLength(1);
  });

  it("19. rollback emits nothing and leaves the certificate unchanged", async () => {
    seedCert(); seedVerification();
    h.db.auditLog.create = async () => { throw new Error("boom"); };
    await expect(suspend()).rejects.toThrow(/boom/);
    expect(published.events).toHaveLength(0);
    expect(cert().status).toBe("ISSUED");
    expect(verif().publicStatus).toBe("VALID");
    expect(store("certificateEvent")).toHaveLength(0);
  });

  it("20. double suspend fails", async () => {
    seedCert(); seedVerification();
    await suspend();
    await expect(suspend()).rejects.toBeInstanceOf(BusinessRuleError);
    expect(eventsOf("certificate.suspended")).toHaveLength(1);
  });
});

// ─── Restore (21–30) ─────────────────────────────────────────────────────────

describe("RestoreCertificateCommand", () => {
  function seedSuspended(overrides: Record<string, unknown> = {}) {
    seedCert({ status: "SUSPENDED", suspendedAt: new Date("2026-07-06T00:00:00.000Z"), suspendedBy: "u-0", suspendReason: "x", ...overrides });
    seedVerification({ publicStatus: "SUSPENDED" });
  }

  it("21. SUSPENDED → ISSUED (suspension fields cleared)", async () => {
    seedSuspended();
    const r = await restore();
    expect(r.status).toBe("ISSUED");
    expect(cert().status).toBe("ISSUED");
    expect(cert().suspendedAt ?? null).toBeNull();
    expect(cert().suspendedBy ?? null).toBeNull();
    expect(cert().suspendReason ?? null).toBeNull();
  });

  it.each(["DRAFT", "PENDING_APPROVAL", "ISSUED", "REVOKED", "STALE"])("22–25. cannot restore a %s certificate", async (status) => {
    seedCert({ status }); seedVerification();
    await expect(restore()).rejects.toBeInstanceOf(BusinessRuleError);
    expect(published.events).toHaveLength(0);
  });

  it("26. verification publicStatus → VALID when not expired", async () => {
    seedSuspended({ expiresAt: null });
    const r = await restore();
    expect(r.publicStatus).toBe("VALID");
    expect(verif().publicStatus).toBe("VALID");
  });

  it("27. verification publicStatus → EXPIRED when already past expiry", async () => {
    seedSuspended({ expiresAt: new Date("2020-01-01T00:00:00.000Z") });
    const r = await restore();
    expect(r.publicStatus).toBe("EXPIRED");
    expect(verif().publicStatus).toBe("EXPIRED");
  });

  it("28. writes event + audit + domain event", async () => {
    seedSuspended();
    await restore();
    expect(store("certificateEvent").some((e) => (e as { eventType: string }).eventType === "certificate.restored")).toBe(true);
    expect(store("auditLog").some((a) => (a as { action: string }).action === "certificate.restored")).toBe(true);
    expect(eventsOf("certificate.restored")).toHaveLength(1);
  });

  it("29. rollback emits nothing and leaves the certificate SUSPENDED", async () => {
    seedSuspended();
    h.db.certificateEvent.create = async () => { throw new Error("boom"); };
    await expect(restore()).rejects.toThrow(/boom/);
    expect(published.events).toHaveLength(0);
    expect(cert().status).toBe("SUSPENDED");
    expect(verif().publicStatus).toBe("SUSPENDED");
  });

  it("30. double restore fails", async () => {
    seedSuspended();
    await restore();
    await expect(restore()).rejects.toBeInstanceOf(BusinessRuleError);
    expect(eventsOf("certificate.restored")).toHaveLength(1);
  });
});

// ─── Immutability (31–34) ──────────────────────────────────────────────────────

describe("lifecycle commands — immutability", () => {
  it("31/32/33/34. revoke leaves snapshots, transcript pointers, number/checksum, issue stamp unchanged", async () => {
    seedCert(); seedVerification();
    await revoke();
    const c = cert();
    expect(c.studentSnapshot).toBe(FROZEN.studentSnapshot);
    expect(c.courseSnapshot).toBe(FROZEN.courseSnapshot);
    expect(c.issueBasisSnapshot).toBe(FROZEN.issueBasisSnapshot);
    expect(c.transcriptVersionId).toBe("ver-1");
    expect(c.transcriptNumber).toBe("TR-2026-000001");
    expect(c.transcriptChecksum).toBe("chk-1");
    expect(c.certificateNumber).toBe("CERT-2026-000001");
    expect(c.checksum).toBe("sum-1");
    expect(c.issuedAt).toEqual(new Date("2026-07-05T00:00:00.000Z"));
    expect(c.issuedBy).toBe("u-0");
    expect(c.financialClearanceStatus).toBe("NOT_REQUIRED");
  });

  it("suspend + restore round-trip preserves the frozen content", async () => {
    seedCert(); seedVerification();
    await suspend();
    await restore();
    const c = cert();
    expect(c.certificateNumber).toBe("CERT-2026-000001");
    expect(c.checksum).toBe("sum-1");
    expect(c.studentSnapshot).toBe(FROZEN.studentSnapshot);
    expect(c.status).toBe("ISSUED");
  });
});

// ─── Concurrency (35–38) ────────────────────────────────────────────────────────

describe("lifecycle commands — concurrency", () => {
  it("35. revoke aborts when the conditional mark affects zero rows", async () => {
    seedCert(); seedVerification();
    h.db.certificate.updateMany = async () => ({ count: 0 });
    await expect(revoke()).rejects.toBeInstanceOf(BusinessRuleError);
    expect(published.events).toHaveLength(0);
    expect(store("certificateEvent")).toHaveLength(0);
    expect(store("auditLog")).toHaveLength(0);
  });

  it("36. suspend aborts when the conditional mark affects zero rows", async () => {
    seedCert(); seedVerification();
    h.db.certificate.updateMany = async () => ({ count: 0 });
    await expect(suspend()).rejects.toBeInstanceOf(BusinessRuleError);
    expect(published.events).toHaveLength(0);
  });

  it("37. restore aborts when the conditional mark affects zero rows", async () => {
    seedCert({ status: "SUSPENDED" }); seedVerification({ publicStatus: "SUSPENDED" });
    h.db.certificate.updateMany = async () => ({ count: 0 });
    await expect(restore()).rejects.toBeInstanceOf(BusinessRuleError);
    expect(published.events).toHaveLength(0);
  });

  it("38. a lost race writes no duplicate event/audit (count 0 aborts before side effects)", async () => {
    seedCert(); seedVerification();
    h.db.certificate.updateMany = async () => ({ count: 0 });
    await revoke().catch(() => undefined);
    expect(store("certificateEvent")).toHaveLength(0);
    expect(store("auditLog")).toHaveLength(0);
    expect(published.events).toHaveLength(0);
  });

  it("38b. aborts (and rolls back) when the verification projection update affects zero rows", async () => {
    seedCert(); seedVerification();
    h.db.certificateVerification.updateMany = async () => ({ count: 0 });
    await expect(revoke()).rejects.toBeInstanceOf(BusinessRuleError);
    expect(cert().status).toBe("ISSUED");
    expect(store("certificateEvent")).toHaveLength(0);
    expect(store("auditLog")).toHaveLength(0);
    expect(published.events).toHaveLength(0);
  });
});

// ─── Authorization + tenant (39–42) ─────────────────────────────────────────────

describe("lifecycle commands — authorization & tenant", () => {
  it("39. revoke requires certificates.revoke", async () => {
    seedCert(); seedVerification();
    authState.allow = false;
    await expect(revoke()).rejects.toBeInstanceOf(AuthorizationError);
    expect(authState.checked).toContain("certificates.revoke");
  });

  it("40. suspend requires certificates.suspend", async () => {
    seedCert(); seedVerification();
    authState.allow = false;
    await expect(suspend()).rejects.toBeInstanceOf(AuthorizationError);
    expect(authState.checked).toContain("certificates.suspend");
  });

  it("41. restore requires certificates.suspend (no dedicated restore permission this phase)", async () => {
    seedCert({ status: "SUSPENDED" }); seedVerification({ publicStatus: "SUSPENDED" });
    authState.allow = false;
    await expect(restore()).rejects.toBeInstanceOf(AuthorizationError);
    expect(authState.checked).toContain("certificates.suspend");
  });

  it("42. cross-tenant certificate is not found", async () => {
    seedCert(); seedVerification();
    await expect(revoke("motivo", { userId: "u-x", organizationId: OTHER_ORG })).rejects.toBeInstanceOf(NotFoundError);
    await expect(suspend("motivo", { userId: "u-x", organizationId: OTHER_ORG })).rejects.toBeInstanceOf(NotFoundError);
  });
});

// ─── Event / audit payloads ─────────────────────────────────────────────────────

describe("lifecycle commands — event & audit payloads", () => {
  it("domain event payload is complete (revoke)", async () => {
    seedCert(); seedVerification();
    await revoke("motivo");
    const e = eventsOf("certificate.revoked")[0];
    expect(e).toMatchObject({ aggregateType: "CERTIFICATE", aggregateId: "cert-1", actorId: "u-1" });
    expect(e.payload).toMatchObject({
      organizationId: ORG, certificateId: "cert-1", certificateNumber: "CERT-2026-000001",
      certificateType: "COURSE_COMPLETION", studentId: "stu-1", enrollmentId: "enr-1", courseId: "course-1",
      transcriptVersionId: "ver-1", transcriptNumber: "TR-2026-000001",
      previousStatus: "ISSUED", newStatus: "REVOKED", actorId: "u-1", reason: "motivo", checksum: "sum-1",
    });
    expect((e.payload as Record<string, unknown>).occurredAt).toBeInstanceOf(Date);
  });

  it("audit records old + new status and verification publicStatus (suspend)", async () => {
    seedCert(); seedVerification();
    await suspend("motivo");
    const a = store("auditLog").find((r) => (r as { action: string }).action === "certificate.suspended") as { oldValues: string; newValues: string };
    expect(JSON.parse(a.oldValues)).toMatchObject({ status: "ISSUED", verificationPublicStatus: "VALID" });
    expect(JSON.parse(a.newValues)).toMatchObject({ status: "SUSPENDED", verificationPublicStatus: "SUSPENDED", reason: "motivo" });
  });

  it("CertificateEvent metadata is useful (restore)", async () => {
    seedCert({ status: "SUSPENDED" }); seedVerification({ publicStatus: "SUSPENDED" });
    await restore(ctx, "reabrir");
    const evt = store("certificateEvent").find((r) => (r as { eventType: string }).eventType === "certificate.restored") as {
      previousStatus: string; newStatus: string; metadata: string;
    };
    expect(evt.previousStatus).toBe("SUSPENDED");
    expect(evt.newStatus).toBe("ISSUED");
    expect(JSON.parse(evt.metadata)).toMatchObject({
      certificateNumber: "CERT-2026-000001", checksum: "sum-1", transcriptVersionId: "ver-1",
      transcriptNumber: "TR-2026-000001", verificationPublicStatus: "VALID",
    });
  });

  it("missing verification row aborts the transition", async () => {
    seedCert(); // no verification seeded
    await expect(revoke()).rejects.toBeInstanceOf(BusinessRuleError);
    expect(cert().status).toBe("ISSUED");
  });
});

// ─── Architecture guards (43–49; static) ────────────────────────────────────────

describe("lifecycle commands — architecture guards", () => {
  const DIR = join(process.cwd(), "src", "modules", "certificates", "commands");
  const FILES = [
    "revoke-certificate.command.ts",
    "suspend-certificate.command.ts",
    "restore-certificate.command.ts",
  ];
  const SRCS = FILES.map((f) => readFileSync(join(DIR, f), "utf8"));

  const each = (fn: (src: string, file: string) => void) => FILES.forEach((f, i) => fn(SRCS[i], f));

  it("43. no Grade / Attendance / CourseCompletion imports", () => {
    each((src) => {
      expect(src).not.toMatch(/GradeCalculation|grade-calculation|modules\/grades/);
      expect(src).not.toMatch(/AttendanceCalculation|attendance-calculation|modules\/attendance/);
      expect(src).not.toMatch(/CourseCompletion|course-completion/);
    });
  });

  it("44. no Transcript repositories / ACL / Prisma models", () => {
    each((src) => {
      expect(src).not.toMatch(/modules\/transcripts/);
      expect(src).not.toMatch(/certificate-transcript-source/);
      expect(src).not.toMatch(/AcademicTranscript/);
    });
  });

  it("45. no EligibilityEngine / Source", () => {
    each((src) => {
      expect(src).not.toMatch(/certificate-eligibility\.engine|evaluateCertificateEligibility/);
      expect(src).not.toMatch(/certificate-eligibility-source|loadCertificateEligibilityFacts/);
    });
  });

  it("46. no PDF / storage / UI", () => {
    each((src) => {
      expect(src).not.toMatch(/react-pdf|puppeteer|generatePdf|uploadthing|infrastructure\/storage/i);
      expect(src).not.toMatch(/from ["']react["']|@\/components\/|\.tsx["']/);
    });
  });

  it("47. no issue / generate command import", () => {
    each((src) => {
      expect(src).not.toMatch(/generate-certificate\.command|issue-certificate\.command/);
    });
  });

  it("48. never writes the frozen snapshot columns", () => {
    each((src) => {
      expect(src).not.toMatch(/studentSnapshot|courseSnapshot|issueBasisSnapshot/);
    });
  });

  it("49. never calls a number/checksum-writing repository method", () => {
    each((src) => {
      expect(src).not.toMatch(/markCertificateIssued|allocateCertificateNumber|certificateContentChecksum|updateCertificateMetadata/);
    });
  });
});
