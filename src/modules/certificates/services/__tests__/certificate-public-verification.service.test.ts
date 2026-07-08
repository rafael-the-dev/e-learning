import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { asClient, makeFakeDb, seed, type FakeDb } from "../../repositories/__tests__/_fake-db";
import { verifyCertificatePublicService } from "../certificate-public-verification.service";
import { certificateVerificationCodeSchema } from "../../schemas/certificate.schema";

// =============================================================================
// VerifyCertificatePublicService — behavioural tests (Phase 7)
// -----------------------------------------------------------------------------
// Real repository (findPublicVerificationByCode) over the fake DB, seeding the
// verification + certificate + organization rows. Asserts the status mapping,
// name masking, PRIVACY whitelist (no transcript/checksum/grades/finance/internal
// ids leak), the counter increment, and NOT_FOUND behaviour. Plus static
// architecture guards on the Phase 7 sources.
// =============================================================================

const ORG = "org-A";
const CODE = "abcdef0123456789abcdef0123456789"; // 32 hex chars
const NOW = new Date("2026-07-08T12:00:00.000Z");

// Sensitive values that must NEVER appear in the public response.
const SECRETS = {
  transcriptVersionId: "ver-SECRET",
  transcriptChecksum: "tchk-SECRET",
  checksum: "csum-SECRET",
  idNumber: "BI-SECRET-999",
};

function seedCertificate(db: FakeDb, overrides: Record<string, unknown> = {}): void {
  seed(db, "organization", { id: ORG, name: "Escola de Condução Central" });
  seed(db, "certificate", {
    id: "cert-1",
    organizationId: ORG,
    studentId: "stu-1",
    courseId: "course-1",
    transcriptVersionId: SECRETS.transcriptVersionId,
    transcriptNumber: "TR-2026-000001",
    transcriptChecksum: SECRETS.transcriptChecksum,
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
    courseSnapshot: JSON.stringify({ courseId: "course-1", courseName: "Carta de Condução B", enrollmentId: "enr-1" }),
    financialClearanceStatus: "CLEARED",
    checksum: SECRETS.checksum,
    issuedAt: new Date("2026-07-05T00:00:00.000Z"),
    expiresAt: null,
    deletedAt: null,
    ...overrides,
  });
  seed(db, "certificateVerification", {
    id: "vrow-1",
    organizationId: ORG,
    certificateId: "cert-1",
    verificationCode: CODE,
    publicStatus: (overrides.__publicStatus as string) ?? "VALID",
    verificationCount: 0,
    lastVerifiedAt: null,
    expiresAt: null,
  });
}

const verifRow = (db: FakeDb) => db.certificateVerification.__store[0] as Record<string, unknown>;

describe("VerifyCertificatePublicService — status mapping", () => {
  it("7. valid certificate returns VALID with the whitelisted fields", async () => {
    const db = makeFakeDb();
    seedCertificate(db);
    const dto = await verifyCertificatePublicService.verify({ verificationCode: CODE, now: NOW }, asClient(db));
    expect(dto.status).toBe("VALID");
    expect(dto.publicStatus).toBe("VALID");
    expect(dto.certificateNumber).toBe("CERT-2026-000042");
    expect(dto.certificateType).toBe("COURSE_COMPLETION");
    expect(dto.organizationName).toBe("Escola de Condução Central");
    expect(dto.courseName).toBe("Carta de Condução B");
    expect(dto.issuedAt).toEqual(new Date("2026-07-05T00:00:00.000Z"));
  });

  it("8. EXPIRED projection on an ISSUED certificate returns EXPIRED", async () => {
    const db = makeFakeDb();
    seedCertificate(db, { __publicStatus: "EXPIRED" });
    const dto = await verifyCertificatePublicService.verify({ verificationCode: CODE, now: NOW }, asClient(db));
    expect(dto.status).toBe("EXPIRED");
  });

  it("9. REVOKED certificate returns REVOKED", async () => {
    const db = makeFakeDb();
    seedCertificate(db, { status: "REVOKED", __publicStatus: "REVOKED" });
    const dto = await verifyCertificatePublicService.verify({ verificationCode: CODE, now: NOW }, asClient(db));
    expect(dto.status).toBe("REVOKED");
  });

  it("10. SUSPENDED certificate returns SUSPENDED", async () => {
    const db = makeFakeDb();
    seedCertificate(db, { status: "SUSPENDED", __publicStatus: "SUSPENDED" });
    const dto = await verifyCertificatePublicService.verify({ verificationCode: CODE, now: NOW }, asClient(db));
    expect(dto.status).toBe("SUSPENDED");
  });

  it("11. unknown code returns NOT_FOUND with only null fields", async () => {
    const db = makeFakeDb();
    seedCertificate(db);
    const dto = await verifyCertificatePublicService.verify({ verificationCode: "0".repeat(32), now: NOW }, asClient(db));
    expect(dto.status).toBe("NOT_FOUND");
    expect(dto.certificateNumber).toBeNull();
    expect(dto.organizationName).toBeNull();
    expect(dto.studentDisplayName).toBeNull();
  });

  it("soft-deleted certificate returns NOT_FOUND", async () => {
    const db = makeFakeDb();
    seedCertificate(db, { deletedAt: new Date("2026-07-06T00:00:00.000Z") });
    const dto = await verifyCertificatePublicService.verify({ verificationCode: CODE, now: NOW }, asClient(db));
    expect(dto.status).toBe("NOT_FOUND");
  });

  it.each(["DRAFT", "PENDING_APPROVAL", "STALE"])(
    "not-publicly-issued (%s) returns NOT_FOUND (never VALID)",
    async (status) => {
      const db = makeFakeDb();
      seedCertificate(db, { status });
      const dto = await verifyCertificatePublicService.verify({ verificationCode: CODE, now: NOW }, asClient(db));
      expect(dto.status).toBe("NOT_FOUND");
    }
  );
});

describe("VerifyCertificatePublicService — privacy", () => {
  it("12/13. response hides transcript pointer/checksum, certificate checksum, document number, and academic/finance data", async () => {
    const db = makeFakeDb();
    seedCertificate(db);
    const dto = await verifyCertificatePublicService.verify({ verificationCode: CODE, now: NOW }, asClient(db));

    // Exact whitelist of keys — nothing else may be present.
    expect(Object.keys(dto).sort()).toEqual(
      [
        "certificateNumber",
        "certificateType",
        "courseName",
        "expiresAt",
        "issuedAt",
        "organizationName",
        "publicStatus",
        "status",
        "studentDisplayName",
      ].sort()
    );

    // None of the secret values leak anywhere in the serialized response.
    const serialized = JSON.stringify(dto);
    for (const secret of Object.values(SECRETS)) {
      expect(serialized).not.toContain(secret);
    }
    // No academic/finance/internal-id keys.
    expect(serialized).not.toMatch(/transcript|checksum|grade|attendance|financ|idNumber|studentId|verificationCount/i);
  });

  it("student name is masked to first name + trailing initials", async () => {
    const db = makeFakeDb();
    seedCertificate(db);
    const dto = await verifyCertificatePublicService.verify({ verificationCode: CODE, now: NOW }, asClient(db));
    expect(dto.studentDisplayName).toBe("João S. C.");
  });
});

describe("VerifyCertificatePublicService — verification counter (§5)", () => {
  it("14/15. increments verificationCount and sets lastVerifiedAt on a successful lookup", async () => {
    const db = makeFakeDb();
    seedCertificate(db);
    await verifyCertificatePublicService.verify({ verificationCode: CODE, now: NOW }, asClient(db));
    expect(verifRow(db).verificationCount).toBe(1);
    expect(verifRow(db).lastVerifiedAt).toEqual(NOW);
  });

  it("NOT_FOUND does not increment any counter", async () => {
    const db = makeFakeDb();
    seedCertificate(db);
    await verifyCertificatePublicService.verify({ verificationCode: "0".repeat(32), now: NOW }, asClient(db));
    expect(verifRow(db).verificationCount).toBe(0);
    expect(verifRow(db).lastVerifiedAt).toBeNull();
  });

  it("a REVOKED (still successful) lookup increments the counter", async () => {
    const db = makeFakeDb();
    seedCertificate(db, { status: "REVOKED", __publicStatus: "REVOKED" });
    await verifyCertificatePublicService.verify({ verificationCode: CODE, now: NOW }, asClient(db));
    expect(verifRow(db).verificationCount).toBe(1);
  });
});

describe("certificateVerificationCodeSchema (§16 — invalid code rejected)", () => {
  it("accepts a 32-char lowercase-hex code", () => {
    expect(certificateVerificationCodeSchema.safeParse(CODE).success).toBe(true);
  });
  it.each(["", "short", "ABCDEF0123456789ABCDEF0123456789", "zz".repeat(16), "abc def", "1".repeat(31)])(
    "rejects invalid code %j",
    (bad) => {
      expect(certificateVerificationCodeSchema.safeParse(bad).success).toBe(false);
    }
  );
});

// ─── Architecture guards (18–23; static) ─────────────────────────────────────

describe("Phase 7 — architecture guards", () => {
  const DIR = join(process.cwd(), "src", "modules", "certificates");
  const FILES = [
    join(DIR, "services", "certificate-public-verification.service.ts"),
    join(DIR, "services", "certificate-expiry.service.ts"),
    join(DIR, "repositories", "certificate-public-verification.repository.ts"),
  ];
  const SRCS = FILES.map((f) => readFileSync(f, "utf8"));
  const each = (fn: (src: string) => void) => SRCS.forEach(fn);

  it("18. no Academic Core imports", () => {
    each((src) => {
      expect(src).not.toMatch(/modules\/(grades|attendance|assessments|academic|enrollments)/);
      expect(src).not.toMatch(/StudentCourseProgress|StudentSubject|LevelProgress/);
    });
  });

  it("19. no Transcript imports", () => {
    each((src) => {
      expect(src).not.toMatch(/modules\/transcripts/);
      expect(src).not.toMatch(/certificate-transcript-source|AcademicTranscript/);
    });
  });

  it("20. no Grade / Attendance imports", () => {
    each((src) => {
      expect(src).not.toMatch(/GradeCalculation|grade-calculation|AttendanceCalculation|attendance-calculation/);
    });
  });

  it("21. no PDF / storage / export imports", () => {
    each((src) => {
      expect(src).not.toMatch(/react-pdf|puppeteer|generatePdf|uploadthing|infrastructure\/storage|certificate-export/i);
    });
  });

  it("22. public source/service never reads or maps a sensitive column (code identifiers, not prose)", () => {
    const publicSrc = SRCS[0] + SRCS[2];
    // Camel-case column identifiers would only appear if the code selected/mapped them.
    expect(publicSrc).not.toMatch(/transcriptChecksum|transcriptVersionId|financialClearance|idNumber/);
    // No `.checksum` property access anywhere in the public path.
    expect(publicSrc).not.toMatch(/\.checksum\b/);
  });

  it("23. expiry path mutates ONLY the verification projection, never Certificate.status", () => {
    const expirySrc = SRCS[1] + SRCS[2];
    expect(expirySrc).not.toMatch(/certificate\.update/); // no write to the certificate table
    expect(expirySrc).not.toMatch(/markCertificate(Issued|Revoked|Suspended|Restored|Stale)/);
    // Positive: the projection update is the only mutation.
    expect(SRCS[2]).toMatch(/certificateVerification\.updateMany/);
  });
});
