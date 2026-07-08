import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// =============================================================================
// Bulk certificate routes — Phase 13 (delegation + auth mapping)
// -----------------------------------------------------------------------------
// Each route delegates to the matching bulk command and returns its
// BulkOperationResult (200); item failures never surface as an error status.
// =============================================================================

const auth = vi.hoisted(() => ({ ctx: null as unknown, fail: false }));
const cmd = vi.hoisted(() => ({ captured: [] as Array<{ name: string; input: unknown }>, throwErr: null as unknown }));

vi.mock("@/server/auth/context", () => ({
  requireOrganization: vi.fn(async () => {
    if (auth.fail) throw new Error("unauth");
    return auth.ctx;
  }),
}));

const makeMock = vi.hoisted(() => (name: string) => class {
  input: unknown;
  constructor(input: unknown) {
    this.input = input;
  }
  async run() {
    if (cmd.throwErr) throw cmd.throwErr;
    cmd.captured.push({ name, input: this.input });
    return { total: 0, succeeded: 0, failed: 0, skipped: 0, items: [] };
  }
});
vi.mock("@/modules/certificates/commands/bulk-certificate.commands", () => ({
  BulkGenerateCertificatesCommand: makeMock("Generate"),
  BulkIssueCertificatesCommand: makeMock("Issue"),
  BulkExportCertificatesCommand: makeMock("Export"),
  BulkRevokeCertificatesCommand: makeMock("Revoke"),
  BulkSuspendCertificatesCommand: makeMock("Suspend"),
  BulkRestoreCertificatesCommand: makeMock("Restore"),
}));

import { AuthorizationError, ValidationError } from "@/shared/lib/command";
import { POST as generatePOST } from "../generate/route";
import { POST as issuePOST } from "../issue/route";
import { POST as exportPOST } from "../export/route";
import { POST as revokePOST } from "../revoke/route";
import { POST as suspendPOST } from "../suspend/route";
import { POST as restorePOST } from "../restore/route";

const CTX = { userId: "u-1", organizationId: "org-A", roles: [], ability: { can: () => true } };
const body = (b: unknown) => new Request("http://x", { method: "POST", body: JSON.stringify(b) });

beforeEach(() => {
  vi.clearAllMocks();
  auth.ctx = CTX;
  auth.fail = false;
  cmd.captured.length = 0;
  cmd.throwErr = null;
});
afterEach(() => vi.restoreAllMocks());

describe("bulk routes delegate to the matching bulk command", () => {
  it.each([
    ["generate", generatePOST, "Generate"],
    ["issue", issuePOST, "Issue"],
    ["export", exportPOST, "Export"],
    ["revoke", revokePOST, "Revoke"],
    ["suspend", suspendPOST, "Suspend"],
    ["restore", restorePOST, "Restore"],
  ])("POST bulk/%s → %s command (200)", async (_op, handler, name) => {
    const res = await (handler as (r: Request) => Promise<Response>)(body({ items: [{ certificateId: "c1" }] }));
    expect(res.status).toBe(200);
    expect(cmd.captured.at(-1)?.name).toBe(name);
  });

  it("→ 401 when unauthenticated (command not constructed)", async () => {
    auth.fail = true;
    const res = await issuePOST(body({ items: [] }));
    expect(res.status).toBe(401);
    expect(cmd.captured).toHaveLength(0);
  });

  it("maps a command AuthorizationError → 403", async () => {
    cmd.throwErr = new AuthorizationError();
    const res = await issuePOST(body({ items: [{ certificateId: "c1" }] }));
    expect(res.status).toBe(403);
  });

  it("maps a command ValidationError → 422", async () => {
    cmd.throwErr = new ValidationError("bad");
    const res = await issuePOST(body({ items: [] }));
    expect(res.status).toBe(422);
  });
});
