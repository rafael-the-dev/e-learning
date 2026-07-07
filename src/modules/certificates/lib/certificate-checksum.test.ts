import { describe, it, expect } from "vitest";
import {
  certificateContentChecksum,
  canonicalCertificateString,
  type CertificateChecksumInput,
} from "@/modules/certificates/lib/certificate-checksum";
import {
  CertificateType,
  FinancialClearanceStatus,
} from "@/modules/certificates/constants";

// =============================================================================
// PHASE 0 — CERTIFICATE CHECKSUM CONTRACT (tests 10–13)
// =============================================================================

function baseInput(): CertificateChecksumInput {
  return {
    certificateNumber: "CERT-2026-000001",
    transcriptVersionId: "tv-1",
    transcriptChecksum: "abc123",
    studentSnapshot: { studentId: "stu-1", fullName: "João Silva" },
    courseSnapshot: { courseId: "crs-1", courseName: "Categoria B" },
    certificateType: CertificateType.COURSE_COMPLETION,
    issuedAt: new Date("2026-07-07T10:00:00.000Z"),
    policyId: "pol-1",
    templateId: "tpl-1",
    financialClearanceStatus: FinancialClearanceStatus.CLEARED,
  };
}

describe("certificate checksum (tests 10–13)", () => {
  it("same content => same checksum (test 10)", () => {
    expect(certificateContentChecksum(baseInput())).toBe(certificateContentChecksum(baseInput()));
  });

  it("is independent of object-key insertion order", () => {
    const a = baseInput();
    const b: CertificateChecksumInput = {
      financialClearanceStatus: FinancialClearanceStatus.CLEARED,
      templateId: "tpl-1",
      policyId: "pol-1",
      issuedAt: new Date("2026-07-07T10:00:00.000Z"),
      certificateType: CertificateType.COURSE_COMPLETION,
      courseSnapshot: { courseName: "Categoria B", courseId: "crs-1" },
      studentSnapshot: { fullName: "João Silva", studentId: "stu-1" },
      transcriptChecksum: "abc123",
      transcriptVersionId: "tv-1",
      certificateNumber: "CERT-2026-000001",
    };
    expect(certificateContentChecksum(a)).toBe(certificateContentChecksum(b));
  });

  it("any checksummed field change => different checksum (test 11)", () => {
    const base = certificateContentChecksum(baseInput());

    const mutations: Array<Partial<CertificateChecksumInput>> = [
      { certificateNumber: "CERT-2026-000002" },
      { transcriptVersionId: "tv-2" },
      { transcriptChecksum: "def456" },
      { studentSnapshot: { studentId: "stu-2", fullName: "João Silva" } },
      { courseSnapshot: { courseId: "crs-2", courseName: "Categoria B" } },
      { certificateType: CertificateType.PARTICIPATION },
      { issuedAt: new Date("2026-07-08T10:00:00.000Z") },
      { policyId: "pol-2" },
      { templateId: "tpl-2" },
      { financialClearanceStatus: FinancialClearanceStatus.NOT_CLEARED },
    ];

    for (const patch of mutations) {
      expect(certificateContentChecksum({ ...baseInput(), ...patch })).not.toBe(base);
    }
  });

  it("date normalization is stable across Date instances (test 12)", () => {
    const a = { ...baseInput(), issuedAt: new Date("2026-07-07T10:00:00.000Z") };
    const b = { ...baseInput(), issuedAt: new Date(Date.parse("2026-07-07T10:00:00.000Z")) };
    expect(certificateContentChecksum(a)).toBe(certificateContentChecksum(b));
  });

  it("null course snapshot is preserved as null in the canonical form (test 13)", () => {
    const withNull = { ...baseInput(), courseSnapshot: null };
    const canonical = canonicalCertificateString(withNull);
    expect(canonical).toContain('"course":null');
    // A null course and a missing/other course differ in the digest.
    expect(certificateContentChecksum(withNull)).not.toBe(certificateContentChecksum(baseInput()));
  });

  it("produces a lowercase-hex SHA-256 digest", () => {
    expect(certificateContentChecksum(baseInput())).toMatch(/^[0-9a-f]{64}$/);
  });
});
