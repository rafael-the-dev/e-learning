import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// =============================================================================
// Certificate portal routes — Phase 10 HTTP-contract tests
// -----------------------------------------------------------------------------
// Asserts each route delegates to the correct command / read service, maps typed
// errors to statuses, and enforces auth. Collaborators are mocked; the route text
// is scanned by the architecture guards. Behaviour, not implementation.
// =============================================================================

const auth = vi.hoisted(() => ({ ctx: null as unknown, fail: false }));
const calls = vi.hoisted(() => ({ list: [] as unknown[][] }));

vi.mock("@/server/auth/context", () => ({
  requireOrganization: vi.fn(async () => {
    if (auth.fail) throw new Error("unauth");
    return auth.ctx;
  }),
}));

// ── Command mocks: capture (ClassName, input) and a controllable run(). Each
//    factory is inlined (a vi.mock factory may only reference vi.hoisted state). ──
const cmd = vi.hoisted(() => ({
  captured: [] as Array<{ name: string; input: unknown }>,
  run: null as null | (() => Promise<unknown>),
}));
const makeMock = vi.hoisted(() => (name: string) => ({
  [name]: class {
    input: unknown;
    constructor(input: unknown) {
      this.input = input;
    }
    async run() {
      cmd.captured.push({ name, input: this.input });
      return cmd.run ? cmd.run() : { ok: name };
    }
  },
}));
vi.mock("@/modules/certificates/commands/generate-certificate.command", () => makeMock("GenerateCertificateCommand"));
vi.mock("@/modules/certificates/commands/issue-certificate.command", () => makeMock("IssueCertificateCommand"));
vi.mock("@/modules/certificates/commands/revoke-certificate.command", () => makeMock("RevokeCertificateCommand"));
vi.mock("@/modules/certificates/commands/suspend-certificate.command", () => makeMock("SuspendCertificateCommand"));
vi.mock("@/modules/certificates/commands/restore-certificate.command", () => makeMock("RestoreCertificateCommand"));
vi.mock("@/modules/certificates/commands/export-certificate.command", () => makeMock("ExportCertificateCommand"));

vi.mock("@/modules/certificates/services/certificate-admin-read.service", () => ({
  certificateAdminReadService: {
    list: vi.fn(async (...a: unknown[]) => { calls.list.push(a); return { items: [], total: 0, page: 1, pageSize: 20 }; }),
    getDetail: vi.fn(async () => ({ id: "c1" })),
  },
}));
vi.mock("@/modules/certificates/services/certificate-student-read.service", () => ({
  certificateStudentReadService: {
    list: vi.fn(async () => ({ items: [], total: 0, page: 1, pageSize: 20 })),
    getDetail: vi.fn(async () => ({ id: "c1" })),
  },
}));

import { AuthorizationError } from "@/shared/lib/command";
import { GET as listGET } from "../route";
import { POST as generatePOST } from "../generate/route";
import { POST as issuePOST } from "../[id]/issue/route";
import { POST as revokePOST } from "../[id]/revoke/route";
import { POST as suspendPOST } from "../[id]/suspend/route";
import { POST as restorePOST } from "../[id]/restore/route";
import { POST as exportPOST } from "../[id]/export/route";

const CTX = { userId: "u-1", organizationId: "org-A", roles: [], ability: { can: () => true } };
const reqJson = (body: unknown, url = "http://x/api/certificates/c1/x") =>
  new Request(url, { method: "POST", body: JSON.stringify(body) });
const params = (id = "c1") => ({ params: Promise.resolve({ id }) });

beforeEach(() => {
  vi.clearAllMocks();
  auth.ctx = CTX;
  auth.fail = false;
  cmd.captured.length = 0;
  cmd.run = null;
  calls.list.length = 0;
});
afterEach(() => vi.restoreAllMocks());

describe("admin list/detail routes", () => {
  it("1. GET /api/certificates delegates to the admin read service", async () => {
    const res = await listGET(new Request("http://x/api/certificates?status=ISSUED&page=2"));
    expect(res.status).toBe(200);
    expect(calls.list.length).toBe(1);
    // context + parsed filters passed
    expect((calls.list[0][1] as Record<string, unknown>).status).toBe("ISSUED");
    expect((calls.list[0][1] as Record<string, unknown>).page).toBe(2);
  });

  it("GET /api/certificates → 401 when unauthenticated", async () => {
    auth.fail = true;
    const res = await listGET(new Request("http://x/api/certificates"));
    expect(res.status).toBe(401);
  });
});

describe("admin mutation routes call the right command", () => {
  it("4. generate → GenerateCertificateCommand", async () => {
    const res = await generatePOST(reqJson({ transcriptVersionId: "ver-1", certificateType: "COURSE_COMPLETION" }));
    expect(res.status).toBe(201);
    expect(cmd.captured.at(-1)?.name).toBe("GenerateCertificateCommand");
    expect((cmd.captured.at(-1)?.input as Record<string, unknown>).transcriptVersionId).toBe("ver-1");
  });

  it("5. issue → IssueCertificateCommand with the path id", async () => {
    await issuePOST(reqJson({}), params("c9"));
    expect(cmd.captured.at(-1)?.name).toBe("IssueCertificateCommand");
    expect((cmd.captured.at(-1)?.input as Record<string, unknown>).certificateId).toBe("c9");
  });

  it("6. revoke → RevokeCertificateCommand", async () => {
    await revokePOST(reqJson({ reason: "erro" }), params("c1"));
    expect(cmd.captured.at(-1)?.name).toBe("RevokeCertificateCommand");
    expect((cmd.captured.at(-1)?.input as Record<string, unknown>).reason).toBe("erro");
  });

  it("7. suspend → SuspendCertificateCommand", async () => {
    await suspendPOST(reqJson({ reason: "rev" }), params("c1"));
    expect(cmd.captured.at(-1)?.name).toBe("SuspendCertificateCommand");
  });

  it("8. restore → RestoreCertificateCommand", async () => {
    await restorePOST(reqJson({}), params("c1"));
    expect(cmd.captured.at(-1)?.name).toBe("RestoreCertificateCommand");
  });

  it("9. export → ExportCertificateCommand", async () => {
    const res = await exportPOST(reqJson({ exportType: "PDF" }), params("c1"));
    expect(res.status).toBe(201);
    expect(cmd.captured.at(-1)?.name).toBe("ExportCertificateCommand");
  });
});

describe("routes enforce authorization (10)", () => {
  it("10. a command AuthorizationError maps to 403", async () => {
    cmd.run = async () => { throw new AuthorizationError(); };
    const res = await issuePOST(reqJson({}), params("c1"));
    expect(res.status).toBe(403);
  });

  it("mutation route → 401 when unauthenticated (command never constructed)", async () => {
    auth.fail = true;
    const res = await revokePOST(reqJson({ reason: "x" }), params("c1"));
    expect(res.status).toBe(401);
    expect(cmd.captured.length).toBe(0);
  });
});

// ─── Architecture guards (24–29; static) ───────────────────────────────────────
describe("Phase 10 architecture guards", () => {
  const APP = join(process.cwd(), "src", "app", "api");
  const CERT = join(process.cwd(), "src", "modules", "certificates");
  const files = [
    join(APP, "certificates", "route.ts"),
    join(APP, "certificates", "[id]", "route.ts"),
    join(APP, "certificates", "generate", "route.ts"),
    join(APP, "certificates", "[id]", "issue", "route.ts"),
    join(APP, "certificates", "[id]", "revoke", "route.ts"),
    join(APP, "certificates", "[id]", "suspend", "route.ts"),
    join(APP, "certificates", "[id]", "restore", "route.ts"),
    join(APP, "certificates", "[id]", "export", "route.ts"),
    join(APP, "student", "certificates", "route.ts"),
    join(APP, "student", "certificates", "[id]", "route.ts"),
    join(APP, "student", "certificates", "exports", "[exportId]", "download", "route.ts"),
    join(CERT, "services", "certificate-admin-read.service.ts"),
    join(CERT, "services", "certificate-student-read.service.ts"),
    join(CERT, "services", "certificate-portal.mapper.ts"),
  ].map((p) => readFileSync(p, "utf8"));
  const each = (fn: (src: string) => void) => files.forEach(fn);

  it("24. no Academic Core imports", () => {
    each((src) => {
      expect(src).not.toMatch(/modules\/(grades|assessments|academic|enrollments)/);
      expect(src).not.toMatch(/StudentCourseProgress|StudentSubjectProgress|StudentLevelProgress/);
    });
  });

  it("25. no Transcript imports", () => {
    each((src) => {
      expect(src).not.toMatch(/modules\/transcripts/);
      expect(src).not.toMatch(/AcademicTranscript/);
    });
  });

  it("26. no Grade / Attendance imports", () => {
    each((src) => {
      expect(src).not.toMatch(/modules\/attendance/);
      expect(src).not.toMatch(/GradeCalculation|grade-calculation|AttendanceCalculation|attendance-calculation/);
    });
  });

  it("27. routes/services do not implement eligibility rules", () => {
    each((src) => {
      expect(src).not.toMatch(/certificate-eligibility|evaluateCertificateEligibility|EligibilityEngine/);
    });
  });

  it("28. route files do not import repositories directly (they go through services/commands)", () => {
    const routeFiles = files.slice(0, 11);
    routeFiles.forEach((src) => {
      expect(src).not.toMatch(/modules\/certificates\/repositories/);
    });
  });

  it("29. routes do not render PDFs or import UI/React", () => {
    each((src) => {
      expect(src).not.toMatch(/react-pdf|renderToBuffer|certificate-pdf-renderer|from ["']react["']|@\/components\//);
    });
  });
});
