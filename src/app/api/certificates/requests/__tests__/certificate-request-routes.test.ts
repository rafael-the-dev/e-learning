import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// =============================================================================
// Certificate request routes — Phase 12 (delegation + auth mapping)
// -----------------------------------------------------------------------------
// Asserts each request route delegates to the correct command / read service and
// maps auth failures. Collaborators are mocked; behaviour, not implementation.
// =============================================================================

const auth = vi.hoisted(() => ({ ctx: null as unknown, fail: false }));
const cmd = vi.hoisted(() => ({ captured: [] as Array<{ name: string; input: unknown }> }));
const reads = vi.hoisted(() => ({ adminList: vi.fn(), studentList: vi.fn() }));

vi.mock("@/server/auth/context", () => ({
  requireOrganization: vi.fn(async () => {
    if (auth.fail) throw new Error("unauth");
    return auth.ctx;
  }),
}));

const makeMock = vi.hoisted(() => (name: string) => ({
  [name]: class {
    input: unknown;
    constructor(input: unknown) {
      this.input = input;
    }
    async run() {
      cmd.captured.push({ name, input: this.input });
      return { ok: name };
    }
  },
}));
vi.mock("@/modules/certificates/commands/request-certificate.command", () => makeMock("RequestCertificateCommand"));
vi.mock("@/modules/certificates/commands/approve-certificate-request.command", () => makeMock("ApproveCertificateRequestCommand"));
vi.mock("@/modules/certificates/commands/reject-certificate-request.command", () => makeMock("RejectCertificateRequestCommand"));
vi.mock("@/modules/certificates/commands/cancel-certificate-request.command", () => makeMock("CancelCertificateRequestCommand"));
vi.mock("@/modules/certificates/commands/fulfill-certificate-request.command", () => makeMock("FulfillCertificateRequestCommand"));
vi.mock("@/modules/certificates/services/certificate-request-read.service", () => ({
  certificateRequestAdminReadService: { list: (...a: unknown[]) => reads.adminList(...a) },
  certificateRequestStudentReadService: { list: (...a: unknown[]) => reads.studentList(...a) },
}));

import { GET as adminGET, POST as adminPOST } from "../route";
import { POST as approvePOST } from "../[id]/approve/route";
import { POST as rejectPOST } from "../[id]/reject/route";
import { POST as cancelPOST } from "../[id]/cancel/route";
import { POST as fulfillPOST } from "../[id]/fulfill/route";
import { GET as studentGET, POST as studentPOST } from "../../../student/certificates/requests/route";
import { POST as studentCancelPOST } from "../../../student/certificates/requests/[id]/cancel/route";

const CTX = { userId: "u-1", organizationId: "org-A", roles: [], ability: { can: () => true } };
const reqJson = (body: unknown) => new Request("http://x", { method: "POST", body: JSON.stringify(body) });
const params = (id = "req-1") => ({ params: Promise.resolve({ id }) });

beforeEach(() => {
  vi.clearAllMocks();
  auth.ctx = CTX;
  auth.fail = false;
  cmd.captured.length = 0;
  reads.adminList.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 20 });
  reads.studentList.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 20 });
});
afterEach(() => vi.restoreAllMocks());

describe("admin request routes", () => {
  it("GET delegates to the admin read service", async () => {
    const res = await adminGET(new Request("http://x/api/certificates/requests?status=PENDING"));
    expect(res.status).toBe(200);
    expect(reads.adminList).toHaveBeenCalledTimes(1);
  });

  it("POST create → RequestCertificateCommand (201)", async () => {
    const res = await adminPOST(reqJson({ certificateType: "COURSE_COMPLETION", studentId: "stu-9" }));
    expect(res.status).toBe(201);
    expect(cmd.captured.at(-1)?.name).toBe("RequestCertificateCommand");
    expect((cmd.captured.at(-1)?.input as Record<string, unknown>).studentId).toBe("stu-9");
  });

  it.each([
    ["approve", approvePOST, "ApproveCertificateRequestCommand"],
    ["reject", rejectPOST, "RejectCertificateRequestCommand"],
    ["cancel", cancelPOST, "CancelCertificateRequestCommand"],
    ["fulfill", fulfillPOST, "FulfillCertificateRequestCommand"],
  ])("POST %s → the right command with the path id", async (_label, handler, cmdName) => {
    await (handler as (r: Request, c: { params: Promise<{ id: string }> }) => Promise<Response>)(reqJson({ reason: "x" }), params("req-9"));
    expect(cmd.captured.at(-1)?.name).toBe(cmdName);
    expect((cmd.captured.at(-1)?.input as Record<string, unknown>).requestId).toBe("req-9");
  });

  it("→ 401 when unauthenticated (command not constructed)", async () => {
    auth.fail = true;
    const res = await approvePOST(reqJson({}), params());
    expect(res.status).toBe(401);
    expect(cmd.captured).toHaveLength(0);
  });
});

describe("student request routes", () => {
  it("GET delegates to the student read service", async () => {
    const res = await studentGET(new Request("http://x/api/student/certificates/requests"));
    expect(res.status).toBe(200);
    expect(reads.studentList).toHaveBeenCalledTimes(1);
  });

  it("POST create → RequestCertificateCommand without a studentId (self only)", async () => {
    await studentPOST(reqJson({ certificateType: "COURSE_COMPLETION", studentId: "stu-INJECT" }));
    expect(cmd.captured.at(-1)?.name).toBe("RequestCertificateCommand");
    // The student route never forwards a studentId — self is resolved in the command.
    expect((cmd.captured.at(-1)?.input as Record<string, unknown>).studentId).toBeUndefined();
  });

  it("POST cancel → CancelCertificateRequestCommand", async () => {
    await studentCancelPOST(reqJson({}), params("req-3"));
    expect(cmd.captured.at(-1)?.name).toBe("CancelCertificateRequestCommand");
    expect((cmd.captured.at(-1)?.input as Record<string, unknown>).requestId).toBe("req-3");
  });
});
