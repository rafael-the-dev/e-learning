import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeFakeDb, seed, type FakeDb } from "../../repositories/__tests__/_fake-db";

// =============================================================================
// CertificateExportDownloadService — behavioural tests (Phase 8C)
// -----------------------------------------------------------------------------
// Real repository (findCertificateExportDownloadById) over the fake DB; the storage
// READER is an injected fake and the student-scope helpers are mocked so ownership
// is controlled without a DB. Asserts authorization (staff / own / denied), export
// READY-gating, certificate-state download policy, tenant isolation, that the reader
// is called with the INTERNAL derived key, that no fileUrl/storageKey leaks, and the
// Phase-8C architecture guards.
// =============================================================================

const h = vi.hoisted(() => ({ db: null as unknown as FakeDb }));
const scope = vi.hoisted(() => ({
  isStudentScoped: false as boolean,
  resolved: { studentId: undefined as string | undefined },
}));

vi.mock("@/server/db", () => ({ getDb: vi.fn(async () => h.db) }));
vi.mock("@/server/auth/student-scope", () => ({
  isStudentScopedRoles: () => scope.isStudentScoped,
  resolveStudentScope: async () => ({
    isStudentScoped: scope.isStudentScoped,
    studentId: scope.resolved.studentId,
    userId: "u-1",
    organizationId: "org-A",
  }),
}));

import { AuthorizationError, BusinessRuleError, NotFoundError } from "@/shared/lib/command";
import { PERMISSIONS, SYSTEM_ROLES } from "@/server/auth/permissions";
import type { AuthContext } from "@/server/auth/context";
import type { CertificateExportStorageReader } from "@/modules/certificates/export/certificate-export-storage-reader";
import { CertificateExportDownloadService } from "../certificate-export-download.service";

const ORG = "org-A";
const OTHER_ORG = "org-B";
const PDF_BYTES = Buffer.from("%PDF-1.4 real-bytes");

// ── Injected storage reader ──────────────────────────────────────────────────
const readCalls: string[] = [];
function makeReader(overrides: { read?: () => Promise<Buffer> } = {}): CertificateExportStorageReader {
  return {
    read: vi.fn(async (key: string) => {
      readCalls.push(key);
      return overrides.read ? overrides.read() : PDF_BYTES;
    }),
  };
}

function service(reader = makeReader()) {
  return new CertificateExportDownloadService({ reader });
}

/** Build an AuthContext-like object with a set-backed ability. */
function ctx(opts: { roles?: string[]; perms?: string[]; org?: string } = {}): AuthContext {
  const perms = new Set(opts.perms ?? []);
  return {
    userId: "u-1",
    organizationId: opts.org ?? ORG,
    roles: opts.roles ?? [],
    ability: { can: (p: string) => perms.has(p) },
  } as unknown as AuthContext;
}

function seedExport(opts: {
  status?: string;
  certStatus?: string;
  studentId?: string;
  deletedAt?: Date | null;
  org?: string;
} = {}): void {
  const org = opts.org ?? ORG;
  seed(h.db, "certificateExport", {
    id: "exp-1",
    organizationId: org,
    certificateId: "cert-1",
    exportType: "PDF",
    status: opts.status ?? "READY",
    fileUrl: "/uploads/certificates/org-A/cert-1/exp-1.pdf",
    fileChecksum: "filechk-abc123",
  });
  seed(h.db, "certificate", {
    id: "cert-1",
    organizationId: org,
    studentId: opts.studentId ?? "stu-1",
    status: opts.certStatus ?? "ISSUED",
    certificateNumber: "CERT-2026-000042",
    certificateType: "COURSE_COMPLETION",
    deletedAt: opts.deletedAt ?? null,
  });
}

const staffCtx = () => ctx({ roles: [SYSTEM_ROLES.ORG_ADMIN], perms: [PERMISSIONS.CERTIFICATES_VIEW] });
const secretaryCtx = () => ctx({ roles: [SYSTEM_ROLES.SECRETARY], perms: [PERMISSIONS.CERTIFICATES_EXPORT] });
function studentCtx(studentId = "stu-1") {
  scope.isStudentScoped = true;
  scope.resolved.studentId = studentId;
  return ctx({ roles: [SYSTEM_ROLES.STUDENT], perms: [PERMISSIONS.CERTIFICATES_VIEW_OWN] });
}

beforeEach(() => {
  vi.clearAllMocks();
  h.db = makeFakeDb();
  readCalls.length = 0;
  scope.isStudentScoped = false;
  scope.resolved.studentId = undefined;
});
afterEach(() => vi.restoreAllMocks());

// ── Authorization (§2 / tests 2–8) ───────────────────────────────────────────
describe("CertificateExportDownloadService — authorization", () => {
  it("2. ORG_ADMIN (certificates.view) downloads any org export", async () => {
    seedExport();
    const result = await service().download(staffCtx(), "exp-1");
    expect(result.buffer.equals(PDF_BYTES)).toBe(true);
  });

  it("3. SECRETARY (certificates.export) downloads", async () => {
    seedExport();
    const result = await service().download(secretaryCtx(), "exp-1");
    expect(result.buffer.equals(PDF_BYTES)).toBe(true);
  });

  it("4. STUDENT downloads their OWN certificate export", async () => {
    seedExport({ studentId: "stu-1" });
    const result = await service().download(studentCtx("stu-1"), "exp-1");
    expect(result.buffer.equals(PDF_BYTES)).toBe(true);
  });

  it("5. STUDENT is denied another student's export", async () => {
    seedExport({ studentId: "stu-1" });
    await expect(service().download(studentCtx("stu-OTHER"), "exp-1")).rejects.toBeInstanceOf(
      AuthorizationError
    );
    expect(readCalls.length).toBe(0);
  });

  it("6. TEACHER (no certificate permission) is denied", async () => {
    seedExport();
    const teacher = ctx({ roles: [SYSTEM_ROLES.TEACHER], perms: [] });
    await expect(service().download(teacher, "exp-1")).rejects.toBeInstanceOf(AuthorizationError);
  });

  it("7. GUARDIAN is denied (guardian certificate visibility deferred)", async () => {
    seedExport();
    const guardian = ctx({ roles: [SYSTEM_ROLES.GUARDIAN], perms: [] });
    await expect(service().download(guardian, "exp-1")).rejects.toBeInstanceOf(AuthorizationError);
  });

  it("8. a cross-tenant export is NOT_FOUND", async () => {
    seedExport({ org: ORG });
    const otherOrgAdmin = ctx({ roles: [SYSTEM_ROLES.ORG_ADMIN], perms: [PERMISSIONS.CERTIFICATES_VIEW], org: OTHER_ORG });
    await expect(service().download(otherOrgAdmin, "exp-1")).rejects.toBeInstanceOf(NotFoundError);
  });

  it("a student-scoped caller WITHOUT viewOwn is denied", async () => {
    seedExport({ studentId: "stu-1" });
    scope.isStudentScoped = true;
    scope.resolved.studentId = "stu-1";
    const noPerm = ctx({ roles: [SYSTEM_ROLES.STUDENT], perms: [] });
    await expect(service().download(noPerm, "exp-1")).rejects.toBeInstanceOf(AuthorizationError);
  });
});

// ── Export state (§ tests 9–12) ──────────────────────────────────────────────
describe("CertificateExportDownloadService — export state", () => {
  it("9. a READY export downloads", async () => {
    seedExport({ status: "READY" });
    const result = await service().download(staffCtx(), "exp-1");
    expect(result.buffer.equals(PDF_BYTES)).toBe(true);
  });

  it("10. a PENDING export is not downloadable (staff → NOT_FOUND)", async () => {
    seedExport({ status: "PENDING" });
    await expect(service().download(staffCtx(), "exp-1")).rejects.toBeInstanceOf(NotFoundError);
    expect(readCalls.length).toBe(0);
  });

  it("11. a FAILED export is not downloadable (staff → NOT_FOUND)", async () => {
    seedExport({ status: "FAILED" });
    await expect(service().download(staffCtx(), "exp-1")).rejects.toBeInstanceOf(NotFoundError);
  });

  it("12. a missing export is NOT_FOUND", async () => {
    // nothing seeded
    await expect(service().download(staffCtx(), "does-not-exist")).rejects.toBeInstanceOf(
      NotFoundError
    );
  });

  it("the OWNER of a not-ready export gets a 409-style BusinessRuleError", async () => {
    seedExport({ status: "PENDING", studentId: "stu-1" });
    await expect(service().download(studentCtx("stu-1"), "exp-1")).rejects.toBeInstanceOf(
      BusinessRuleError
    );
  });
});

// ── Certificate state (§ tests 13–16) ────────────────────────────────────────
describe("CertificateExportDownloadService — certificate state", () => {
  it("13. an ISSUED certificate's export downloads", async () => {
    seedExport({ certStatus: "ISSUED" });
    const result = await service().download(staffCtx(), "exp-1");
    expect(result.buffer.equals(PDF_BYTES)).toBe(true);
  });

  it("14. a SUSPENDED certificate's export downloads (verification shows SUSPENDED separately)", async () => {
    seedExport({ certStatus: "SUSPENDED" });
    const result = await service().download(staffCtx(), "exp-1");
    expect(result.buffer.equals(PDF_BYTES)).toBe(true);
  });

  it("15. a REVOKED certificate's export downloads (verification shows REVOKED separately)", async () => {
    seedExport({ certStatus: "REVOKED" });
    const result = await service().download(staffCtx(), "exp-1");
    expect(result.buffer.equals(PDF_BYTES)).toBe(true);
  });

  it("16. a soft-deleted certificate's export is NOT_FOUND", async () => {
    seedExport({ deletedAt: new Date("2026-07-01T00:00:00.000Z") });
    await expect(service().download(staffCtx(), "exp-1")).rejects.toBeInstanceOf(NotFoundError);
  });
});

// ── Storage (§ tests 17–20) ──────────────────────────────────────────────────
describe("CertificateExportDownloadService — storage", () => {
  it("17. the reader is called with the INTERNAL derived storage key", async () => {
    seedExport();
    await service().download(staffCtx(), "exp-1");
    expect(readCalls[0]).toBe("certificates/org-A/cert-1/exp-1.pdf");
  });

  it("18. the result never leaks the raw fileUrl / storage key", async () => {
    seedExport();
    const result = await service().download(staffCtx(), "exp-1");
    expect("fileUrl" in result).toBe(false);
    expect("storageKey" in result).toBe(false);
    expect(Object.keys(result).sort()).toEqual(
      ["buffer", "certificateNumber", "contentType", "fileChecksum"].sort()
    );
  });

  it("19. a storage read failure propagates (route maps it to a generic 500)", async () => {
    seedExport();
    const reader = makeReader({ read: async () => { throw new Error("ENOENT: missing object"); } });
    await expect(service(reader).download(staffCtx(), "exp-1")).rejects.toThrow(/ENOENT/);
  });

  it("20. the artifact bytes are returned as-is", async () => {
    seedExport();
    const result = await service().download(staffCtx(), "exp-1");
    expect(result.contentType).toBe("application/pdf");
    expect(result.buffer.toString("utf8")).toBe("%PDF-1.4 real-bytes");
    expect(result.fileChecksum).toBe("filechk-abc123");
  });
});

// ── Architecture guards (§ tests 26–32; static) ──────────────────────────────
describe("CertificateExportDownloadService — architecture guards", () => {
  const CERT_DIR = join(process.cwd(), "src", "modules", "certificates");
  const SERVICE = readFileSync(join(CERT_DIR, "services", "certificate-export-download.service.ts"), "utf8");
  const READER = readFileSync(join(CERT_DIR, "export", "certificate-export-storage-reader.ts"), "utf8");
  const REPO = readFileSync(join(CERT_DIR, "repositories", "certificate-export.repository.ts"), "utf8");
  const ROUTE = readFileSync(
    join(process.cwd(), "src", "app", "api", "certificates", "exports", "[exportId]", "download", "route.ts"),
    "utf8"
  );
  const ALL = [SERVICE, READER, REPO, ROUTE];
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

  it("29. no PDF rendering imports", () => {
    each((src) => {
      expect(src).not.toMatch(/react-pdf|renderToBuffer|certificate-pdf-renderer|generatePdf/i);
    });
  });

  it("30. no export-generation command import", () => {
    each((src) => {
      expect(src).not.toMatch(/export-certificate\.command|ExportCertificateCommand/);
    });
  });

  it("31. no public-verification service import", () => {
    each((src) => {
      expect(src).not.toMatch(/certificate-public-verification/);
    });
  });

  it("32. no UI / React imports", () => {
    each((src) => {
      expect(src).not.toMatch(/from ["']react["']/);
      expect(src).not.toMatch(/@\/components\//);
      expect(src).not.toMatch(/["']use client["']/);
      expect(src).not.toMatch(/\.tsx["']/);
    });
  });
});
