import { beforeEach, describe, expect, it, vi } from "vitest";

// =============================================================================
// GET /api/certificates/exports/:exportId/download — HTTP contract tests (8C)
// -----------------------------------------------------------------------------
// Asserts the route's HTTP contract, not the service internals (covered by
// certificate-export-download.service.test.ts). Only two collaborators are mocked:
// `requireOrganization` (auth context / 401) and the download service. Verifies the
// download headers, the typed-error → status mapping (401/403/404/409/500), and that
// the artifact bytes are streamed in the body.
// =============================================================================

const requireOrganization = vi.fn();
const download = vi.fn();

vi.mock("@/server/auth/context", () => ({
  requireOrganization: (...a: unknown[]) => requireOrganization(...a),
}));
vi.mock("@/modules/certificates/services/certificate-export-download.service", () => ({
  certificateExportDownloadService: { download: (...a: unknown[]) => download(...a) },
}));

import { AuthorizationError, BusinessRuleError, NotFoundError } from "@/shared/lib/command";
import { GET } from "../route";

const CTX = { userId: "u-1", organizationId: "org-A", roles: [], ability: { can: () => true } };
const PDF = Buffer.from("%PDF-1.4 body-bytes");
const RESULT = {
  buffer: PDF,
  contentType: "application/pdf",
  certificateNumber: "CERT-2026-000042",
  fileChecksum: "filechk-abc123",
};

function call(exportId = "exp-1") {
  return GET({} as Request, { params: Promise.resolve({ exportId }) });
}

beforeEach(() => {
  requireOrganization.mockReset();
  download.mockReset();
  requireOrganization.mockResolvedValue(CTX);
  download.mockResolvedValue(RESULT);
});

describe("GET .../download — success & headers", () => {
  it("20. streams the artifact bytes in the body", async () => {
    const res = await call();
    expect(res.status).toBe(200);
    const body = Buffer.from(await res.arrayBuffer());
    expect(body.equals(PDF)).toBe(true);
  });

  it("21. Content-Type is application/pdf", async () => {
    const res = await call();
    expect(res.headers.get("Content-Type")).toBe("application/pdf");
  });

  it("22. Content-Disposition is an attachment with a safe filename", async () => {
    const res = await call();
    expect(res.headers.get("Content-Disposition")).toBe(
      'attachment; filename="CERT-2026-000042.pdf"'
    );
  });

  it("22b. an unsafe certificate number is sanitized in the filename", async () => {
    download.mockResolvedValue({ ...RESULT, certificateNumber: 'a/b"c\\d' });
    const res = await call();
    expect(res.headers.get("Content-Disposition")).toBe('attachment; filename="a_b_c_d.pdf"');
  });

  it("23. Cache-Control is private, no-store", async () => {
    const res = await call();
    expect(res.headers.get("Cache-Control")).toBe("private, no-store");
  });

  it("24. X-Content-Type-Options is nosniff", async () => {
    const res = await call();
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
  });

  it("25. ETag is derived from the file checksum when present", async () => {
    const res = await call();
    expect(res.headers.get("ETag")).toBe('"filechk-abc123"');
  });

  it("25b. no ETag when the file checksum is absent", async () => {
    download.mockResolvedValue({ ...RESULT, fileChecksum: null });
    const res = await call();
    expect(res.headers.get("ETag")).toBeNull();
  });
});

describe("GET .../download — status mapping", () => {
  it("1. unauthenticated → 401 (no service call)", async () => {
    requireOrganization.mockRejectedValue(new Error("Não autenticado"));
    const res = await call();
    expect(res.status).toBe(401);
    expect(download).not.toHaveBeenCalled();
  });

  it("AuthorizationError → 403", async () => {
    download.mockRejectedValue(new AuthorizationError());
    const res = await call();
    expect(res.status).toBe(403);
  });

  it("NotFoundError → 404", async () => {
    download.mockRejectedValue(new NotFoundError("CertificateExport", "exp-1"));
    const res = await call();
    expect(res.status).toBe(404);
  });

  it("BusinessRuleError (owner, not ready) → 409", async () => {
    download.mockRejectedValue(new BusinessRuleError("EXPORT_NOT_READY"));
    const res = await call();
    expect(res.status).toBe(409);
  });

  it("19. an unexpected/storage error → generic 500 (no path leak)", async () => {
    download.mockRejectedValue(new Error("ENOENT: /uploads/certificates/org-A/cert-1/exp-1.pdf"));
    const res = await call();
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body).toEqual({ error: "Erro interno no servidor" });
    expect(JSON.stringify(body)).not.toMatch(/uploads|ENOENT|cert-1/);
  });
});
