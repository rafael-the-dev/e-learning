import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// =============================================================================
// Student certificate routes — Phase 10 (list + own-scoped download)
// -----------------------------------------------------------------------------
// The download route is a student-namespaced alias over the Phase 8C download
// service (which enforces own-scope). Asserts delegation, byte streaming + headers,
// and the typed-error → status mapping.
// =============================================================================

const auth = vi.hoisted(() => ({ ctx: null as unknown, fail: false }));

vi.mock("@/server/auth/context", () => ({
  requireOrganization: vi.fn(async () => {
    if (auth.fail) throw new Error("unauth");
    return auth.ctx;
  }),
}));

const listMock = vi.hoisted(() => ({ fn: vi.fn() }));
const downloadMock = vi.hoisted(() => ({ fn: vi.fn() }));
vi.mock("@/modules/certificates/services/certificate-student-read.service", () => ({
  certificateStudentReadService: { list: (...a: unknown[]) => listMock.fn(...a), getDetail: vi.fn() },
}));
vi.mock("@/modules/certificates/services/certificate-export-download.service", () => ({
  certificateExportDownloadService: { download: (...a: unknown[]) => downloadMock.fn(...a) },
}));

import { AuthorizationError, NotFoundError } from "@/shared/lib/command";
import { GET as listGET } from "../route";
import { GET as downloadGET } from "../exports/[exportId]/download/route";

const CTX = { userId: "u-1", organizationId: "org-A", roles: [], ability: { can: () => true } };
const PDF = Buffer.from("%PDF-1.4 own-bytes");
const dlParams = (exportId = "exp-1") => ({ params: Promise.resolve({ exportId }) });

beforeEach(() => {
  vi.clearAllMocks();
  auth.ctx = CTX;
  auth.fail = false;
  listMock.fn.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 20 });
  downloadMock.fn.mockResolvedValue({
    buffer: PDF, contentType: "application/pdf", certificateNumber: "CERT-2026-000042", fileChecksum: "chk",
  });
});
afterEach(() => vi.restoreAllMocks());

describe("GET /api/student/certificates", () => {
  it("11. delegates to the student read service (own scope)", async () => {
    const res = await listGET(new Request("http://x/api/student/certificates?status=ISSUED"));
    expect(res.status).toBe(200);
    expect(listMock.fn).toHaveBeenCalledTimes(1);
  });

  it("→ 401 when unauthenticated", async () => {
    auth.fail = true;
    const res = await listGET(new Request("http://x/api/student/certificates"));
    expect(res.status).toBe(401);
  });
});

describe("GET /api/student/certificates/exports/:id/download", () => {
  it("14. streams the student's own READY export with safe headers", async () => {
    const res = await downloadGET(new Request("http://x"), dlParams("exp-1"));
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/pdf");
    expect(res.headers.get("Content-Disposition")).toBe('attachment; filename="CERT-2026-000042.pdf"');
    expect(res.headers.get("Cache-Control")).toBe("private, no-store");
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
    const body = Buffer.from(await res.arrayBuffer());
    expect(body.equals(PDF)).toBe(true);
  });

  it("15. another student's export is denied (service AuthorizationError → 403)", async () => {
    downloadMock.fn.mockRejectedValue(new AuthorizationError());
    const res = await downloadGET(new Request("http://x"), dlParams("exp-other"));
    expect(res.status).toBe(403);
  });

  it("an unknown export → 404", async () => {
    downloadMock.fn.mockRejectedValue(new NotFoundError("CertificateExport", "exp-x"));
    const res = await downloadGET(new Request("http://x"), dlParams("exp-x"));
    expect(res.status).toBe(404);
  });
});
