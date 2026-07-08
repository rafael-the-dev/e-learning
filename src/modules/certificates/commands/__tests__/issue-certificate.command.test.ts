import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeFakeDb, seed, type FakeDb } from "../../repositories/__tests__/_fake-db";

// =============================================================================
// IssueCertificateCommand — Phase 5 tests
// -----------------------------------------------------------------------------
// Drives the command against the fake DB (with rollback semantics). The real
// certificate repositories, ACL, checksum and audit service run; the number
// allocator and the event publisher are mocked. Asserts the official issue
// lifecycle: status transition, number/checksum/verification, event+audit inside
// the tx, domain event after commit, immutability, and concurrency guards.
// =============================================================================

const h = vi.hoisted(() => ({ db: null as unknown as FakeDb }));
const authState = vi.hoisted(() => ({ allow: true }));
const published = vi.hoisted(() => ({ events: [] as Array<Record<string, unknown>> }));

vi.mock("@/server/db", () => ({ getDb: vi.fn(async () => h.db) }));
vi.mock("@/server/auth/rbac", () => ({
  getUserPermissions: vi.fn(async () => new Set<string>()),
  createAbility: () => ({ can: () => authState.allow }),
}));
vi.mock("@/server/events/event-publisher", () => ({
  eventPublisher: { publish: vi.fn(async (e: Record<string, unknown>) => void published.events.push(e)) },
}));
vi.mock("@/modules/certificates/lib/certificate-number", () => ({
  allocateCertificateNumber: vi.fn(async () => "CERT-2026-000001"),
}));

import { AuthorizationError, BusinessRuleError, NotFoundError, ValidationError } from "@/shared/lib/command";
import { allocateCertificateNumber } from "@/modules/certificates/lib/certificate-number";
import type { ServiceContext } from "@/shared/types/common";
import { IssueCertificateCommand } from "../issue-certificate.command";

const ORG = "org-A";
const OTHER_ORG = "org-B";
const ctx: ServiceContext = { userId: "u-1", organizationId: ORG };
const store = (name: string) => h.db[name].__store;
const issuedEvents = () => published.events.filter((e) => e.eventType === "certificate.issued");

function seedIssuedTranscript(overrides: { checksum?: string; status?: string } = {}): void {
  seed(h.db, "academicTranscript", {
    id: "tr-1", organizationId: ORG, studentId: "stu-1", courseId: "course-1",
    transcriptType: "COURSE_TRANSCRIPT", transcriptNumber: "TR-2026-000001",
  });
  seed(h.db, "academicTranscriptVersion", {
    id: "ver-1", organizationId: ORG, transcriptId: "tr-1", status: overrides.status ?? "ISSUED",
    checksum: overrides.checksum ?? "chk-1", issuedAt: new Date("2026-07-01T00:00:00.000Z"), issuedBy: "user-1",
    studentSnapshot: JSON.stringify({ studentId: "stu-1", fullName: "João Silva" }),
    courseSnapshot: JSON.stringify({ course: { courseId: "course-1" }, courseProgress: { status: "COMPLETED" } }),
  });
}

function seedCertificate(overrides: Record<string, unknown> = {}): string {
  const row = seed(h.db, "certificate", {
    id: "cert-1",
    organizationId: ORG,
    studentId: "stu-1",
    enrollmentId: "enr-1",
    courseId: "course-1",
    transcriptVersionId: "ver-1",
    transcriptNumber: "TR-2026-000001",
    transcriptChecksum: "chk-1",
    certificatePolicyId: "pol-1",
    certificateTemplateId: null,
    certificateNumber: null,
    certificateType: "COURSE_COMPLETION",
    status: "DRAFT",
    studentSnapshot: JSON.stringify({ studentId: "stu-1", fullName: "João Silva" }),
    courseSnapshot: JSON.stringify({ courseId: "course-1", enrollmentId: "enr-1" }),
    issueBasisSnapshot: JSON.stringify({ transcriptVersionId: "ver-1", certificateType: "COURSE_COMPLETION" }),
    financialClearanceStatus: "NOT_REQUIRED",
    financialClearanceCheckedAt: null,
    financialClearanceReference: null,
    verificationCode: null,
    verificationUrl: null,
    checksum: null,
    issuedAt: null,
    issuedBy: null,
    expiresAt: null,
    deletedAt: null,
    ...overrides,
  });
  return row.id as string;
}

function seedApprovalEvent(): void {
  seed(h.db, "certificateEvent", {
    organizationId: ORG, certificateId: "cert-1", eventType: "certificate.approved",
    previousStatus: "PENDING_APPROVAL", newStatus: "PENDING_APPROVAL", actorId: "approver-1",
    reason: null, metadata: null, createdAt: new Date("2026-07-02T00:00:00.000Z"),
  });
}

function issue(certificateId = "cert-1", context: ServiceContext = ctx, reason?: string) {
  return new IssueCertificateCommand({ certificateId, reason }, context).run();
}

beforeEach(() => {
  vi.clearAllMocks();
  h.db = makeFakeDb();
  authState.allow = true;
  published.events.length = 0;
});
afterEach(() => {
  vi.restoreAllMocks();
});

// ─── Happy path (1–10) ─────────────────────────────────────────────────────────

describe("IssueCertificateCommand — happy path", () => {
  it("1/3. issues a DRAFT → ISSUED", async () => {
    seedIssuedTranscript();
    seedCertificate();
    const result = await issue();
    expect(result.status).toBe("ISSUED");
    expect((store("certificate")[0] as { status: string }).status).toBe("ISSUED");
  });

  it("2/4. issues a PENDING_APPROVAL with an approval event → ISSUED", async () => {
    seedIssuedTranscript();
    seedCertificate({ status: "PENDING_APPROVAL" });
    seedApprovalEvent();
    const result = await issue();
    expect(result.status).toBe("ISSUED");
    expect((store("certificate")[0] as { status: string }).status).toBe("ISSUED");
  });

  it("5. assigns a certificateNumber only on issue", async () => {
    seedIssuedTranscript();
    seedCertificate();
    const result = await issue();
    expect(allocateCertificateNumber).toHaveBeenCalledTimes(1);
    expect(result.certificateNumber).toBe("CERT-2026-000001");
    expect((store("certificate")[0] as { certificateNumber: string }).certificateNumber).toBe("CERT-2026-000001");
  });

  it("6. computes and stores the content checksum", async () => {
    seedIssuedTranscript();
    seedCertificate();
    const result = await issue();
    expect(result.checksum).toMatch(/^[0-9a-f]{64}$/);
    expect((store("certificate")[0] as { checksum: string }).checksum).toBe(result.checksum);
  });

  it("7. creates exactly one verification row (publicStatus VALID)", async () => {
    seedIssuedTranscript();
    seedCertificate();
    const result = await issue();
    const rows = store("certificateVerification");
    expect(rows).toHaveLength(1);
    expect((rows[0] as { verificationCode: string }).verificationCode).toBe(result.verificationCode);
    expect((rows[0] as { publicStatus: string }).publicStatus).toBe("VALID");
    expect(result.publicStatus).toBe("VALID");
  });

  it("8. creates a certificate.issued CertificateEvent row", async () => {
    seedIssuedTranscript();
    seedCertificate();
    await issue();
    expect(store("certificateEvent").some((r) => (r as { eventType: string }).eventType === "certificate.issued")).toBe(true);
  });

  it("9. writes an AuditLog row", async () => {
    seedIssuedTranscript();
    seedCertificate();
    await issue();
    expect(store("auditLog").some((r) => (r as { action: string }).action === "certificate.issued")).toBe(true);
  });

  it("10. publishes certificate.issued after commit", async () => {
    seedIssuedTranscript();
    seedCertificate();
    await issue();
    expect(issuedEvents()).toHaveLength(1);
  });
});

// ─── Validation / state guards (11–19) ──────────────────────────────────────────

describe("IssueCertificateCommand — state & validity guards", () => {
  it.each(["ISSUED", "SUSPENDED", "REVOKED", "STALE"])("11–14. rejects a %s certificate", async (status) => {
    seedIssuedTranscript();
    seedCertificate({ status });
    await expect(issue()).rejects.toBeInstanceOf(BusinessRuleError);
    expect(issuedEvents()).toHaveLength(0);
  });

  it("15. rejects PENDING_APPROVAL without an approval event", async () => {
    seedIssuedTranscript();
    seedCertificate({ status: "PENDING_APPROVAL" });
    await expect(issue()).rejects.toBeInstanceOf(BusinessRuleError);
    expect((store("certificate")[0] as { status: string }).status).toBe("PENDING_APPROVAL");
  });

  it("16. rejects a missing / invalid certificate", async () => {
    seedIssuedTranscript();
    await expect(issue("ghost")).rejects.toBeInstanceOf(NotFoundError);
  });

  it("17. rejects when the transcript is no longer ISSUED", async () => {
    seedIssuedTranscript({ status: "SUPERSEDED" }); // ACL returns null for non-ISSUED
    seedCertificate();
    const err = await issue().catch((e) => e);
    expect(err).toBeInstanceOf(BusinessRuleError);
    expect((err as Error).message).toContain("TRANSCRIPT_NOT_ISSUED_OR_NO_LONGER_VALID");
    expect(store("certificateVerification")).toHaveLength(0);
  });

  it("18. rejects when the transcript checksum changed", async () => {
    seedIssuedTranscript({ checksum: "chk-NEW" });
    seedCertificate({ transcriptChecksum: "chk-OLD" });
    const err = await issue().catch((e) => e);
    expect(err).toBeInstanceOf(BusinessRuleError);
    expect((err as Error).message).toContain("TRANSCRIPT_CHECKSUM_CHANGED");
  });

  it("19. rejects without certificates.issue permission", async () => {
    seedIssuedTranscript();
    seedCertificate();
    authState.allow = false;
    await expect(issue()).rejects.toBeInstanceOf(AuthorizationError);
    expect(store("certificate")[0]).toMatchObject({ status: "DRAFT" });
  });

  it("cannot issue a cross-tenant certificate", async () => {
    seedIssuedTranscript();
    seedCertificate();
    await expect(issue("cert-1", { userId: "u-x", organizationId: OTHER_ORG })).rejects.toBeInstanceOf(NotFoundError);
  });

  it("rejects unknown input keys (strict schema)", async () => {
    const cmd = new IssueCertificateCommand({ certificateId: "cert-1", status: "ISSUED" } as never, ctx);
    await expect(cmd.run()).rejects.toBeInstanceOf(ValidationError);
  });
});

// ─── Transaction / rollback (20–24) ─────────────────────────────────────────────

describe("IssueCertificateCommand — transaction & rollback", () => {
  function poison(model: string) {
    h.db[model].create = async () => {
      throw new Error(`boom: ${model} insert failed`);
    };
  }

  it("20/23. rolls back and emits nothing when the verification insert fails", async () => {
    seedIssuedTranscript();
    seedCertificate();
    poison("certificateVerification");
    await expect(issue()).rejects.toThrow(/boom/);
    expect(published.events).toHaveLength(0);
    const cert = store("certificate")[0] as { status: string; certificateNumber: string | null; checksum: string | null };
    expect(cert.status).toBe("DRAFT");
    expect(cert.certificateNumber ?? null).toBeNull();
    expect(cert.checksum ?? null).toBeNull();
    expect(store("certificateEvent")).toHaveLength(0);
    expect(store("auditLog")).toHaveLength(0);
  });

  it("21. rolls back when the audit insert fails", async () => {
    seedIssuedTranscript();
    seedCertificate();
    poison("auditLog");
    await expect(issue()).rejects.toThrow(/boom/);
    expect(published.events).toHaveLength(0);
    expect((store("certificate")[0] as { status: string }).status).toBe("DRAFT");
    expect(store("certificateVerification")).toHaveLength(0);
  });

  it("22. rolls back when the CertificateEvent insert fails", async () => {
    seedIssuedTranscript();
    seedCertificate();
    poison("certificateEvent");
    await expect(issue()).rejects.toThrow(/boom/);
    expect(published.events).toHaveLength(0);
    expect((store("certificate")[0] as { status: string }).status).toBe("DRAFT");
    expect(store("certificateVerification")).toHaveLength(0);
    expect(store("auditLog")).toHaveLength(0);
  });

  it("24. an allocated number is not persisted if the transaction rolls back", async () => {
    seedIssuedTranscript();
    seedCertificate();
    poison("certificateEvent");
    await issue().catch(() => undefined);
    const cert = store("certificate")[0] as { certificateNumber: string | null; status: string };
    expect(cert.certificateNumber ?? null).toBeNull();
    expect(cert.status).toBe("DRAFT");
  });
});

// ─── Concurrency (25–29) ────────────────────────────────────────────────────────

describe("IssueCertificateCommand — concurrency", () => {
  it("25/26/27. a second issue fails, allocates no second number, emits no duplicate event", async () => {
    seedIssuedTranscript();
    seedCertificate();
    await issue(); // first issue succeeds
    await expect(issue()).rejects.toBeInstanceOf(BusinessRuleError);
    expect(allocateCertificateNumber).toHaveBeenCalledTimes(1);
    expect(issuedEvents()).toHaveLength(1);
  });

  it("28. aborts when the conditional mark-issued affects zero rows", async () => {
    seedIssuedTranscript();
    seedCertificate();
    // Simulate a lost race: the WHERE status IN (DRAFT, PENDING_APPROVAL) matches nothing.
    h.db.certificate.updateMany = async () => ({ count: 0 });
    await expect(issue()).rejects.toBeInstanceOf(BusinessRuleError);
    expect(published.events).toHaveLength(0);
    expect(store("certificateVerification")).toHaveLength(0);
  });

  it("29. a duplicate verification-row insert rolls the issue back", async () => {
    seedIssuedTranscript();
    seedCertificate();
    h.db.certificateVerification.create = async () => {
      throw new Error("unique constraint: certificateId");
    };
    await expect(issue()).rejects.toThrow(/unique constraint/);
    expect((store("certificate")[0] as { status: string }).status).toBe("DRAFT");
    expect(published.events).toHaveLength(0);
  });
});

// ─── Immutability (30–33) ───────────────────────────────────────────────────────

describe("IssueCertificateCommand — immutability", () => {
  it("30. leaves the frozen content snapshots unchanged", async () => {
    seedIssuedTranscript();
    seedCertificate();
    const before = store("certificate")[0] as Record<string, unknown>;
    const snap = {
      studentSnapshot: before.studentSnapshot,
      courseSnapshot: before.courseSnapshot,
      issueBasisSnapshot: before.issueBasisSnapshot,
    };
    await issue();
    const after = store("certificate")[0] as Record<string, unknown>;
    expect(after.studentSnapshot).toBe(snap.studentSnapshot);
    expect(after.courseSnapshot).toBe(snap.courseSnapshot);
    expect(after.issueBasisSnapshot).toBe(snap.issueBasisSnapshot);
  });

  it("31. leaves the transcript pointer / number / checksum unchanged", async () => {
    seedIssuedTranscript();
    seedCertificate();
    await issue();
    const cert = store("certificate")[0] as Record<string, unknown>;
    expect(cert.transcriptVersionId).toBe("ver-1");
    expect(cert.transcriptNumber).toBe("TR-2026-000001");
    expect(cert.transcriptChecksum).toBe("chk-1");
  });

  it("32. leaves the financial snapshot unchanged", async () => {
    seedIssuedTranscript();
    seedCertificate({ financialClearanceStatus: "CLEARED", financialClearanceReference: "clr-9" });
    await issue();
    const cert = store("certificate")[0] as Record<string, unknown>;
    expect(cert.financialClearanceStatus).toBe("CLEARED");
    expect(cert.financialClearanceReference).toBe("clr-9");
  });

  it("33. never reassigns an already-assigned certificateNumber", async () => {
    seedIssuedTranscript();
    seedCertificate({ certificateNumber: "CERT-2026-000099" });
    const result = await issue();
    expect(result.certificateNumber).toBe("CERT-2026-000099");
    expect(allocateCertificateNumber).not.toHaveBeenCalled();
  });
});

// ─── Event / audit payloads (34–36) ─────────────────────────────────────────────

describe("IssueCertificateCommand — event & audit payloads", () => {
  it("34. the domain event payload is complete", async () => {
    seedIssuedTranscript();
    seedCertificate();
    const result = await issue("cert-1", ctx, "motivo");
    const event = issuedEvents()[0];
    expect(event).toMatchObject({
      eventType: "certificate.issued",
      aggregateType: "CERTIFICATE",
      aggregateId: "cert-1",
      actorId: "u-1",
    });
    expect(event.payload).toMatchObject({
      organizationId: ORG,
      certificateId: "cert-1",
      certificateNumber: result.certificateNumber,
      certificateType: "COURSE_COMPLETION",
      studentId: "stu-1",
      enrollmentId: "enr-1",
      courseId: "course-1",
      transcriptVersionId: "ver-1",
      transcriptNumber: "TR-2026-000001",
      issuedBy: "u-1",
      checksum: result.checksum,
      reason: "motivo",
    });
  });

  it("35. the audit payload records old + new lifecycle values", async () => {
    seedIssuedTranscript();
    seedCertificate();
    const result = await issue();
    const audit = store("auditLog").find((r) => (r as { action: string }).action === "certificate.issued") as {
      oldValues: string;
      newValues: string;
    };
    expect(JSON.parse(audit.oldValues)).toMatchObject({ status: "DRAFT", certificateNumber: null, checksum: null });
    expect(JSON.parse(audit.newValues)).toMatchObject({
      status: "ISSUED",
      certificateNumber: result.certificateNumber,
      checksum: result.checksum,
      issuedBy: "u-1",
      verificationCode: result.verificationCode,
    });
  });

  it("36. the CertificateEvent metadata is useful", async () => {
    seedIssuedTranscript();
    seedCertificate();
    const result = await issue();
    const evt = store("certificateEvent").find((r) => (r as { eventType: string }).eventType === "certificate.issued") as {
      previousStatus: string;
      newStatus: string;
      metadata: string;
    };
    expect(evt.previousStatus).toBe("DRAFT");
    expect(evt.newStatus).toBe("ISSUED");
    expect(JSON.parse(evt.metadata)).toMatchObject({
      certificateNumber: result.certificateNumber,
      checksum: result.checksum,
      transcriptVersionId: "ver-1",
      transcriptNumber: "TR-2026-000001",
      verificationCode: result.verificationCode,
    });
  });
});

// ─── Architecture guards (37–44; static) ────────────────────────────────────────

describe("IssueCertificateCommand — architecture guards", () => {
  const SRC = readFileSync(
    join(process.cwd(), "src", "modules", "certificates", "commands", "issue-certificate.command.ts"),
    "utf8"
  );

  it("37. does NOT import Grade / Attendance / CourseCompletion", () => {
    expect(SRC).not.toMatch(/GradeCalculation|grade-calculation|modules\/grades/);
    expect(SRC).not.toMatch(/AttendanceCalculation|attendance-calculation|modules\/attendance/);
    expect(SRC).not.toMatch(/CourseCompletion|course-completion/);
  });

  it("38. does NOT import Transcript repositories / Prisma models directly", () => {
    expect(SRC).not.toMatch(/modules\/transcripts\/repositories/);
    expect(SRC).not.toMatch(/modules\/transcripts/);
    expect(SRC).not.toMatch(/AcademicTranscript/);
  });

  it("39. reads the transcript ONLY through CertificateTranscriptSourceRepository", () => {
    expect(SRC).toMatch(/certificate-transcript-source/);
    expect(SRC).toMatch(/findIssuedTranscriptVersionForCertificate/);
  });

  it("40. does NOT import PDF / storage / UI", () => {
    expect(SRC).not.toMatch(/react-pdf|puppeteer|generatePdf|uploadthing|infrastructure\/storage/i);
    expect(SRC).not.toMatch(/from ["']react["']|@\/components\/|\.tsx["']/);
  });

  it("41. does NOT import a public verification endpoint / route", () => {
    expect(SRC).not.toMatch(/PUBLIC_PATHS|\/verify\/|app\/\(|route\.ts|proxy/);
  });

  it("42. does NOT call the EligibilityEngine to re-decide", () => {
    expect(SRC).not.toMatch(/certificate-eligibility\.engine|evaluateCertificateEligibility|certificate-eligibility-source|loadCertificateEligibilityFacts/);
  });

  it("43. has no policy.requires* branching", () => {
    expect(SRC).not.toMatch(/requiresManualApproval|requiresCourseCompleted|requiresFinancialClearance|requiresNoPendingSubjects/);
  });

  it("44. has no courseProgress / subject / attendance eligibility branching", () => {
    expect(SRC).not.toMatch(/courseProgressSnapshot/);
    expect(SRC).not.toMatch(/\.subjects\b/);
    expect(SRC).not.toMatch(/attendancePercentage|minimumAttendancePercentage/);
  });
});
