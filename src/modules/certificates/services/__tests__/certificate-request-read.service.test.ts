import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeFakeDb, seed, type FakeDb } from "../../repositories/__tests__/_fake-db";

// =============================================================================
// Certificate request read services — Phase 12 tests
// -----------------------------------------------------------------------------
// Real request repository over the fake DB; student scope mocked. Covers admin
// list (org-scoped, filters, allowedActions), student own-scope list, guardian
// denial, and the pure allowedActions computation.
// =============================================================================

const h = vi.hoisted(() => ({ db: null as unknown as FakeDb }));
const scope = vi.hoisted(() => ({ isStudentScoped: false, studentId: undefined as string | undefined }));

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
import {
  CertificateRequestAdminReadService,
  CertificateRequestStudentReadService,
  computeRequestAllowedActions,
} from "../certificate-request-read.service";

const ORG = "org-A";
const OTHER_ORG = "org-B";

function ctx(opts: { roles?: string[]; perms?: string[]; org?: string; userId?: string } = {}): AuthContext {
  const perms = new Set(opts.perms ?? []);
  return {
    userId: opts.userId ?? "u-1",
    organizationId: opts.org ?? ORG,
    roles: opts.roles ?? [],
    ability: { can: (p: string) => perms.has(p) },
  } as unknown as AuthContext;
}

const adminCtx = (org = ORG) =>
  ctx({
    roles: [SYSTEM_ROLES.ORG_ADMIN],
    perms: [PERMISSIONS.CERTIFICATES_VIEW, PERMISSIONS.CERTIFICATES_GENERATE, PERMISSIONS.CERTIFICATES_REQUEST],
    org,
    userId: "u-staff",
  });
function studentCtx(studentId = "stu-1") {
  scope.isStudentScoped = true;
  scope.studentId = studentId;
  return ctx({ roles: [SYSTEM_ROLES.STUDENT], perms: [PERMISSIONS.CERTIFICATES_REQUEST], userId: "u-student" });
}

function seedReq(id: string, o: Record<string, unknown> = {}): void {
  seed(h.db, "certificateRequest", {
    id, organizationId: ORG, studentId: "stu-1", transcriptVersionId: "ver-1",
    certificateType: "COURSE_COMPLETION", requestedBy: "u-student", status: "PENDING",
    reason: null, reviewedBy: null, reviewedAt: null, fulfilledCertificateId: null, deletedAt: null,
    ...o,
  });
}

const admin = new CertificateRequestAdminReadService();
const student = new CertificateRequestStudentReadService();

beforeEach(() => {
  vi.clearAllMocks();
  h.db = makeFakeDb();
  scope.isStudentScoped = false;
  scope.studentId = undefined;
});
afterEach(() => vi.restoreAllMocks());

describe("CertificateRequestAdminReadService", () => {
  it("23. lists org requests with server-computed allowedActions", async () => {
    seedReq("pending", { status: "PENDING" });
    seedReq("approved", { status: "APPROVED", transcriptVersionId: "ver-1" });
    const res = await admin.list(adminCtx());
    expect(res.total).toBe(2);
    const byId = Object.fromEntries(res.items.map((i) => [i.requestId, i.allowedActions]));
    expect(byId.pending).toMatchObject({ canApprove: true, canReject: true, canCancel: true, canFulfill: false });
    expect(byId.approved).toMatchObject({ canApprove: false, canFulfill: true, canCancel: true });
  });

  it("cross-tenant requests are hidden", async () => {
    seedReq("mine");
    expect((await admin.list(adminCtx(OTHER_ORG))).items).toHaveLength(0);
  });

  it("24. status + studentId filters narrow results", async () => {
    seedReq("p1", { status: "PENDING", studentId: "stu-1" });
    seedReq("a1", { status: "APPROVED", studentId: "stu-1" });
    seedReq("p2", { status: "PENDING", studentId: "stu-2" });
    const res = await admin.list(adminCtx(), { status: "PENDING", studentId: "stu-1" });
    expect(res.items.map((i) => i.requestId)).toEqual(["p1"]);
  });

  it("without certificates.view is denied", async () => {
    seedReq("x");
    await expect(admin.list(ctx({ perms: [] }))).rejects.toBeInstanceOf(AuthorizationError);
  });
});

describe("CertificateRequestStudentReadService", () => {
  it("21/22. student sees only their OWN requests", async () => {
    seedReq("mine", { studentId: "stu-1" });
    seedReq("theirs", { studentId: "stu-2" });
    const res = await student.list(studentCtx("stu-1"));
    expect(res.items.map((i) => i.requestId)).toEqual(["mine"]);
    expect(res.total).toBe(1);
  });

  it("student allowedActions: only cancel a PENDING own request", async () => {
    seedReq("p", { studentId: "stu-1", status: "PENDING" });
    seedReq("a", { studentId: "stu-1", status: "APPROVED" });
    const res = await student.list(studentCtx("stu-1"));
    const byId = Object.fromEntries(res.items.map((i) => [i.requestId, i.allowedActions]));
    expect(byId.p).toMatchObject({ canCancel: true, canApprove: false, canReject: false, canFulfill: false });
    expect(byId.a).toMatchObject({ canCancel: false });
  });

  it("without certificates.request is denied", async () => {
    await expect(student.list(ctx({ roles: [SYSTEM_ROLES.STUDENT], perms: [] }))).rejects.toBeInstanceOf(AuthorizationError);
  });
});

describe("26. guardian is denied on both request read services", () => {
  it("guardian (no view, not student-scoped) is denied", async () => {
    seedReq("x");
    const guardian = ctx({ roles: [SYSTEM_ROLES.GUARDIAN], perms: [] });
    await expect(admin.list(guardian)).rejects.toBeInstanceOf(AuthorizationError);
    await expect(student.list(guardian)).rejects.toBeInstanceOf(AuthorizationError);
  });
});

describe("computeRequestAllowedActions (pure)", () => {
  const staff = { canReview: true, isRequester: false, canRequest: false };
  const requester = { canReview: false, isRequester: true, canRequest: true };

  it("staff can approve/reject/cancel a PENDING request", () => {
    expect(computeRequestAllowedActions("PENDING", "ver-1", staff)).toEqual({
      canApprove: true, canReject: true, canFulfill: false, canCancel: true,
    });
  });
  it("staff can fulfill/cancel an APPROVED request (fulfill needs a transcript version)", () => {
    expect(computeRequestAllowedActions("APPROVED", "ver-1", staff)).toMatchObject({ canFulfill: true, canCancel: true });
    expect(computeRequestAllowedActions("APPROVED", null, staff).canFulfill).toBe(false);
  });
  it("a requester can only cancel their own PENDING request", () => {
    expect(computeRequestAllowedActions("PENDING", "ver-1", requester)).toEqual({
      canApprove: false, canReject: false, canFulfill: false, canCancel: true,
    });
    expect(computeRequestAllowedActions("APPROVED", "ver-1", requester).canCancel).toBe(false);
  });
  it("terminal requests allow nothing", () => {
    for (const s of ["REJECTED", "FULFILLED", "CANCELLED"]) {
      expect(computeRequestAllowedActions(s, "ver-1", staff)).toEqual({
        canApprove: false, canReject: false, canFulfill: false, canCancel: false,
      });
    }
  });
});
