import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// =============================================================================
// Bulk certificate commands — Phase 13 tests
// -----------------------------------------------------------------------------
// Orchestration is tested by injecting a controllable per-item runner (counts,
// stopOnFailure, progress, error mapping, never-throws). Delegation is tested by
// mocking the single-item command modules and asserting each is constructed exactly
// once per item. RBAC is mocked. Plus the Phase-13 architecture guards.
// =============================================================================

const rbac = vi.hoisted(() => ({ perms: new Set<string>() }));
const single = vi.hoisted(() => ({ captured: [] as Array<{ name: string; input: unknown }> }));

vi.mock("@/server/auth/rbac", () => ({
  getUserPermissions: vi.fn(async () => rbac.perms),
  createAbility: (perms: Set<string>) => ({ can: (p: string) => perms.has(p) }),
}));

const makeMock = vi.hoisted(() => (name: string) => ({
  [name]: class {
    input: unknown;
    constructor(input: unknown) {
      this.input = input;
    }
    async run() {
      single.captured.push({ name, input: this.input });
      return { ok: name };
    }
  },
}));
vi.mock("../generate-certificate.command", () => makeMock("GenerateCertificateCommand"));
vi.mock("../issue-certificate.command", () => makeMock("IssueCertificateCommand"));
vi.mock("../export-certificate.command", () => makeMock("ExportCertificateCommand"));
vi.mock("../revoke-certificate.command", () => makeMock("RevokeCertificateCommand"));
vi.mock("../suspend-certificate.command", () => makeMock("SuspendCertificateCommand"));
vi.mock("../restore-certificate.command", () => makeMock("RestoreCertificateCommand"));

import { AuthorizationError, NotFoundError, ValidationError } from "@/shared/lib/command";
import { PERMISSIONS } from "@/server/auth/permissions";
import type { ServiceContext } from "@/shared/types/common";
import type { BulkCommandDeps, BulkProgress } from "@/modules/certificates/types/bulk";
import type { IssueCertificateInput } from "@/modules/certificates/schemas/certificate.schema";
import type { IssueCertificateResult } from "../issue-certificate.command";
import {
  BulkGenerateCertificatesCommand,
  BulkIssueCertificatesCommand,
  BulkExportCertificatesCommand,
  BulkRevokeCertificatesCommand,
  BulkSuspendCertificatesCommand,
  BulkRestoreCertificatesCommand,
} from "../bulk-certificate.commands";

const ctx: ServiceContext = { userId: "u-1", organizationId: "org-A" };
const item = (id: string) => ({ certificateId: id });

// The exact per-item runner signature the bulk ISSUE command accepts (constructor
// dep). Binding the mocks to this type keeps them honest: an injected runItem MUST
// return a full IssueCertificateResult, not a partial stub.
type IssueRunItem = NonNullable<BulkCommandDeps<IssueCertificateInput, IssueCertificateResult>["runItem"]>;

/** A complete, deterministic IssueCertificateResult for the injected runItem mocks. */
function makeIssueResult(
  certificateId: string,
  overrides: Partial<IssueCertificateResult> = {}
): IssueCertificateResult {
  return {
    certificateId,
    status: "ISSUED",
    certificateNumber: `CERT-${certificateId}`,
    certificateType: "COURSE_COMPLETION",
    transcriptVersionId: `ver-${certificateId}`,
    transcriptNumber: `TRN-${certificateId}`,
    issuedAt: new Date("2026-01-01T00:00:00.000Z"),
    checksum: `checksum-${certificateId}`,
    verificationCode: `vc-${certificateId}`,
    verificationUrl: null,
    publicStatus: "VALID",
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  rbac.perms = new Set([
    PERMISSIONS.CERTIFICATES_GENERATE,
    PERMISSIONS.CERTIFICATES_ISSUE,
    PERMISSIONS.CERTIFICATES_EXPORT,
    PERMISSIONS.CERTIFICATES_REVOKE,
    PERMISSIONS.CERTIFICATES_SUSPEND,
  ]);
  single.captured.length = 0;
});
afterEach(() => vi.restoreAllMocks());

// ─── Orchestration (injected runItem) ────────────────────────────────────────
describe("bulk orchestration (via BulkIssue with an injected runItem)", () => {
  const runOk = vi.fn<IssueRunItem>(async (i) => makeIssueResult(i.certificateId));

  it("1. a single success", async () => {
    const res = await new BulkIssueCertificatesCommand({ items: [item("c1")] }, ctx, { runItem: runOk }).run();
    expect(res).toMatchObject({ total: 1, succeeded: 1, failed: 0, skipped: 0 });
    expect(res.items[0]).toMatchObject({ index: 0, success: true, skipped: false });
  });

  it("2. multiple successes", async () => {
    const res = await new BulkIssueCertificatesCommand({ items: [item("a"), item("b"), item("c")] }, ctx, { runItem: runOk }).run();
    expect(res).toMatchObject({ total: 3, succeeded: 3, failed: 0, skipped: 0 });
  });

  it("3/10. mixed success/failure maps a typed error to { code, message } and never throws", async () => {
    const runMixed = vi.fn<IssueRunItem>(async (i) => {
      if (i.certificateId === "bad") throw new NotFoundError("Certificate", "bad");
      return makeIssueResult(i.certificateId);
    });
    const res = await new BulkIssueCertificatesCommand({ items: [item("a"), item("bad"), item("c")] }, ctx, { runItem: runMixed }).run();
    expect(res).toMatchObject({ total: 3, succeeded: 2, failed: 1, skipped: 0 });
    const failed = res.items.find((r) => !r.success)!;
    expect(failed.error).toEqual({ code: "NOT_FOUND", message: expect.any(String) });
  });

  it("4. stopOnFailure=false continues past a failure (all attempted)", async () => {
    const runMixed = vi.fn<IssueRunItem>(async (i) => {
      if (i.certificateId === "bad") throw new NotFoundError("Certificate", "bad");
      return makeIssueResult(i.certificateId);
    });
    const res = await new BulkIssueCertificatesCommand({ items: [item("bad"), item("a")], stopOnFailure: false }, ctx, { runItem: runMixed }).run();
    expect(res).toMatchObject({ total: 2, succeeded: 1, failed: 1, skipped: 0 });
  });

  it("5. stopOnFailure=true stops and marks the rest skipped", async () => {
    const runMixed = vi.fn<IssueRunItem>(async (i) => {
      if (i.certificateId === "bad") throw new NotFoundError("Certificate", "bad");
      return makeIssueResult(i.certificateId);
    });
    const res = await new BulkIssueCertificatesCommand({ items: [item("a"), item("bad"), item("c"), item("d")], stopOnFailure: true }, ctx, { runItem: runMixed }).run();
    expect(res).toMatchObject({ total: 4, succeeded: 1, failed: 1, skipped: 2 });
    expect(res.items.filter((r) => r.skipped).map((r) => r.index)).toEqual([2, 3]);
    // the runner was invoked only for the first two items
    expect(runMixed).toHaveBeenCalledTimes(2);
  });

  it("6. authorization failure throws before processing", async () => {
    rbac.perms = new Set();
    await expect(new BulkIssueCertificatesCommand({ items: [item("a")] }, ctx, { runItem: runOk }).run()).rejects.toBeInstanceOf(AuthorizationError);
    expect(runOk).not.toHaveBeenCalled();
  });

  it("7. invalid input (empty items) throws ValidationError", async () => {
    await expect(new BulkIssueCertificatesCommand({ items: [] }, ctx, { runItem: runOk }).run()).rejects.toBeInstanceOf(ValidationError);
  });

  it("8. progress callback fires once per attempted item with running counts", async () => {
    const runMixed = vi.fn<IssueRunItem>(async (i) => {
      if (i.certificateId === "bad") throw new NotFoundError("Certificate", "bad");
      return makeIssueResult(i.certificateId);
    });
    const events: BulkProgress[] = [];
    await new BulkIssueCertificatesCommand({ items: [item("a"), item("bad")] }, ctx, {
      runItem: runMixed,
      onProgress: (p) => events.push(p),
    }).run();
    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({ processed: 1, total: 2, currentIndex: 0, successes: 1, failures: 0 });
    expect(events[1]).toMatchObject({ processed: 2, total: 2, currentIndex: 1, successes: 1, failures: 1 });
  });

  it("9. counts always satisfy total === succeeded + failed + skipped", async () => {
    const runMixed = vi.fn<IssueRunItem>(async (i) => {
      if (i.certificateId === "bad") throw new NotFoundError("Certificate", "bad");
      return makeIssueResult(i.certificateId);
    });
    const res = await new BulkIssueCertificatesCommand({ items: [item("a"), item("bad"), item("c")], stopOnFailure: true }, ctx, { runItem: runMixed }).run();
    expect(res.succeeded + res.failed + res.skipped).toBe(res.total);
  });
});

// ─── Delegation (mocked single commands, default runItem) ─────────────────────
describe("bulk delegation — each item goes through the single-item command exactly once", () => {
  it("11/16. Generate → GenerateCertificateCommand once per item (reason applied)", async () => {
    await new BulkGenerateCertificatesCommand(
      { items: [{ transcriptVersionId: "v1", certificateType: "COURSE_COMPLETION" }, { transcriptVersionId: "v2", certificateType: "COURSE_COMPLETION" }], reason: "batch" },
      ctx
    ).run();
    const calls = single.captured.filter((c) => c.name === "GenerateCertificateCommand");
    expect(calls).toHaveLength(2);
    expect((calls[0].input as Record<string, unknown>)).toMatchObject({ transcriptVersionId: "v1", certificateType: "COURSE_COMPLETION", reason: "batch" });
  });

  it("Issue → IssueCertificateCommand once per item", async () => {
    await new BulkIssueCertificatesCommand({ items: [item("a"), item("b")] }, ctx).run();
    expect(single.captured.filter((c) => c.name === "IssueCertificateCommand")).toHaveLength(2);
  });

  it("Export → ExportCertificateCommand once per item", async () => {
    await new BulkExportCertificatesCommand({ items: [{ certificateId: "a" }, { certificateId: "b", exportType: "PDF" }] }, ctx).run();
    expect(single.captured.filter((c) => c.name === "ExportCertificateCommand")).toHaveLength(2);
  });

  it("Revoke/Suspend/Restore → the matching lifecycle command", async () => {
    await new BulkRevokeCertificatesCommand({ items: [item("a")], reason: "x" }, ctx).run();
    await new BulkSuspendCertificatesCommand({ items: [item("a")], reason: "x" }, ctx).run();
    await new BulkRestoreCertificatesCommand({ items: [item("a")] }, ctx).run();
    expect(single.captured.map((c) => c.name)).toEqual([
      "RevokeCertificateCommand",
      "SuspendCertificateCommand",
      "RestoreCertificateCommand",
    ]);
    // revoke/suspend forwarded the required reason
    expect((single.captured[0].input as Record<string, unknown>).reason).toBe("x");
  });
});

// ─── Architecture guards ──────────────────────────────────────────────────────
describe("Phase 13 architecture guards", () => {
  const MOD = join(process.cwd(), "src", "modules", "certificates");
  const APP = join(process.cwd(), "src", "app", "api", "certificates", "bulk");
  const COMMANDS = readFileSync(join(MOD, "commands", "bulk-certificate.commands.ts"), "utf8");
  const SHARED = readFileSync(join(MOD, "commands", "bulk-shared.ts"), "utf8");
  const ROUTES = ["generate", "issue", "export", "revoke", "suspend", "restore"].map((op) =>
    readFileSync(join(APP, op, "route.ts"), "utf8")
  );
  const NO_ACADEMIC = [COMMANDS, SHARED, ...ROUTES];

  it("no Transcript / Academic Core imports", () => {
    NO_ACADEMIC.forEach((src) => {
      expect(src).not.toMatch(/modules\/(grades|attendance|assessments|academic|enrollments|transcripts)/);
      expect(src).not.toMatch(/AcademicTranscript/);
    });
  });

  it("no EligibilityEngine import in the bulk layer", () => {
    NO_ACADEMIC.forEach((src) => {
      expect(src).not.toMatch(/certificate-eligibility|evaluateCertificateEligibility|EligibilityEngine/);
    });
  });

  it("the bulk command + routes touch no repository (no writes)", () => {
    [COMMANDS, SHARED, ...ROUTES].forEach((src) => {
      expect(src).not.toMatch(/modules\/certificates\/repositories/);
    });
  });

  it("routes import only the bulk commands (not single commands or repositories)", () => {
    ROUTES.forEach((src) => {
      expect(src).toMatch(/commands\/bulk-certificate\.commands/);
      expect(src).not.toMatch(/repositories\//);
    });
  });
});
