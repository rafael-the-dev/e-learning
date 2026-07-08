import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeFakeDb, seed, type FakeDb } from "../../repositories/__tests__/_fake-db";

// =============================================================================
// Certificate request workflow commands — Phase 12 tests
// -----------------------------------------------------------------------------
// Real request repository + audit service over the rollback-capable fake DB; RBAC,
// the students service, and GenerateCertificateCommand are mocked. Covers create
// (student/staff + duplicate), approve/reject/cancel/fulfill transitions, terminal
// guards, conditional-count aborts, authorization, cross-tenant, audit on success /
// none on rollback, and the Phase-12 architecture guards.
// =============================================================================

const h = vi.hoisted(() => ({ db: null as unknown as FakeDb }));
const rbac = vi.hoisted(() => ({ perms: new Set<string>(), roles: [] as string[] }));
const stu = vi.hoisted(() => ({ byUser: null as null | { id: string }, byIdThrows: false }));
const gen = vi.hoisted(() => ({
  calls: [] as Array<Record<string, unknown>>,
  result: { certificateId: "cert-new", status: "DRAFT" } as Record<string, unknown>,
  throws: null as unknown,
}));

vi.mock("@/server/db", () => ({ getDb: vi.fn(async () => h.db) }));
vi.mock("@/server/auth/rbac", () => ({
  getUserPermissions: vi.fn(async () => rbac.perms),
  getUserRoles: vi.fn(async () => rbac.roles),
  createAbility: (perms: Set<string>) => ({ can: (p: string) => perms.has(p) }),
}));
vi.mock("@/modules/students/services/student.service", () => ({
  getStudentByUserId: vi.fn(async () => stu.byUser),
  getStudentById: vi.fn(async (id: string) => {
    if (stu.byIdThrows) throw Object.assign(new Error(`Aluno ${id} not found`), { name: "NotFoundError" });
    return { id };
  }),
}));
vi.mock("../generate-certificate.command", () => ({
  GenerateCertificateCommand: class {
    constructor(public input: Record<string, unknown>) {
      gen.calls.push(input);
    }
    async run() {
      if (gen.throws) throw gen.throws;
      return gen.result;
    }
  },
}));

import { AuthorizationError, BusinessRuleError, NotFoundError, ValidationError } from "@/shared/lib/command";
import { PERMISSIONS, SYSTEM_ROLES } from "@/server/auth/permissions";
import type { ServiceContext } from "@/shared/types/common";
import { RequestCertificateCommand } from "../request-certificate.command";
import { ApproveCertificateRequestCommand } from "../approve-certificate-request.command";
import { RejectCertificateRequestCommand } from "../reject-certificate-request.command";
import { CancelCertificateRequestCommand } from "../cancel-certificate-request.command";
import { FulfillCertificateRequestCommand } from "../fulfill-certificate-request.command";

const ORG = "org-A";
const OTHER_ORG = "org-B";
const store = (name: string) => h.db[name].__store;
const req = () => store("certificateRequest")[0] as Record<string, unknown>;
const audits = (action: string) => store("auditLog").filter((a) => a.action === action);

const studentCtx: ServiceContext = { userId: "u-student", organizationId: ORG };
const staffCtx: ServiceContext = { userId: "u-staff", organizationId: ORG };

function asStudent(): void {
  rbac.roles = [SYSTEM_ROLES.STUDENT];
  rbac.perms = new Set([PERMISSIONS.CERTIFICATES_REQUEST]);
  stu.byUser = { id: "stu-1" };
}
function asStaff(): void {
  rbac.roles = [SYSTEM_ROLES.ORG_ADMIN];
  rbac.perms = new Set([PERMISSIONS.CERTIFICATES_GENERATE, PERMISSIONS.CERTIFICATES_REQUEST, PERMISSIONS.CERTIFICATES_VIEW]);
  stu.byUser = null;
}

function seedRequest(o: Record<string, unknown> = {}): void {
  seed(h.db, "certificateRequest", {
    id: "req-1", organizationId: ORG, studentId: "stu-1", transcriptVersionId: "ver-1",
    certificateType: "COURSE_COMPLETION", requestedBy: "u-student", status: "PENDING",
    reason: null, reviewedBy: null, reviewedAt: null, fulfilledCertificateId: null, deletedAt: null,
    ...o,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  h.db = makeFakeDb();
  rbac.perms = new Set();
  rbac.roles = [];
  stu.byUser = null;
  stu.byIdThrows = false;
  gen.calls.length = 0;
  gen.result = { certificateId: "cert-new", status: "DRAFT" };
  gen.throws = null;
});
afterEach(() => vi.restoreAllMocks());

// ─── Create (1–4) ─────────────────────────────────────────────────────────────
describe("RequestCertificateCommand", () => {
  it("1. a student creates their OWN request (studentId from session)", async () => {
    asStudent();
    const res = await new RequestCertificateCommand(
      { certificateType: "COURSE_COMPLETION", transcriptVersionId: "ver-1" },
      studentCtx
    ).run();
    expect(res.status).toBe("PENDING");
    expect(req().studentId).toBe("stu-1"); // resolved from the session
    expect(req().requestedBy).toBe("u-student");
    expect(audits("certificate_request.created")).toHaveLength(1);
  });

  it("1b. a student cannot request for ANOTHER student (studentId mismatch denied)", async () => {
    asStudent();
    await expect(
      new RequestCertificateCommand(
        { certificateType: "COURSE_COMPLETION", transcriptVersionId: "ver-1", studentId: "stu-OTHER" },
        studentCtx
      ).run()
    ).rejects.toBeInstanceOf(AuthorizationError);
  });

  it("2. staff creates a request FOR a student", async () => {
    asStaff();
    const res = await new RequestCertificateCommand(
      { certificateType: "COURSE_COMPLETION", transcriptVersionId: "ver-1", studentId: "stu-9" },
      staffCtx
    ).run();
    expect(res.status).toBe("PENDING");
    expect(req().studentId).toBe("stu-9");
  });

  it("staff must supply a studentId", async () => {
    asStaff();
    await expect(
      new RequestCertificateCommand({ certificateType: "COURSE_COMPLETION" }, staffCtx).run()
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("3. a duplicate active request is blocked", async () => {
    asStudent();
    seedRequest({ status: "PENDING", studentId: "stu-1", transcriptVersionId: "ver-1" });
    await expect(
      new RequestCertificateCommand({ certificateType: "COURSE_COMPLETION", transcriptVersionId: "ver-1" }, studentCtx).run()
    ).rejects.toBeInstanceOf(BusinessRuleError);
  });

  it("4. a terminal (REJECTED) request does NOT block a new request", async () => {
    asStudent();
    seedRequest({ id: "old", status: "REJECTED", studentId: "stu-1", transcriptVersionId: "ver-1" });
    const res = await new RequestCertificateCommand(
      { certificateType: "COURSE_COMPLETION", transcriptVersionId: "ver-1" },
      studentCtx
    ).run();
    expect(res.status).toBe("PENDING");
  });

  it("student without certificates.request is denied", async () => {
    asStudent();
    rbac.perms = new Set();
    await expect(
      new RequestCertificateCommand({ certificateType: "COURSE_COMPLETION" }, studentCtx).run()
    ).rejects.toBeInstanceOf(AuthorizationError);
  });
});

// ─── Approve / Reject (5–8) ─────────────────────────────────────────────────────
describe("Approve / Reject", () => {
  it("5. approve a PENDING request", async () => {
    asStaff(); seedRequest({ status: "PENDING" });
    const res = await new ApproveCertificateRequestCommand({ requestId: "req-1" }, staffCtx).run();
    expect(res.status).toBe("APPROVED");
    expect(req().status).toBe("APPROVED");
    expect(req().reviewedBy).toBe("u-staff");
    expect(audits("certificate_request.approved")).toHaveLength(1);
  });

  it("6. approve a non-PENDING request fails", async () => {
    asStaff(); seedRequest({ status: "APPROVED" });
    await expect(new ApproveCertificateRequestCommand({ requestId: "req-1" }, staffCtx).run()).rejects.toBeInstanceOf(BusinessRuleError);
  });

  it("approve requires certificates.generate", async () => {
    asStudent(); seedRequest({ status: "PENDING" });
    await expect(new ApproveCertificateRequestCommand({ requestId: "req-1" }, studentCtx).run()).rejects.toBeInstanceOf(AuthorizationError);
  });

  it("7. reject a PENDING request with a reason", async () => {
    asStaff(); seedRequest({ status: "PENDING" });
    const res = await new RejectCertificateRequestCommand({ requestId: "req-1", reason: "docs em falta" }, staffCtx).run();
    expect(res.status).toBe("REJECTED");
    expect(req().reason).toBe("docs em falta");
    expect(audits("certificate_request.rejected")).toHaveLength(1);
  });

  it("reject requires a reason", async () => {
    asStaff(); seedRequest({ status: "PENDING" });
    await expect(new RejectCertificateRequestCommand({ requestId: "req-1", reason: "" }, staffCtx).run()).rejects.toBeInstanceOf(ValidationError);
  });

  it("8. reject a non-PENDING request fails", async () => {
    asStaff(); seedRequest({ status: "APPROVED" });
    await expect(new RejectCertificateRequestCommand({ requestId: "req-1", reason: "x" }, staffCtx).run()).rejects.toBeInstanceOf(BusinessRuleError);
  });
});

// ─── Cancel (9–11) ──────────────────────────────────────────────────────────────
describe("Cancel", () => {
  it("9. a student cancels their OWN PENDING request", async () => {
    asStudent(); seedRequest({ status: "PENDING", requestedBy: "u-student" });
    const res = await new CancelCertificateRequestCommand({ requestId: "req-1" }, studentCtx).run();
    expect(res.status).toBe("CANCELLED");
    expect(audits("certificate_request.cancelled")).toHaveLength(1);
  });

  it("a student cannot cancel someone else's request", async () => {
    asStudent(); seedRequest({ status: "PENDING", requestedBy: "u-other" });
    await expect(new CancelCertificateRequestCommand({ requestId: "req-1" }, studentCtx).run()).rejects.toBeInstanceOf(AuthorizationError);
  });

  it("10. a student cannot cancel an APPROVED request", async () => {
    asStudent(); seedRequest({ status: "APPROVED", requestedBy: "u-student" });
    await expect(new CancelCertificateRequestCommand({ requestId: "req-1" }, studentCtx).run()).rejects.toBeInstanceOf(AuthorizationError);
  });

  it("11. staff cancels an APPROVED request", async () => {
    asStaff(); seedRequest({ status: "APPROVED", requestedBy: "u-student" });
    const res = await new CancelCertificateRequestCommand({ requestId: "req-1" }, staffCtx).run();
    expect(res.status).toBe("CANCELLED");
  });

  it("a terminal request cannot be cancelled", async () => {
    asStaff(); seedRequest({ status: "FULFILLED" });
    await expect(new CancelCertificateRequestCommand({ requestId: "req-1" }, staffCtx).run()).rejects.toBeInstanceOf(BusinessRuleError);
  });
});

// ─── Fulfill (12–15) ────────────────────────────────────────────────────────────
describe("Fulfill", () => {
  it("12/14. fulfill an APPROVED request calls Generate and marks FULFILLED", async () => {
    asStaff(); seedRequest({ status: "APPROVED", transcriptVersionId: "ver-1" });
    const res = await new FulfillCertificateRequestCommand({ requestId: "req-1" }, staffCtx).run();
    expect(gen.calls).toHaveLength(1);
    expect(gen.calls[0]).toMatchObject({ transcriptVersionId: "ver-1", certificateType: "COURSE_COMPLETION" });
    expect(res.status).toBe("FULFILLED");
    expect(res.fulfilledCertificateId).toBe("cert-new");
    expect(res.certificateStatus).toBe("DRAFT");
    expect(req().status).toBe("FULFILLED");
    expect(req().fulfilledCertificateId).toBe("cert-new");
    expect(audits("certificate_request.fulfilled")).toHaveLength(1);
  });

  it("13. if Generate fails, the request stays APPROVED and is not fulfilled", async () => {
    asStaff(); seedRequest({ status: "APPROVED", transcriptVersionId: "ver-1" });
    gen.throws = new BusinessRuleError("not eligible");
    await expect(new FulfillCertificateRequestCommand({ requestId: "req-1" }, staffCtx).run()).rejects.toBeInstanceOf(BusinessRuleError);
    expect(req().status).toBe("APPROVED");
    expect(req().fulfilledCertificateId).toBeNull();
    expect(audits("certificate_request.fulfilled")).toHaveLength(0);
  });

  it("15. fulfill a non-APPROVED request fails (Generate not called)", async () => {
    asStaff(); seedRequest({ status: "PENDING", transcriptVersionId: "ver-1" });
    await expect(new FulfillCertificateRequestCommand({ requestId: "req-1" }, staffCtx).run()).rejects.toBeInstanceOf(BusinessRuleError);
    expect(gen.calls).toHaveLength(0);
  });

  it("fulfill requires the request to carry a transcriptVersionId", async () => {
    asStaff(); seedRequest({ status: "APPROVED", transcriptVersionId: null });
    await expect(new FulfillCertificateRequestCommand({ requestId: "req-1" }, staffCtx).run()).rejects.toBeInstanceOf(BusinessRuleError);
    expect(gen.calls).toHaveLength(0);
  });
});

// ─── Cross-tenant + rollback (16–19) ─────────────────────────────────────────────
describe("cross-tenant, conditional aborts, rollback", () => {
  it("19. a cross-tenant request is NOT_FOUND (approve)", async () => {
    asStaff(); seedRequest({ status: "PENDING", organizationId: ORG });
    const otherCtx: ServiceContext = { userId: "u-x", organizationId: OTHER_ORG };
    await expect(new ApproveCertificateRequestCommand({ requestId: "req-1" }, otherCtx).run()).rejects.toBeInstanceOf(NotFoundError);
  });

  it("18. no audit is written when a transition aborts", async () => {
    asStaff(); seedRequest({ status: "REJECTED" });
    await expect(new ApproveCertificateRequestCommand({ requestId: "req-1" }, staffCtx).run()).rejects.toBeInstanceOf(BusinessRuleError);
    expect(store("auditLog")).toHaveLength(0);
  });
});

// ─── Architecture guards (27–32; static) ─────────────────────────────────────────
describe("Phase 12 architecture guards", () => {
  const DIR = join(process.cwd(), "src", "modules", "certificates", "commands");
  const APP = join(process.cwd(), "src", "app", "api");
  const COMMANDS = ["request", "approve", "reject", "cancel", "fulfill"].map((n) =>
    readFileSync(join(DIR, `${n}-certificate${n === "request" ? "" : "-request"}.command.ts`), "utf8")
  );
  const ROUTES = [
    join(APP, "certificates", "requests", "route.ts"),
    join(APP, "certificates", "requests", "[id]", "approve", "route.ts"),
    join(APP, "certificates", "requests", "[id]", "reject", "route.ts"),
    join(APP, "certificates", "requests", "[id]", "cancel", "route.ts"),
    join(APP, "certificates", "requests", "[id]", "fulfill", "route.ts"),
    join(APP, "student", "certificates", "requests", "route.ts"),
    join(APP, "student", "certificates", "requests", "[id]", "cancel", "route.ts"),
  ].map((p) => readFileSync(p, "utf8"));

  it("27/28/29. request commands import no Academic Core / Transcript / Eligibility engine", () => {
    COMMANDS.forEach((src) => {
      expect(src).not.toMatch(/modules\/(grades|attendance|assessments|academic|enrollments|transcripts)/);
      expect(src).not.toMatch(/AcademicTranscript|StudentCourseProgress/);
      expect(src).not.toMatch(/certificate-eligibility|evaluateCertificateEligibility|EligibilityEngine/);
    });
  });

  it("30. request commands implement no eligibility rule", () => {
    COMMANDS.forEach((src) => {
      expect(src).not.toMatch(/loadCertificateEligibilityFacts|blockingReasons|requiresApproval\s*[:=]/);
    });
  });

  it("32. no PDF / export / ministry logic in the request workflow", () => {
    COMMANDS.forEach((src) => {
      expect(src).not.toMatch(/certificate-pdf|react-pdf|export-certificate|ministry|CertificateExportStorage/i);
    });
  });

  it("31. request routes do not import repositories directly", () => {
    ROUTES.forEach((src) => {
      expect(src).not.toMatch(/modules\/certificates\/repositories/);
    });
  });
});
