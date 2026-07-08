import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeFakeDb, seed, type FakeDb } from "../../repositories/__tests__/_fake-db";

// =============================================================================
// Certificate portal read services — Phase 10 tests
// -----------------------------------------------------------------------------
// Real repositories + mappers over the fake DB; student scope is mocked. Covers
// admin list/detail (org-scoped, allowedActions, cross-tenant), student own-scope
// (list/detail, cannot see others), DTO privacy (student redaction, admin no raw
// unsafe fields), server-computed allowedActions, and guardian denial-by-default.
// =============================================================================

const h = vi.hoisted(() => ({ db: null as unknown as FakeDb }));
const scope = vi.hoisted(() => ({
  isStudentScoped: false as boolean,
  studentId: undefined as string | undefined,
}));

vi.mock("@/server/db", () => ({ getDb: vi.fn(async () => h.db) }));
vi.mock("@/server/auth/student-scope", () => ({
  resolveStudentScope: async () => ({
    isStudentScoped: scope.isStudentScoped,
    studentId: scope.studentId,
    userId: "u-1",
    organizationId: "org-A",
  }),
}));

import { AuthorizationError } from "@/shared/lib/command";
import { PERMISSIONS, SYSTEM_ROLES } from "@/server/auth/permissions";
import type { AuthContext } from "@/server/auth/context";
import { CertificateAdminReadService } from "../certificate-admin-read.service";
import { CertificateStudentReadService } from "../certificate-student-read.service";

const ORG = "org-A";
const OTHER_ORG = "org-B";

function ctx(opts: { roles?: string[]; perms?: string[]; org?: string } = {}): AuthContext {
  const perms = new Set(opts.perms ?? []);
  return {
    userId: "u-1",
    organizationId: opts.org ?? ORG,
    roles: opts.roles ?? [],
    ability: { can: (p: string) => perms.has(p) },
  } as unknown as AuthContext;
}

const ADMIN_PERMS = [
  PERMISSIONS.CERTIFICATES_VIEW,
  PERMISSIONS.CERTIFICATES_ISSUE,
  PERMISSIONS.CERTIFICATES_REVOKE,
  PERMISSIONS.CERTIFICATES_SUSPEND,
  PERMISSIONS.CERTIFICATES_EXPORT,
];
const adminCtx = (org = ORG) => ctx({ roles: [SYSTEM_ROLES.ORG_ADMIN], perms: ADMIN_PERMS, org });
const secretaryCtx = () =>
  ctx({ roles: [SYSTEM_ROLES.SECRETARY], perms: [PERMISSIONS.CERTIFICATES_VIEW, PERMISSIONS.CERTIFICATES_EXPORT] });

function studentCtx(studentId = "stu-1") {
  scope.isStudentScoped = true;
  scope.studentId = studentId;
  return ctx({ roles: [SYSTEM_ROLES.STUDENT], perms: [PERMISSIONS.CERTIFICATES_VIEW_OWN] });
}

function seedCert(id: string, o: Record<string, unknown> = {}): void {
  seed(h.db, "certificate", {
    id,
    organizationId: ORG,
    studentId: "stu-1",
    enrollmentId: "enr-1",
    courseId: "course-1",
    transcriptVersionId: "ver-1",
    transcriptNumber: "TR-2026-000001",
    transcriptChecksum: "tchk-1",
    certificateNumber: "CERT-2026-000001",
    certificateType: "COURSE_COMPLETION",
    status: "ISSUED",
    studentSnapshot: JSON.stringify({ studentId: "stu-1", fullName: "João Silva" }),
    courseSnapshot: JSON.stringify({ courseId: "course-1", courseName: "Curso A" }),
    issueBasisSnapshot: JSON.stringify({ secret: "should-not-leak", courseCompleted: true }),
    financialClearanceStatus: "NOT_REQUIRED",
    financialClearanceReference: "FIN-REF-SECRET",
    verificationCode: "vc-1",
    checksum: "cert-checksum-secret",
    issuedAt: new Date("2026-07-05T00:00:00.000Z"),
    issuedBy: "u-0",
    expiresAt: null,
    staleReason: null,
    staleDetectedAt: null,
    deletedAt: null,
    ...o,
  });
}
function seedVerification(certId: string, publicStatus = "VALID"): void {
  seed(h.db, "certificateVerification", {
    id: `v-${certId}`,
    organizationId: ORG,
    certificateId: certId,
    verificationCode: `vc-${certId}`,
    publicStatus,
    verificationCount: 0,
  });
}
function seedReadyExport(certId: string): void {
  seed(h.db, "certificateExport", {
    id: `x-${certId}`,
    organizationId: ORG,
    certificateId: certId,
    exportType: "PDF",
    status: "READY",
    fileUrl: "/uploads/certificates/org-A/x.pdf",
    fileChecksum: "filechk-secret",
    exportedAt: new Date("2026-07-06T00:00:00.000Z"),
  });
}

const admin = new CertificateAdminReadService();
const student = new CertificateStudentReadService();

beforeEach(() => {
  vi.clearAllMocks();
  h.db = makeFakeDb();
  scope.isStudentScoped = false;
  scope.studentId = undefined;
});
afterEach(() => vi.restoreAllMocks());

// ─── Admin (1–3, 21, 22) ─────────────────────────────────────────────────────
describe("CertificateAdminReadService", () => {
  it("1. admin lists certificates in the org", async () => {
    seedCert("c1"); seedVerification("c1"); seedReadyExport("c1");
    seedCert("c2", { status: "DRAFT", certificateNumber: null, issuedAt: null });
    const res = await admin.list(adminCtx());
    expect(res.total).toBe(2);
    expect(res.items.map((i) => i.id).sort()).toEqual(["c1", "c2"]);
  });

  it("2. secretary with certificates.view lists", async () => {
    seedCert("c1"); seedVerification("c1");
    const res = await admin.list(secretaryCtx());
    expect(res.items).toHaveLength(1);
    expect(res.items[0].publicStatus).toBe("VALID");
  });

  it("3. cross-tenant certificates are hidden", async () => {
    seedCert("c1"); // ORG
    const res = await admin.list(adminCtx(OTHER_ORG));
    expect(res.items).toHaveLength(0);
    expect(res.total).toBe(0);
  });

  it("without certificates.view is denied", async () => {
    seedCert("c1");
    await expect(admin.list(ctx({ perms: [] }))).rejects.toBeInstanceOf(AuthorizationError);
  });

  it("22. computes allowedActions from permission + status + export state", async () => {
    seedCert("issued"); seedVerification("issued"); seedReadyExport("issued");
    seedCert("draft", { id: "draft", status: "DRAFT" });
    seedCert("susp", { id: "susp", status: "SUSPENDED" });
    const res = await admin.list(adminCtx());
    const byId = Object.fromEntries(res.items.map((i) => [i.id, i.allowedActions]));

    expect(byId.issued).toMatchObject({ canRevoke: true, canSuspend: true, canExport: true, canDownload: true, canIssue: false, canRestore: false });
    expect(byId.draft).toMatchObject({ canIssue: true, canRevoke: false, canSuspend: false, canExport: false, canDownload: false });
    expect(byId.susp).toMatchObject({ canRestore: true, canRevoke: true, canSuspend: false, canExport: true });
  });

  it("secretary (no revoke/suspend/export) gets false lifecycle flags", async () => {
    seedCert("c1"); seedVerification("c1");
    const res = await admin.list(secretaryCtx());
    expect(res.items[0].allowedActions).toMatchObject({ canRevoke: false, canSuspend: false });
  });

  it("21. admin detail exposes no raw unsafe fields (fileUrl/storageKey/checksum/event metadata)", async () => {
    seedCert("c1"); seedVerification("c1"); seedReadyExport("c1");
    seed(h.db, "certificateEvent", {
      id: "e1", organizationId: ORG, certificateId: "c1", eventType: "certificate.exported",
      previousStatus: "ISSUED", newStatus: "ISSUED", actorId: "u-0", reason: null,
      metadata: JSON.stringify({ storageKey: "certificates/org-A/c1/x.pdf" }),
      createdAt: new Date("2026-07-06T00:00:00.000Z"),
    });
    const detail = await admin.getDetail(adminCtx(), "c1");
    expect(detail).not.toBeNull();
    const json = JSON.stringify(detail);
    expect(json).not.toMatch(/fileUrl|storageKey|filechk-secret/);
    expect(detail!.exports[0]).not.toHaveProperty("fileUrl");
    expect(detail!.exports[0]).not.toHaveProperty("fileChecksum");
    expect(detail!.events[0]).not.toHaveProperty("metadata");
    expect(detail!.events[0].eventType).toBe("certificate.exported");
  });

  it("detail is org-scoped (cross-tenant → null)", async () => {
    seedCert("c1"); seedVerification("c1");
    expect(await admin.getDetail(adminCtx(OTHER_ORG), "c1")).toBeNull();
  });
});

// ─── Admin filters (L1) ────────────────────────────────────────────────────────
describe("CertificateAdminReadService — filters (org-scoped)", () => {
  it("issuedFrom / issuedTo narrow results by issuedAt", async () => {
    seedCert("jan", { issuedAt: new Date("2026-01-15T00:00:00.000Z") });
    seedCert("jun", { issuedAt: new Date("2026-06-15T00:00:00.000Z") });
    seedCert("dec", { issuedAt: new Date("2026-12-15T00:00:00.000Z") });

    const fromMar = await admin.list(adminCtx(), { issuedFrom: new Date("2026-03-01T00:00:00.000Z") });
    expect(fromMar.items.map((i) => i.id).sort()).toEqual(["dec", "jun"]);
    expect(fromMar.total).toBe(2);

    const window = await admin.list(adminCtx(), {
      issuedFrom: new Date("2026-03-01T00:00:00.000Z"),
      issuedTo: new Date("2026-09-01T00:00:00.000Z"),
    });
    expect(window.items.map((i) => i.id)).toEqual(["jun"]);
    expect(window.total).toBe(1);
  });

  it("search filters by certificateNumber (contains)", async () => {
    seedCert("a", { certificateNumber: "CERT-2026-000042" });
    seedCert("b", { certificateNumber: "CERT-2026-000099" });
    const res = await admin.list(adminCtx(), { search: "0042" });
    expect(res.items.map((i) => i.id)).toEqual(["a"]);
    expect(res.total).toBe(1);
  });

  it("filters stay organization-scoped (a matching foreign-org row is not returned)", async () => {
    seedCert("mine", { certificateNumber: "CERT-2026-000042" });
    // A foreign-org row with the SAME number must not leak through the search filter.
    seed(h.db, "certificate", {
      id: "foreign", organizationId: OTHER_ORG, studentId: "stu-x",
      certificateNumber: "CERT-2026-000042", certificateType: "COURSE_COMPLETION", status: "ISSUED",
      studentSnapshot: "{}", issueBasisSnapshot: "{}", financialClearanceStatus: "NOT_REQUIRED",
      transcriptNumber: "TR-X", transcriptChecksum: "x", issuedAt: new Date("2026-07-05T00:00:00.000Z"),
      deletedAt: null,
    });
    const res = await admin.list(adminCtx(), { search: "0042" });
    expect(res.items.map((i) => i.id)).toEqual(["mine"]);
    expect(res.total).toBe(1);
  });
});

// ─── Student (11–16, 18–20) ──────────────────────────────────────────────────
describe("CertificateStudentReadService", () => {
  it("11. student lists only their OWN certificates", async () => {
    seedCert("mine", { studentId: "stu-1" }); seedVerification("mine");
    seedCert("theirs", { studentId: "stu-2" }); seedVerification("theirs");
    const res = await student.list(studentCtx("stu-1"));
    expect(res.items.map((i) => i.id)).toEqual(["mine"]);
  });

  it("M1. total is the full own-scoped count, not just the page length", async () => {
    seedCert("m1", { studentId: "stu-1" });
    seedCert("m2", { studentId: "stu-1" });
    seedCert("m3", { studentId: "stu-1" });
    seedCert("other", { studentId: "stu-2" }); // must not count toward the student's total
    const res = await student.list(studentCtx("stu-1"), { pageSize: 2 });
    expect(res.items).toHaveLength(2); // one page
    expect(res.total).toBe(3); // full own-scoped count
    expect(res.pageSize).toBe(2);
  });

  it("12. student cannot see another student's certificate in the list", async () => {
    seedCert("theirs", { studentId: "stu-2" });
    const res = await student.list(studentCtx("stu-1"));
    expect(res.items).toHaveLength(0);
  });

  it("13. student detail is own-only (another student's id → null)", async () => {
    seedCert("mine", { studentId: "stu-1" }); seedVerification("mine");
    seedCert("theirs", { studentId: "stu-2" }); seedVerification("theirs");
    expect(await student.getDetail(studentCtx("stu-1"), "mine")).not.toBeNull();
    expect(await student.getDetail(studentCtx("stu-1"), "theirs")).toBeNull();
  });

  it("16. student cannot manage — all lifecycle flags false, download follows export", async () => {
    seedCert("mine", { studentId: "stu-1" }); seedVerification("mine"); seedReadyExport("mine");
    const res = await student.list(studentCtx("stu-1"));
    expect(res.items[0].allowedActions).toEqual({
      canIssue: false, canRevoke: false, canSuspend: false, canRestore: false, canExport: false, canDownload: true,
    });
  });

  it("without certificates.viewOwn is denied", async () => {
    seedCert("mine", { studentId: "stu-1" });
    scope.isStudentScoped = true; scope.studentId = "stu-1";
    await expect(student.list(ctx({ roles: [SYSTEM_ROLES.STUDENT], perms: [] }))).rejects.toBeInstanceOf(AuthorizationError);
  });

  it("a non-student-scoped caller is denied", async () => {
    seedCert("mine", { studentId: "stu-1" });
    scope.isStudentScoped = false;
    await expect(student.list(ctx({ perms: [PERMISSIONS.CERTIFICATES_VIEW_OWN] }))).rejects.toBeInstanceOf(AuthorizationError);
  });

  it("18/19/20. student detail hides audit/events, checksums, transcript pointer, finance reference", async () => {
    seedCert("mine", { studentId: "stu-1" }); seedVerification("mine"); seedReadyExport("mine");
    seed(h.db, "certificateEvent", { id: "e1", organizationId: ORG, certificateId: "mine", eventType: "certificate.issued", createdAt: new Date() });
    const detail = await student.getDetail(studentCtx("stu-1"), "mine");
    expect(detail).not.toBeNull();
    const json = JSON.stringify(detail);
    expect(json).not.toMatch(/cert-checksum-secret|tchk-1|FIN-REF-SECRET|filechk-secret|fileUrl|storageKey/);
    expect(detail).not.toHaveProperty("events");
    expect(detail).not.toHaveProperty("transcriptNumber");
    expect(detail).not.toHaveProperty("financialClearanceStatus");
    expect(detail!.exports[0]).not.toHaveProperty("fileChecksum");
    // safe display fields still present
    expect(detail!.studentName).toBe("João Silva");
    expect(detail!.courseName).toBe("Curso A");
  });
});

// ─── Guardian (17) ────────────────────────────────────────────────────────────
describe("Guardian certificate access is deferred (denied by default)", () => {
  it("17. a guardian (no certificates.view, not student-scoped) is denied on both services", async () => {
    seedCert("c1", { studentId: "stu-1" });
    const guardian = ctx({ roles: [SYSTEM_ROLES.GUARDIAN], perms: [] });
    await expect(admin.list(guardian)).rejects.toBeInstanceOf(AuthorizationError);
    await expect(student.list(guardian)).rejects.toBeInstanceOf(AuthorizationError);
  });
});
