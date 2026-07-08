import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeFakeDb, seed, type FakeDb } from "../../repositories/__tests__/_fake-db";
import { CertificateEligibilityBlocker as B, CertificateEligibilityWarning as W } from "@/modules/certificates/constants";

// =============================================================================
// GenerateCertificateCommand — Phase 4 tests
// -----------------------------------------------------------------------------
// The command orchestrates: source loads facts → engine decides → command
// persists a DRAFT / PENDING_APPROVAL certificate. These tests seed the fake DB
// (policy + issued transcript tables) and drive the REAL source + engine through
// the command, then assert the decision branch, the persisted snapshot, and the
// architecture boundaries. No issuance, number, checksum, or verification row.
// =============================================================================

const h = vi.hoisted(() => ({ db: null as unknown as FakeDb }));
const authState = vi.hoisted(() => ({ allow: true }));

vi.mock("@/server/db", () => ({ getDb: vi.fn(async () => h.db) }));
vi.mock("@/server/auth/rbac", () => ({
  getUserPermissions: vi.fn(async () => new Set<string>()),
  createAbility: () => ({ can: () => authState.allow }),
}));

import { AuthorizationError, BusinessRuleError, ValidationError } from "@/shared/lib/command";
import type { ServiceContext } from "@/shared/types/common";
import { GenerateCertificateCommand } from "../generate-certificate.command";

const ORG = "org-A";
const OTHER_ORG = "org-B";
const ctx: ServiceContext = { userId: "u-1", organizationId: ORG };
const store = (name: string) => h.db[name].__store;

function seedPolicy(overrides: Record<string, unknown> = {}): void {
  seed(h.db, "certificatePolicy", {
    organizationId: ORG,
    name: "Política",
    certificateType: "COURSE_COMPLETION",
    courseId: null,
    requiresIssuedTranscript: true,
    requiresCourseCompleted: true,
    requiresNoPendingSubjects: true,
    requiresFinancialClearance: false,
    requiresManualApproval: false,
    autoIssueOnTranscriptIssued: false,
    staleAction: "MARK_STALE",
    validityMonths: null,
    status: "ACTIVE",
    deletedAt: null,
    ...overrides,
  });
}

function seedIssuedTranscript(overrides: { courseProgressStatus?: string } = {}): void {
  seed(h.db, "academicTranscript", {
    id: "tr-1",
    organizationId: ORG,
    studentId: "stu-1",
    courseId: "course-1",
    transcriptType: "COURSE_TRANSCRIPT",
    transcriptNumber: "TR-2026-000001",
  });
  seed(h.db, "academicTranscriptVersion", {
    id: "ver-1",
    organizationId: ORG,
    transcriptId: "tr-1",
    status: "ISSUED",
    checksum: "chk-1",
    issuedAt: new Date("2026-07-01T00:00:00.000Z"),
    issuedBy: "user-1",
    studentSnapshot: JSON.stringify({ studentId: "stu-1", fullName: "João Silva" }),
    courseSnapshot: JSON.stringify({
      course: { courseId: "course-1", enrollmentId: "enr-1", courseName: "Curso" },
      courseProgress: { status: overrides.courseProgressStatus ?? "COMPLETED" },
    }),
  });
}

function run(
  input: Partial<{ transcriptVersionId: string; certificateType: string; policyId: string; courseId: string; reason: string }> = {},
  context: ServiceContext = ctx
) {
  return new GenerateCertificateCommand(
    { transcriptVersionId: "ver-1", certificateType: "COURSE_COMPLETION", ...input },
    context
  ).run();
}

beforeEach(() => {
  vi.clearAllMocks();
  h.db = makeFakeDb();
  authState.allow = true;
});
afterEach(() => {
  vi.restoreAllMocks();
});

// ─── Eligibility branching ────────────────────────────────────────────────────

describe("GenerateCertificateCommand — eligibility branching", () => {
  it("1. eligible, no manual approval → creates DRAFT", async () => {
    seedPolicy();
    seedIssuedTranscript();
    const result = await run();
    expect(result.status).toBe("DRAFT");
    expect(result.requiresApproval).toBe(false);
    expect(result.blockingReasons).toEqual([]);
    expect(store("certificate")).toHaveLength(1);
    expect((store("certificate")[0] as { status: string }).status).toBe("DRAFT");
  });

  it("2. eligible + requiresApproval → creates PENDING_APPROVAL", async () => {
    seedPolicy({ requiresManualApproval: true });
    seedIssuedTranscript();
    const result = await run();
    expect(result.status).toBe("PENDING_APPROVAL");
    expect(result.requiresApproval).toBe(true);
    expect(result.warnings).toContain(W.MANUAL_APPROVAL_REQUIRED_WARNING);
    expect((store("certificate")[0] as { status: string }).status).toBe("PENDING_APPROVAL");
  });

  it("3. ineligible → throws BusinessRuleError and creates nothing", async () => {
    seedPolicy(); // requiresCourseCompleted = true
    seedIssuedTranscript({ courseProgressStatus: "IN_PROGRESS" });
    await expect(run()).rejects.toBeInstanceOf(BusinessRuleError);
    expect(store("certificate")).toHaveLength(0);
  });

  it("4. missing policy → throws with POLICY_NOT_FOUND", async () => {
    seedIssuedTranscript();
    const err = await run().catch((e) => e);
    expect(err).toBeInstanceOf(BusinessRuleError);
    expect((err as BusinessRuleError).details?.blockingReasons).toContain(B.POLICY_NOT_FOUND);
    expect(store("certificate")).toHaveLength(0);
  });

  it("5. missing transcript → throws with TRANSCRIPT_NOT_ISSUED", async () => {
    seedPolicy();
    // no transcript seeded → ACL returns null
    const err = await run().catch((e) => e);
    expect(err).toBeInstanceOf(BusinessRuleError);
    expect((err as BusinessRuleError).details?.blockingReasons).toContain(B.TRANSCRIPT_NOT_ISSUED);
    expect(store("certificate")).toHaveLength(0);
  });

  it("6. multiple blockers are returned in the error metadata", async () => {
    seedPolicy({ requiresFinancialClearance: true }); // + requiresCourseCompleted
    seedIssuedTranscript({ courseProgressStatus: "IN_PROGRESS" });
    const err = (await run().catch((e) => e)) as BusinessRuleError;
    const reasons = err.details?.blockingReasons as string[];
    expect(reasons).toContain(B.COURSE_NOT_COMPLETED);
    expect(reasons).toContain(B.FINANCIAL_CLEARANCE_REQUIRED);
    expect(reasons.length).toBeGreaterThanOrEqual(2);
  });
});

// ─── Persistence ────────────────────────────────────────────────────────────

describe("GenerateCertificateCommand — persistence", () => {
  it("11. snapshots student / course / issue-basis", async () => {
    seedPolicy();
    seedIssuedTranscript();
    await run();
    const cert = store("certificate")[0] as Record<string, string>;
    expect(JSON.parse(cert.studentSnapshot)).toMatchObject({ studentId: "stu-1", fullName: "João Silva" });
    expect(JSON.parse(cert.courseSnapshot)).toMatchObject({ courseId: "course-1", enrollmentId: "enr-1" });
    const basis = JSON.parse(cert.issueBasisSnapshot);
    expect(basis).toMatchObject({
      transcriptVersionId: "ver-1",
      transcriptNumber: "TR-2026-000001",
      transcriptChecksum: "chk-1",
      transcriptType: "COURSE_TRANSCRIPT",
      certificateType: "COURSE_COMPLETION",
    });
    expect(basis.eligibilityResult).toMatchObject({ eligible: true, requiresApproval: false });
    expect(basis.eligibilityResult.blockingReasons).toEqual([]);
    expect(basis.policy).toMatchObject({ id: expect.any(String) });
  });

  it("12. derives identity + copies transcriptNumber/checksum exactly", async () => {
    seedPolicy();
    seedIssuedTranscript();
    await run();
    const cert = store("certificate")[0] as Record<string, unknown>;
    expect(cert.studentId).toBe("stu-1");
    expect(cert.enrollmentId).toBe("enr-1");
    expect(cert.courseId).toBe("course-1");
    expect(cert.transcriptNumber).toBe("TR-2026-000001");
    expect(cert.transcriptChecksum).toBe("chk-1");
  });

  it("13. stores the financial-clearance snapshot (NOT_REQUIRED when none)", async () => {
    seedPolicy();
    seedIssuedTranscript();
    await run();
    const cert = store("certificate")[0] as Record<string, unknown>;
    expect(cert.financialClearanceStatus).toBe("NOT_REQUIRED");
    expect(cert.financialClearanceCheckedAt ?? null).toBeNull();
    expect(cert.financialClearanceReference ?? null).toBeNull();
  });

  it("14/15/16. certificateNumber, checksum and verificationCode remain null", async () => {
    seedPolicy();
    seedIssuedTranscript();
    await run();
    const cert = store("certificate")[0] as Record<string, unknown>;
    expect(cert.certificateNumber ?? null).toBeNull();
    expect(cert.checksum ?? null).toBeNull();
    expect(cert.verificationCode ?? null).toBeNull();
    expect(cert.certificateTemplateId ?? null).toBeNull();
    expect(cert.issuedAt ?? null).toBeNull();
  });

  it("17. creates no verification row", async () => {
    seedPolicy();
    seedIssuedTranscript();
    await run();
    expect(store("certificateVerification")).toHaveLength(0);
  });

  it("18. duplicate active certificate blocks (CERTIFICATE_ALREADY_ISSUED)", async () => {
    seedPolicy();
    seedIssuedTranscript();
    seed(h.db, "certificate", {
      organizationId: ORG,
      transcriptVersionId: "ver-1",
      certificateType: "COURSE_COMPLETION",
      status: "DRAFT",
      deletedAt: null,
    });
    const err = (await run().catch((e) => e)) as BusinessRuleError;
    expect(err).toBeInstanceOf(BusinessRuleError);
    expect(err.details?.blockingReasons).toContain(B.CERTIFICATE_ALREADY_ISSUED);
    // no NEW certificate persisted (only the pre-seeded one remains)
    expect(store("certificate")).toHaveLength(1);
  });

  it("19. a REVOKED/STALE prior certificate does not block", async () => {
    seedPolicy();
    seedIssuedTranscript();
    seed(h.db, "certificate", {
      organizationId: ORG, transcriptVersionId: "ver-1", certificateType: "COURSE_COMPLETION", status: "REVOKED", deletedAt: null,
    });
    seed(h.db, "certificate", {
      organizationId: ORG, transcriptVersionId: "ver-1", certificateType: "COURSE_COMPLETION", status: "STALE", deletedAt: null,
    });
    const result = await run();
    expect(result.status).toBe("DRAFT");
    // the two inactive rows + the new DRAFT
    expect(store("certificate")).toHaveLength(3);
  });
});

// ─── Transaction / rollback (Phase 4 performs a single terminal write) ─────────

describe("GenerateCertificateCommand — transaction", () => {
  it("20. a failure during create leaves no certificate", async () => {
    seedPolicy();
    seedIssuedTranscript();
    h.db.certificate.create = async () => {
      throw new Error("db down");
    };
    await expect(run()).rejects.toThrow("db down");
    expect(store("certificate")).toHaveLength(0);
  });

  it("21. a failure after the duplicate check leaves no NEW certificate", async () => {
    seedPolicy();
    seedIssuedTranscript();
    // an inactive prior row so the duplicate check runs and passes (returns null)
    seed(h.db, "certificate", {
      organizationId: ORG, transcriptVersionId: "ver-1", certificateType: "COURSE_COMPLETION", status: "REVOKED", deletedAt: null,
    });
    h.db.certificate.create = async () => {
      throw new Error("write failed");
    };
    await expect(run()).rejects.toThrow("write failed");
    expect(store("certificate")).toHaveLength(1); // only the pre-seeded REVOKED row
  });

  it("22. no partial certificate is ever persisted", async () => {
    seedPolicy();
    seedIssuedTranscript();
    h.db.certificate.create = async () => {
      throw new Error("boom");
    };
    await run().catch(() => undefined);
    expect(store("certificate")).toHaveLength(0);
  });
});

// ─── Authorization & tenant scoping ────────────────────────────────────────────

describe("GenerateCertificateCommand — authorization", () => {
  it("23. requires certificates.generate", async () => {
    seedPolicy();
    seedIssuedTranscript();
    authState.allow = false;
    await expect(run()).rejects.toBeInstanceOf(AuthorizationError);
    expect(store("certificate")).toHaveLength(0);
  });

  it("24. cross-tenant transcript is invisible (blocked by source scoping)", async () => {
    seedPolicy();
    seedIssuedTranscript(); // seeded under ORG
    const err = await run({}, { userId: "u-2", organizationId: OTHER_ORG }).catch((e) => e);
    // org-B cannot see org-A's transcript → engine blocks TRANSCRIPT_NOT_ISSUED
    expect(err).toBeInstanceOf(BusinessRuleError);
    expect((err as BusinessRuleError).details?.blockingReasons).toContain(B.TRANSCRIPT_NOT_ISSUED);
    expect(store("certificate")).toHaveLength(0);
  });

  it("rejects an unsupported certificateType (ValidationError)", async () => {
    seedPolicy();
    seedIssuedTranscript();
    await expect(run({ certificateType: "NOT_A_TYPE" })).rejects.toBeInstanceOf(ValidationError);
  });

  it("rejects unexpected input fields (strict schema — e.g. organizationId)", async () => {
    const cmd = new GenerateCertificateCommand(
      { transcriptVersionId: "ver-1", certificateType: "COURSE_COMPLETION", organizationId: "hack" } as never,
      ctx
    );
    await expect(cmd.run()).rejects.toBeInstanceOf(ValidationError);
  });
});

// ─── Architecture guards (static; tests 7–10, 25–36) ───────────────────────────

describe("GenerateCertificateCommand — architecture guards", () => {
  const SRC = readFileSync(
    join(process.cwd(), "src", "modules", "certificates", "commands", "generate-certificate.command.ts"),
    "utf8"
  );

  it("25. imports CertificateEligibilitySource", () => {
    expect(SRC).toMatch(/certificate-eligibility-source/);
    expect(SRC).toMatch(/loadCertificateEligibilityFacts/);
  });

  it("26. imports CertificateEligibilityEngine", () => {
    expect(SRC).toMatch(/certificate-eligibility\.engine/);
    expect(SRC).toMatch(/evaluateCertificateEligibility/);
  });

  it("27. does NOT import the Transcript ACL directly", () => {
    expect(SRC).not.toMatch(/certificate-transcript-source/);
  });

  it("28. does NOT import Transcript repositories / models", () => {
    expect(SRC).not.toMatch(/modules\/transcripts/);
    expect(SRC).not.toMatch(/AcademicTranscript/);
  });

  it("29. does NOT import Grade / Attendance / CourseCompletion", () => {
    expect(SRC).not.toMatch(/GradeCalculation|grade-calculation|modules\/grades/);
    expect(SRC).not.toMatch(/AttendanceCalculation|attendance-calculation|modules\/attendance/);
    expect(SRC).not.toMatch(/CourseCompletion|course-completion/);
  });

  it("30. does NOT import the certificate number allocator", () => {
    expect(SRC).not.toMatch(/certificate-number/);
    expect(SRC).not.toMatch(/allocateCertificateNumber/);
  });

  it("31. does NOT import the checksum utility", () => {
    expect(SRC).not.toMatch(/certificate-checksum/);
    expect(SRC).not.toMatch(/certificateContentChecksum|contentChecksum/);
  });

  it("32. does NOT import eventPublisher / auditService", () => {
    expect(SRC).not.toMatch(/eventPublisher|EventPublisher|publishDomainEvent/);
    expect(SRC).not.toMatch(/auditService|AuditService|recordAudit/);
  });

  it("33. does NOT import PDF / storage / UI", () => {
    expect(SRC).not.toMatch(/react-pdf|puppeteer|generatePdf|uploadthing|infrastructure\/storage/i);
    expect(SRC).not.toMatch(/from ["']react["']|@\/components\/|\.tsx["']/);
  });

  it("34 / 7. contains no policy.requires* branching", () => {
    expect(SRC).not.toMatch(/requiresManualApproval/);
    expect(SRC).not.toMatch(/requiresCourseCompleted/);
    expect(SRC).not.toMatch(/requiresFinancialClearance/);
    expect(SRC).not.toMatch(/requiresNoPendingSubjects/);
  });

  it("35 / 8. contains no transcript courseProgress status branching", () => {
    expect(SRC).not.toMatch(/courseProgressSnapshot\??\.status/);
    expect(SRC).not.toMatch(/courseProgress\.status/);
  });

  it("36 / 9. contains no finance status branching", () => {
    expect(SRC).not.toMatch(/financialClearance\??\.status\s*[!=]==/);
  });

  it("10. branches only on the result contract (result.eligible / result.requiresApproval)", () => {
    expect(SRC).toMatch(/result\.eligible/);
    expect(SRC).toMatch(/result\.requiresApproval/);
  });
});
