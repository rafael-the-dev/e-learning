import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeFakeDb, seed, type FakeDb } from "../../repositories/__tests__/_fake-db";

// =============================================================================
// ExportCertificateCommand — Phase 8 tests
// -----------------------------------------------------------------------------
// Drives the command against the fake DB (with rollback semantics). The real
// certificate/template/verification/export repositories, the organization read,
// and the audit service run; the renderer + storage are injected fakes and the
// event publisher is mocked. Asserts: authorization, export-state eligibility,
// template resolution, QR/privacy, renderer/storage wiring, the PENDING→READY /
// FAILED record lifecycle, certificate immutability, events/audit, and the Phase-8
// architecture guards.
// =============================================================================

const h = vi.hoisted(() => ({ db: null as unknown as FakeDb }));
const authState = vi.hoisted(() => ({ allow: true }));
const published = vi.hoisted(() => ({ events: [] as Array<Record<string, unknown>> }));

vi.mock("@/server/db", () => ({ getDb: vi.fn(async () => h.db) }));
vi.mock("@/server/auth/rbac", () => ({
  getUserPermissions: vi.fn(async () => new Set<string>()),
  createAbility: () => ({ can: () => authState.allow }),
}));
vi.mock("@/server/events/event-publisher", () => ({
  eventPublisher: { publish: vi.fn(async (e: Record<string, unknown>) => void published.events.push(e)) },
}));

import { AuthorizationError, BusinessRuleError, NotFoundError } from "@/shared/lib/command";
import type { ServiceContext } from "@/shared/types/common";
import { auditService } from "@/modules/audit-logs/services/audit.service";
import type {
  CertificateExportArtifact,
  CertificatePdfRenderInput,
  StoreCertificateExportParams,
} from "@/modules/certificates/types/export";
import { ExportCertificateCommand } from "../export-certificate.command";

const ORG = "org-A";
const OTHER_ORG = "org-B";
const NOW = new Date("2026-07-08T10:00:00.000Z");
const BASE = "https://verify.example.com";
const ctx: ServiceContext = { userId: "u-1", organizationId: ORG };
const store = (name: string) => h.db[name].__store;

const SECRETS = {
  checksum: "csum-SECRET",
  transcriptChecksum: "tchk-SECRET",
  transcriptVersionId: "ver-SECRET",
  idNumber: "BI-SECRET-999",
};

// ── Injected fakes ───────────────────────────────────────────────────────────
const renderCalls: CertificatePdfRenderInput[] = [];
const storeCalls: StoreCertificateExportParams[] = [];
const RENDERED: CertificateExportArtifact = { buffer: Buffer.from("%PDF-1.4 fake"), contentType: "application/pdf" };
const STORED = {
  storageKey: "certificates/org-A/cert-1/exp.pdf",
  fileUrl: "/uploads/certificates/org-A/cert-1/exp.pdf",
  fileChecksum: "filechk-abc123",
};

function makeDeps(overrides: {
  render?: () => Promise<CertificateExportArtifact>;
  store?: () => Promise<typeof STORED>;
} = {}) {
  return {
    now: () => NOW,
    baseUrl: BASE,
    renderer: {
      render: vi.fn(async (input: CertificatePdfRenderInput) => {
        renderCalls.push(input);
        return overrides.render ? overrides.render() : RENDERED;
      }),
    },
    storage: {
      // Capture the PENDING row state AT store time to prove ordering (§18).
      store: vi.fn(async (params: StoreCertificateExportParams) => {
        storeCalls.push(params);
        statusAtStore = (store("certificateExport")[0] as { status: string } | undefined)?.status;
        return overrides.store ? overrides.store() : STORED;
      }),
    },
  };
}

let statusAtStore: string | undefined;

function seedTemplate(overrides: Record<string, unknown> = {}): void {
  seed(h.db, "certificateTemplate", {
    id: "tpl-1",
    organizationId: ORG,
    name: "Modelo Oficial",
    certificateType: "COURSE_COMPLETION",
    courseId: null,
    language: "pt-PT",
    layoutJson: "{}",
    templateHtml: null,
    backgroundImageUrl: null,
    signatureImageUrl: null,
    sealImageUrl: null,
    status: "ACTIVE",
    deletedAt: null,
    ...overrides,
  });
}

function seedCertificate(overrides: Record<string, unknown> = {}): string {
  seed(h.db, "organization", { id: ORG, name: "Escola de Condução Central", deletedAt: null });
  const row = seed(h.db, "certificate", {
    id: "cert-1",
    organizationId: ORG,
    studentId: "stu-1",
    enrollmentId: "enr-1",
    courseId: "course-1",
    transcriptVersionId: SECRETS.transcriptVersionId,
    transcriptNumber: "TR-2026-000001",
    transcriptChecksum: SECRETS.transcriptChecksum,
    certificatePolicyId: "pol-1",
    certificateTemplateId: null,
    certificateNumber: "CERT-2026-000042",
    certificateType: "COURSE_COMPLETION",
    status: "ISSUED",
    studentSnapshot: JSON.stringify({
      studentId: "stu-1",
      firstName: "João",
      lastName: "Silva Costa",
      fullName: "João Silva Costa",
      idNumber: SECRETS.idNumber,
    }),
    courseSnapshot: JSON.stringify({ courseId: "course-1", courseName: "Carta de Condução B" }),
    issueBasisSnapshot: JSON.stringify({ certificateType: "COURSE_COMPLETION" }),
    financialClearanceStatus: "NOT_REQUIRED",
    verificationCode: "abcdef0123456789abcdef0123456789",
    verificationUrl: null,
    checksum: SECRETS.checksum,
    issuedAt: new Date("2026-07-05T00:00:00.000Z"),
    issuedBy: "u-issuer",
    expiresAt: null,
    deletedAt: null,
    ...overrides,
  });
  seed(h.db, "certificateVerification", {
    id: "vrow-1",
    organizationId: ORG,
    certificateId: "cert-1",
    verificationCode: "abcdef0123456789abcdef0123456789",
    publicStatus: "VALID",
    verificationCount: 0,
    lastVerifiedAt: null,
    expiresAt: null,
  });
  return row.id as string;
}

function run(
  input: { certificateId?: string; exportType?: "PDF" | "API" | "MINISTRY" } = {},
  context: ServiceContext = ctx,
  deps = makeDeps()
) {
  return new ExportCertificateCommand(
    { certificateId: input.certificateId ?? "cert-1", exportType: input.exportType },
    context,
    deps
  ).run();
}

beforeEach(() => {
  vi.clearAllMocks();
  h.db = makeFakeDb();
  authState.allow = true;
  published.events.length = 0;
  renderCalls.length = 0;
  storeCalls.length = 0;
  statusAtStore = undefined;
});
afterEach(() => vi.restoreAllMocks());

// ── Authorization (1–2) ────────────────────────────────────────────────────
describe("ExportCertificateCommand — authorization", () => {
  it("1. requires certificates.export", async () => {
    seedCertificate();
    seedTemplate();
    authState.allow = false;
    await expect(run()).rejects.toBeInstanceOf(AuthorizationError);
  });

  it("2. a cross-tenant certificate is NOT_FOUND", async () => {
    seedCertificate(); // in ORG
    seedTemplate();
    await expect(run({}, { userId: "u-1", organizationId: OTHER_ORG })).rejects.toBeInstanceOf(
      NotFoundError
    );
    expect(store("certificateExport").length).toBe(0);
  });
});

// ── Export eligibility (3–8) ─────────────────────────────────────────────────
describe("ExportCertificateCommand — export eligibility", () => {
  it("3. ISSUED can export → READY", async () => {
    seedCertificate({ status: "ISSUED" });
    seedTemplate();
    const result = await run();
    expect(result.status).toBe("READY");
    expect((store("certificateExport")[0] as { status: string }).status).toBe("READY");
  });

  it("4. SUSPENDED can export → READY", async () => {
    seedCertificate({ status: "SUSPENDED" });
    seedTemplate();
    const result = await run();
    expect(result.status).toBe("READY");
  });

  it.each(["REVOKED", "DRAFT", "PENDING_APPROVAL", "STALE"])(
    "5/6/7/8. %s cannot export (BusinessRuleError, no export row)",
    async (status) => {
      seedCertificate({ status });
      seedTemplate();
      await expect(run()).rejects.toBeInstanceOf(BusinessRuleError);
      expect(store("certificateExport").length).toBe(0);
    }
  );
});

// ── Template resolution (9–11) ───────────────────────────────────────────────
describe("ExportCertificateCommand — template resolution", () => {
  it("9. uses the certificate's pinned template when set", async () => {
    seedCertificate({ certificateTemplateId: "tpl-pinned" });
    seedTemplate({ id: "tpl-pinned", name: "Modelo Fixado" });
    seedTemplate({ id: "tpl-default", name: "Modelo Padrão" }); // should be ignored
    await run();
    expect(renderCalls[0].template.templateId).toBe("tpl-pinned");
    expect(renderCalls[0].template.name).toBe("Modelo Fixado");
  });

  it("10. falls back to the active org-default template (type + pt-PT)", async () => {
    seedCertificate({ certificateTemplateId: null });
    seedTemplate({ id: "tpl-default", name: "Modelo Padrão", courseId: null, status: "ACTIVE" });
    await run();
    expect(renderCalls[0].template.templateId).toBe("tpl-default");
  });

  it("11. missing template throws TEMPLATE_NOT_FOUND (no export produced)", async () => {
    seedCertificate({ certificateTemplateId: null }); // no template seeded
    await expect(run()).rejects.toThrow(/TEMPLATE_NOT_FOUND/);
    expect(store("certificateExport").length).toBe(0);
    expect(renderCalls.length).toBe(0);
  });
});

// ── QR / privacy (12–14) ─────────────────────────────────────────────────────
describe("ExportCertificateCommand — QR & privacy", () => {
  it("12. QR payload is the public verification URL carrying the code", async () => {
    seedCertificate();
    seedTemplate();
    await run();
    const dto = renderCalls[0].render;
    expect(dto.qrPayload).toBe(dto.verificationUrl);
    expect(dto.qrPayload).toContain("abcdef0123456789abcdef0123456789");
    expect(dto.qrPayload).toContain(BASE);
  });

  it("13. QR payload contains no checksum / transcript id / document / grades", async () => {
    seedCertificate();
    seedTemplate();
    await run();
    const dto = renderCalls[0].render;
    for (const secret of Object.values(SECRETS)) expect(dto.qrPayload).not.toContain(secret);
    expect(dto.qrPayload).not.toMatch(/checksum|transcript|grade|attendance/i);
  });

  it("14. the renderer receives ONLY the render DTO (exact whitelist, no snapshot/checksum)", async () => {
    seedCertificate();
    seedTemplate();
    await run();
    const dto = renderCalls[0].render;
    expect(Object.keys(dto).sort()).toEqual(
      [
        "certificateNumber",
        "certificateType",
        "courseName",
        "expiresAt",
        "issuedAt",
        "organizationName",
        "qrPayload",
        "studentDisplayName",
        "templateData",
        "verificationUrl",
      ].sort()
    );
    const serialized = JSON.stringify(dto);
    for (const secret of Object.values(SECRETS)) expect(serialized).not.toContain(secret);
  });
});

// ── Rendering / storage (14–17) ──────────────────────────────────────────────
describe("ExportCertificateCommand — rendering & storage", () => {
  it("15. storage receives the rendered PDF buffer", async () => {
    seedCertificate();
    seedTemplate();
    await run();
    expect(storeCalls[0].artifact.buffer).toBeInstanceOf(Buffer);
    expect(storeCalls[0].artifact.buffer.equals(RENDERED.buffer)).toBe(true);
    expect(storeCalls[0].artifact.contentType).toBe("application/pdf");
  });

  it("16. the file checksum is persisted on the export row", async () => {
    seedCertificate();
    seedTemplate();
    const result = await run();
    expect(result.fileChecksum).toBe(STORED.fileChecksum);
    expect((store("certificateExport")[0] as { fileChecksum: string }).fileChecksum).toBe(
      STORED.fileChecksum
    );
  });

  it("17. Certificate.checksum is unchanged by export (separate from file checksum)", async () => {
    seedCertificate();
    seedTemplate();
    await run();
    expect((store("certificate")[0] as { checksum: string }).checksum).toBe(SECRETS.checksum);
  });
});

// ── Export record lifecycle (18–21) ──────────────────────────────────────────
describe("ExportCertificateCommand — export record lifecycle", () => {
  it("18. creates the row PENDING before rendering, then flips it READY", async () => {
    seedCertificate();
    seedTemplate();
    await run();
    expect(statusAtStore).toBe("PENDING"); // captured inside storage.store()
    expect((store("certificateExport")[0] as { status: string }).status).toBe("READY");
  });

  it("19. render failure marks the row FAILED and re-throws", async () => {
    seedCertificate();
    seedTemplate();
    const deps = makeDeps({ render: async () => { throw new Error("render boom"); } });
    await expect(run({}, ctx, deps)).rejects.toThrow(/render boom/);
    expect((store("certificateExport")[0] as { status: string }).status).toBe("FAILED");
    expect(storeCalls.length).toBe(0);
  });

  it("20. storage failure marks the row FAILED and re-throws", async () => {
    seedCertificate();
    seedTemplate();
    const deps = makeDeps({ store: async () => { throw new Error("storage boom"); } });
    await expect(run({}, ctx, deps)).rejects.toThrow(/storage boom/);
    expect((store("certificateExport")[0] as { status: string }).status).toBe("FAILED");
  });

  it("21. no certificate lifecycle mutation on export (status + stamps untouched)", async () => {
    seedCertificate({ status: "ISSUED" });
    seedTemplate();
    await run();
    const cert = store("certificate")[0] as Record<string, unknown>;
    expect(cert.status).toBe("ISSUED");
    expect(cert.revokedAt ?? null).toBeNull();
    expect(cert.suspendedAt ?? null).toBeNull();
  });
});

// ── Events / audit (22–25) ───────────────────────────────────────────────────
describe("ExportCertificateCommand — events & audit", () => {
  it("22. appends a certificate.exported CertificateEvent", async () => {
    seedCertificate();
    seedTemplate();
    await run();
    const events = store("certificateEvent").filter(
      (e) => (e as { eventType: string }).eventType === "certificate.exported"
    );
    expect(events.length).toBe(1);
  });

  it("23. writes a certificate.exported AuditLog", async () => {
    seedCertificate();
    seedTemplate();
    await run();
    const logs = store("auditLog").filter(
      (l) => (l as { action: string }).action === "certificate.exported"
    );
    expect(logs.length).toBe(1);
  });

  it("24. publishes a certificate.exported DomainEvent AFTER commit", async () => {
    seedCertificate();
    seedTemplate();
    await run();
    const exported = published.events.filter((e) => e.eventType === "certificate.exported");
    expect(exported.length).toBe(1);
    expect((exported[0].payload as { fileChecksum: string }).fileChecksum).toBe(STORED.fileChecksum);
  });

  it("25. a FAILED export emits no success event and no audit", async () => {
    seedCertificate();
    seedTemplate();
    const deps = makeDeps({ store: async () => { throw new Error("storage boom"); } });
    await expect(run({}, ctx, deps)).rejects.toThrow();
    expect(published.events.length).toBe(0);
    expect(store("certificateEvent").length).toBe(0);
    expect(store("auditLog").length).toBe(0);
  });
});

// ── Architecture guards (26–32; static) ──────────────────────────────────────
describe("ExportCertificateCommand — architecture guards", () => {
  const CERT_DIR = join(process.cwd(), "src", "modules", "certificates");
  const COMMAND = readFileSync(join(CERT_DIR, "commands", "export-certificate.command.ts"), "utf8");
  const RENDERER = readFileSync(join(CERT_DIR, "export", "certificate-pdf-renderer.ts"), "utf8");
  const STORAGE = readFileSync(join(CERT_DIR, "export", "certificate-export-storage.ts"), "utf8");
  const ALL = [COMMAND, RENDERER, STORAGE];
  const each = (fn: (src: string) => void) => ALL.forEach(fn);

  it("26. no Academic Core imports", () => {
    each((src) => {
      expect(src).not.toMatch(/modules\/(grades|attendance|assessments|academic|enrollments)/);
      expect(src).not.toMatch(/StudentCourseProgress|StudentSubjectProgress|StudentLevelProgress/);
    });
  });

  it("27. no Transcript imports", () => {
    each((src) => {
      expect(src).not.toMatch(/modules\/transcripts/);
      expect(src).not.toMatch(/AcademicTranscript|certificate-transcript-source/);
    });
  });

  it("28. no Grade / Attendance engine imports", () => {
    each((src) => {
      expect(src).not.toMatch(/GradeCalculation|grade-calculation|AttendanceCalculation|attendance-calculation/);
    });
  });

  it("29. no Eligibility engine / source imports", () => {
    each((src) => {
      expect(src).not.toMatch(/certificate-eligibility\.engine|certificate-eligibility-source|evaluateCertificateEligibility/);
    });
  });

  it("30. the renderer imports no repository", () => {
    expect(RENDERER).not.toMatch(/repositories\//);
    expect(RENDERER).not.toMatch(/getDb|PrismaClient/);
  });

  it("31. the command hard-codes no PDF rendering primitives (renderer owns rendering)", () => {
    expect(COMMAND).not.toMatch(/%PDF|renderToBuffer|endstream|escapePdfText|MediaBox/);
  });

  it("32. the command never writes Certificate.status/checksum (no lifecycle mark / metadata write)", () => {
    expect(COMMAND).not.toMatch(/markCertificate(Issued|Revoked|Suspended|Restored|Stale)/);
    expect(COMMAND).not.toMatch(/updateCertificateMetadata/);
    expect(COMMAND).not.toMatch(/\bcertificate\.update(Many)?\(/);
  });
});

// =============================================================================
// PHASE 8B HARDENING TESTS
// =============================================================================

const certRow = () => store("certificate")[0] as Record<string, unknown>;

/** Make ONLY the FAILED-marking update throw (READY/other updates still work), so we
 *  can prove that a failing best-effort FAILED mark never masks the original error. */
function breakExportStatusUpdate(): void {
  const model = h.db.certificateExport;
  const original = model.updateMany.bind(model);
  model.updateMany = async (args: { where?: Record<string, unknown>; data: Record<string, unknown> }) => {
    if ((args.data as { status?: string }).status === "FAILED") {
      throw new Error("db down (FAILED-update)");
    }
    return original(args);
  };
}

// ── Finalize-tx failure hardening (§3) ───────────────────────────────────────
describe("ExportCertificateCommand — finalize-tx failure hardening", () => {
  /** Render + store succeed; the finalize transaction fails at the AuditLog write. */
  function failFinalize(): void {
    vi.spyOn(auditService, "log").mockRejectedValueOnce(new Error("finalize boom"));
  }

  it("3.1. a finalize-tx failure marks the export FAILED (best-effort)", async () => {
    seedCertificate();
    seedTemplate();
    failFinalize();
    await expect(run()).rejects.toThrow(/finalize boom/);
    expect((store("certificateExport")[0] as { status: string }).status).toBe("FAILED");
  });

  it("3.2. a finalize-tx failure re-throws the ORIGINAL finalize error", async () => {
    seedCertificate();
    seedTemplate();
    failFinalize();
    await expect(run()).rejects.toThrowError("finalize boom");
  });

  it("3.3. a finalize-tx failure does NOT publish certificate.exported", async () => {
    seedCertificate();
    seedTemplate();
    failFinalize();
    await expect(run()).rejects.toThrow();
    expect(published.events.length).toBe(0);
  });

  it("3.4. a finalize-tx failure writes no success event/audit row (rolled back)", async () => {
    seedCertificate();
    seedTemplate();
    failFinalize();
    await expect(run()).rejects.toThrow();
    expect(store("certificateEvent").length).toBe(0);
    expect(store("auditLog").length).toBe(0);
  });

  it("3.5. a finalize-tx failure leaves the certificate unchanged", async () => {
    seedCertificate({ status: "ISSUED" });
    seedTemplate();
    failFinalize();
    await expect(run()).rejects.toThrow();
    const cert = certRow();
    expect(cert.status).toBe("ISSUED");
    expect(cert.checksum).toBe(SECRETS.checksum);
    expect(cert.certificateNumber).toBe("CERT-2026-000042");
  });

  it("3.6. a finalize-tx failure: the artifact was stored but the row is NOT READY", async () => {
    seedCertificate();
    seedTemplate();
    failFinalize();
    await expect(run()).rejects.toThrow();
    expect(storeCalls.length).toBe(1); // artifact reached storage
    expect((store("certificateExport")[0] as { status: string }).status).not.toBe("READY");
  });

  it("3.7. if the finalize-failure FAILED-update ALSO fails, the finalize error still wins", async () => {
    seedCertificate();
    seedTemplate();
    failFinalize();
    breakExportStatusUpdate();
    // markFailedBestEffort swallows the db error; the original finalize error surfaces.
    await expect(run()).rejects.toThrowError("finalize boom");
  });
});

// ── Failure-path error preservation (§4) ─────────────────────────────────────
describe("ExportCertificateCommand — failure-path error preservation", () => {
  it("4.1. render failure marks FAILED and re-throws the render error", async () => {
    seedCertificate();
    seedTemplate();
    const deps = makeDeps({ render: async () => { throw new Error("render boom"); } });
    await expect(run({}, ctx, deps)).rejects.toThrowError("render boom");
    expect((store("certificateExport")[0] as { status: string }).status).toBe("FAILED");
  });

  it("4.2. render failure + failing FAILED-update: the RENDER error still wins", async () => {
    seedCertificate();
    seedTemplate();
    breakExportStatusUpdate();
    const deps = makeDeps({ render: async () => { throw new Error("render boom"); } });
    // The FAILED-update throws "db down" but is swallowed; "render boom" is rethrown.
    await expect(run({}, ctx, deps)).rejects.toThrowError("render boom");
    // The row could not be flipped, so it remains PENDING (never READY).
    expect((store("certificateExport")[0] as { status: string }).status).toBe("PENDING");
  });

  it("4.3. storage failure marks FAILED and re-throws the storage error", async () => {
    seedCertificate();
    seedTemplate();
    const deps = makeDeps({ store: async () => { throw new Error("storage boom"); } });
    await expect(run({}, ctx, deps)).rejects.toThrowError("storage boom");
    expect((store("certificateExport")[0] as { status: string }).status).toBe("FAILED");
  });

  it("4.4. storage failure + failing FAILED-update: the STORAGE error still wins", async () => {
    seedCertificate();
    seedTemplate();
    breakExportStatusUpdate();
    const deps = makeDeps({ store: async () => { throw new Error("storage boom"); } });
    await expect(run({}, ctx, deps)).rejects.toThrowError("storage boom");
  });

  it("4.5. no success domain event / audit / event row on any failure", async () => {
    seedCertificate();
    seedTemplate();
    const deps = makeDeps({ render: async () => { throw new Error("render boom"); } });
    await expect(run({}, ctx, deps)).rejects.toThrow();
    expect(published.events.length).toBe(0);
    expect(store("certificateEvent").length).toBe(0);
    expect(store("auditLog").length).toBe(0);
  });
});

// ── Unsupported export type (§5) ─────────────────────────────────────────────
describe("ExportCertificateCommand — unsupported export type", () => {
  it.each(["API", "MINISTRY"] as const)(
    "rejects exportType %s with BusinessRuleError and creates no export row",
    async (exportType) => {
      seedCertificate();
      seedTemplate();
      await expect(run({ exportType })).rejects.toBeInstanceOf(BusinessRuleError);
      expect(store("certificateExport").length).toBe(0);
    }
  );
});

// ── Failure immutability (§6) ────────────────────────────────────────────────
describe("ExportCertificateCommand — failure immutability", () => {
  const ORIGINAL_STUDENT = JSON.stringify({
    studentId: "stu-1",
    firstName: "João",
    lastName: "Silva Costa",
    fullName: "João Silva Costa",
    idNumber: SECRETS.idNumber,
  });
  const ORIGINAL_COURSE = JSON.stringify({ courseId: "course-1", courseName: "Carta de Condução B" });

  function expectCertificateUntouched(): void {
    const cert = certRow();
    expect(cert.status).toBe("ISSUED");
    expect(cert.checksum).toBe(SECRETS.checksum);
    expect(cert.certificateNumber).toBe("CERT-2026-000042");
    expect(cert.studentSnapshot).toBe(ORIGINAL_STUDENT);
    expect(cert.courseSnapshot).toBe(ORIGINAL_COURSE);
  }

  it("render failure does not mutate the certificate (checksum/number/snapshots)", async () => {
    seedCertificate({ status: "ISSUED" });
    seedTemplate();
    const deps = makeDeps({ render: async () => { throw new Error("render boom"); } });
    await expect(run({}, ctx, deps)).rejects.toThrow();
    expectCertificateUntouched();
  });

  it("storage failure does not mutate the certificate (checksum/number/snapshots)", async () => {
    seedCertificate({ status: "ISSUED" });
    seedTemplate();
    const deps = makeDeps({ store: async () => { throw new Error("storage boom"); } });
    await expect(run({}, ctx, deps)).rejects.toThrow();
    expectCertificateUntouched();
  });

  it("finalize failure does not mutate the certificate (checksum/number/snapshots)", async () => {
    seedCertificate({ status: "ISSUED" });
    seedTemplate();
    vi.spyOn(auditService, "log").mockRejectedValueOnce(new Error("finalize boom"));
    await expect(run()).rejects.toThrow();
    expectCertificateUntouched();
  });
});
