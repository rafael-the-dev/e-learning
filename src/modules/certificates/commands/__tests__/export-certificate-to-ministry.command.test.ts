import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeFakeDb, seed, type FakeDb } from "../../repositories/__tests__/_fake-db";

// =============================================================================
// ExportCertificateToMinistryCommand — Phase 11 tests
// -----------------------------------------------------------------------------
// Drives the command against the rollback-capable fake DB. Real certificate /
// verification / export repositories, the organization read, and the audit service
// run; the transport + storage are injected fakes and the event publisher is mocked.
// Asserts authorization, ISSUED-only gating, required frozen metadata, the
// PENDING→READY / FAILED record lifecycle, certificate immutability, events/audit,
// the deterministic transport reference, no storage-path leak, and the arch guards.
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
import type {
  CertificateMinistryArtifact,
  StoreMinistryExportParams,
  StoredMinistryExport,
} from "@/modules/certificates/types/ministry";
import { LocalCertificateMinistryTransport } from "@/modules/certificates/export/certificate-ministry-transport";
import { ExportCertificateToMinistryCommand } from "../export-certificate-to-ministry.command";

const ORG = "org-A";
const OTHER_ORG = "org-B";
const NOW = new Date("2026-07-08T10:00:00.000Z");
const BASE = "https://verify.example.com";
const ctx: ServiceContext = { userId: "u-1", organizationId: ORG };
const store = (name: string) => h.db[name].__store;
const exportRows = () => store("certificateExport");
const CHECKSUM64 = "abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789";

const storeCalls: StoreMinistryExportParams[] = [];
const submitCalls: CertificateMinistryArtifact[] = [];
const STORED: StoredMinistryExport = {
  storageKey: "certificates/org-A/cert-1/exp.ministry.json",
  fileUrl: "/uploads/certificates/org-A/cert-1/exp.ministry.json",
  fileChecksum: CHECKSUM64,
};

function makeDeps(overrides: { store?: () => Promise<StoredMinistryExport>; useRealTransport?: boolean } = {}) {
  return {
    now: () => NOW,
    baseUrl: BASE,
    storage: {
      store: vi.fn(async (params: StoreMinistryExportParams) => {
        storeCalls.push(params);
        return overrides.store ? overrides.store() : STORED;
      }),
    },
    transport: overrides.useRealTransport
      ? new LocalCertificateMinistryTransport()
      : {
          submit: vi.fn(async (artifact: CertificateMinistryArtifact) => {
            submitCalls.push(artifact);
            return { externalReference: "EXT-REF-1", submittedAt: NOW, status: "RECORDED" };
          }),
        },
  };
}

function seedCert(overrides: Record<string, unknown> = {}): void {
  seed(h.db, "certificate", {
    id: "cert-1", organizationId: ORG, studentId: "stu-1", enrollmentId: "enr-1", courseId: "course-1",
    transcriptVersionId: "ver-SECRET", transcriptNumber: "TR-2026-000001", transcriptChecksum: "tchk-SECRET",
    certificatePolicyId: "pol-1", certificateTemplateId: null, certificateNumber: "CERT-2026-000042",
    certificateType: "COURSE_COMPLETION", status: "ISSUED",
    studentSnapshot: JSON.stringify({ studentId: "stu-1", fullName: "João Silva", idNumber: "BI-SECRET" }),
    courseSnapshot: JSON.stringify({ courseId: "course-1", courseName: "Curso A" }),
    issueBasisSnapshot: JSON.stringify({ secret: "no-leak" }),
    financialClearanceStatus: "NOT_REQUIRED", financialClearanceReference: "FIN-SECRET",
    verificationCode: "vc-1", verificationUrl: null, checksum: "cert-checksum-1",
    issuedAt: new Date("2026-07-05T00:00:00.000Z"), issuedBy: "u-0",
    revokedAt: null, suspendedAt: null, staleReason: null, staleDetectedAt: null,
    expiresAt: null, deletedAt: null,
    ...overrides,
  });
}
function seedVerification(overrides: Record<string, unknown> = {}): void {
  seed(h.db, "certificateVerification", {
    id: "vrow-1", organizationId: ORG, certificateId: "cert-1", verificationCode: "vc-1",
    publicStatus: "VALID", verificationCount: 0, lastVerifiedAt: null, expiresAt: null, ...overrides,
  });
}
function seedOrg(): void {
  seed(h.db, "organization", { id: ORG, name: "Escola Central", deletedAt: null });
}

const run = (input: Record<string, unknown> = {}, context = ctx, overrides = {}) =>
  new ExportCertificateToMinistryCommand({ certificateId: "cert-1", ...input }, context, makeDeps(overrides)).run();

beforeEach(() => {
  vi.clearAllMocks();
  h.db = makeFakeDb();
  authState.allow = true;
  published.events.length = 0;
  storeCalls.length = 0;
  submitCalls.length = 0;
});
afterEach(() => vi.restoreAllMocks());

describe("ExportCertificateToMinistryCommand — success", () => {
  it("1. exports an ISSUED certificate to MINISTRY (JSON default)", async () => {
    seedCert(); seedVerification(); seedOrg();
    const res = await run();
    expect(res.exportType).toBe("MINISTRY");
    expect(res.format).toBe("JSON");
    expect(res.status).toBe("READY");
    expect(res.externalReference).toBe("EXT-REF-1");
    expect(res.fileChecksum).toBe(CHECKSUM64);
    expect(storeCalls[0].format).toBe("JSON");
    expect(submitCalls).toHaveLength(1);
  });

  it("12. creates the export row PENDING then finalizes READY (MINISTRY)", async () => {
    seedCert(); seedVerification(); seedOrg();
    await run();
    const rows = exportRows();
    expect(rows).toHaveLength(1);
    expect(rows[0].exportType).toBe("MINISTRY");
    expect(rows[0].status).toBe("READY");
    expect(rows[0].fileChecksum).toBe(CHECKSUM64);
    expect(rows[0].exportedBy).toBe("u-1");
  });

  it("15. writes CertificateEvent + AuditLog + domain event on success", async () => {
    seedCert(); seedVerification(); seedOrg();
    await run();
    const events = store("certificateEvent").filter((e) => e.eventType === "certificate.exported");
    expect(events).toHaveLength(1);
    expect(JSON.parse(events[0].metadata as string)).toMatchObject({ exportType: "MINISTRY", format: "JSON" });
    expect(store("auditLog").filter((a) => a.action === "certificate.exported")).toHaveLength(1);
    expect(published.events.filter((e) => e.eventType === "certificate.exported")).toHaveLength(1);
  });

  it("14. never mutates the certificate (status/number/checksum unchanged)", async () => {
    seedCert(); seedVerification(); seedOrg();
    await run();
    const cert = store("certificate")[0];
    expect(cert.status).toBe("ISSUED");
    expect(cert.certificateNumber).toBe("CERT-2026-000042");
    expect(cert.checksum).toBe("cert-checksum-1");
  });

  it("supports CSV and XML formats", async () => {
    seedCert(); seedVerification(); seedOrg();
    expect((await run({ format: "CSV" })).format).toBe("CSV");
    h.db = makeFakeDb(); seedCert(); seedVerification(); seedOrg();
    expect((await run({ format: "XML" })).format).toBe("XML");
  });

  it("22. the local transport returns a deterministic externalReference from the payload checksum", async () => {
    seedCert(); seedVerification(); seedOrg();
    const res = await run({}, ctx, { useRealTransport: true });
    expect(res.externalReference).toBe(`LOCAL-MINISTRY-${CHECKSUM64.slice(0, 24)}`);
  });

  it("24. the result never exposes a storage path / fileUrl", async () => {
    seedCert(); seedVerification(); seedOrg();
    const res = await run();
    expect(Object.keys(res).sort()).toEqual(
      ["certificateId", "exportId", "exportType", "exportedAt", "externalReference", "fileChecksum", "format", "status"].sort()
    );
    expect(res).not.toHaveProperty("fileUrl");
    expect(res).not.toHaveProperty("storageKey");
  });
});

describe("ExportCertificateToMinistryCommand — state & guards", () => {
  it.each(["DRAFT", "PENDING_APPROVAL", "SUSPENDED", "REVOKED", "STALE"])(
    "2-6. rejects a %s certificate and creates no export row",
    async (status) => {
      seedCert({ status }); seedVerification(); seedOrg();
      await expect(run()).rejects.toBeInstanceOf(BusinessRuleError);
      expect(exportRows()).toHaveLength(0);
      expect(published.events).toHaveLength(0);
    }
  );

  it("7. requires a certificateNumber", async () => {
    seedCert({ certificateNumber: null }); seedVerification(); seedOrg();
    await expect(run()).rejects.toBeInstanceOf(BusinessRuleError);
  });

  it("8. requires a checksum", async () => {
    seedCert({ checksum: null }); seedVerification(); seedOrg();
    await expect(run()).rejects.toBeInstanceOf(BusinessRuleError);
  });

  it("9. requires a verificationCode", async () => {
    seedCert({ verificationCode: null }); seedVerification(); seedOrg();
    await expect(run()).rejects.toBeInstanceOf(BusinessRuleError);
  });

  it("10. requires certificates.export", async () => {
    seedCert(); seedVerification(); seedOrg();
    authState.allow = false;
    await expect(run()).rejects.toBeInstanceOf(AuthorizationError);
    expect(exportRows()).toHaveLength(0);
  });

  it("11. a cross-tenant certificate is NOT_FOUND", async () => {
    seedCert(); seedVerification(); seedOrg();
    await expect(run({}, { userId: "u-2", organizationId: OTHER_ORG })).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("ExportCertificateToMinistryCommand — failure hardening (13)", () => {
  it("13. a storage failure marks the row FAILED, preserves the error, and mutates nothing", async () => {
    seedCert(); seedVerification(); seedOrg();
    const boom = new Error("storage down");
    await expect(
      new ExportCertificateToMinistryCommand({ certificateId: "cert-1" }, ctx, makeDeps({ store: async () => { throw boom; } })).run()
    ).rejects.toBe(boom);

    const rows = exportRows();
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe("FAILED");
    // No success side effects.
    expect(store("certificateEvent").filter((e) => e.eventType === "certificate.exported")).toHaveLength(0);
    expect(store("auditLog").filter((a) => a.action === "certificate.exported")).toHaveLength(0);
    expect(published.events).toHaveLength(0);
    // Certificate untouched.
    expect(store("certificate")[0].status).toBe("ISSUED");
    expect(store("certificate")[0].checksum).toBe("cert-checksum-1");
  });
});

// ─── Architecture guards (25–32; static) ───────────────────────────────────────
describe("Phase 11 architecture guards", () => {
  const DIR = join(process.cwd(), "src", "modules", "certificates");
  const COMMAND = readFileSync(join(DIR, "commands", "export-certificate-to-ministry.command.ts"), "utf8");
  const PAYLOAD = readFileSync(join(DIR, "export", "certificate-ministry-payload.ts"), "utf8");
  const FORMATTERS = readFileSync(join(DIR, "export", "certificate-ministry-formatters.ts"), "utf8");
  const TRANSPORT = readFileSync(join(DIR, "export", "certificate-ministry-transport.ts"), "utf8");
  const STORAGE = readFileSync(join(DIR, "export", "certificate-ministry-storage.ts"), "utf8");
  const PURE = [PAYLOAD, FORMATTERS, TRANSPORT];
  const ALL = [COMMAND, PAYLOAD, FORMATTERS, TRANSPORT, STORAGE];
  const each = (fn: (src: string) => void) => ALL.forEach(fn);

  it("25. no Academic Core imports", () => {
    each((src) => {
      expect(src).not.toMatch(/modules\/(grades|attendance|assessments|academic|enrollments)/);
      expect(src).not.toMatch(/StudentCourseProgress|StudentSubjectProgress|StudentLevelProgress/);
    });
  });

  it("26. no Transcript imports", () => {
    each((src) => {
      expect(src).not.toMatch(/modules\/transcripts/);
      expect(src).not.toMatch(/AcademicTranscript/);
    });
  });

  it("27. no Eligibility engine imports", () => {
    each((src) => {
      expect(src).not.toMatch(/certificate-eligibility|evaluateCertificateEligibility|EligibilityEngine/);
    });
  });

  it("28. no PDF renderer imports", () => {
    each((src) => {
      expect(src).not.toMatch(/certificate-pdf-renderer|react-pdf|renderToBuffer/);
    });
  });

  it("29. no public-verification service imports", () => {
    each((src) => {
      expect(src).not.toMatch(/certificate-public-verification/);
    });
  });

  it("30. the pure builder/formatter/transport import no repository / DB / storage", () => {
    PURE.forEach((src) => {
      expect(src).not.toMatch(/repositories\//);
      expect(src).not.toMatch(/@\/server\/db/);
      expect(src).not.toMatch(/infrastructure\/storage/);
    });
  });

  it("31/32. the command imports no academic rule and mutates no certificate lifecycle", () => {
    // Import paths / symbols (not prose) — the command must not pull in an academic
    // engine or an eligibility evaluator.
    expect(COMMAND).not.toMatch(
      /modules\/(grades|attendance|assessments)|GradeCalculation|attendance-calculation|certificate-eligibility|evaluateCertificateEligibility|EligibilityEngine/
    );
    // No lifecycle-transition repository call.
    expect(COMMAND).not.toMatch(
      /markCertificateRevoked|markCertificateSuspended|markCertificateRestored|markCertificateStale|markCertificateIssued|updateCertificateMetadata/
    );
  });
});
