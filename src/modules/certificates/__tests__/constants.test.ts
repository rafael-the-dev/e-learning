import { describe, it, expect } from "vitest";
import {
  CertificateEligibilityBlocker,
  CertificateEligibilityWarning,
  CertificateExportStatus,
  CertificateExportType,
  CertificatePolicyStatus,
  CertificateRequestStatus,
  CertificateStatus,
  CertificateTemplateStatus,
  CertificateType,
  CertificateVerificationPublicStatus,
  FinancialClearanceStatus,
  StaleReason,
} from "@/modules/certificates/constants";
import { DomainAggregateType, DomainEventType } from "@/server/events/event-types";

// =============================================================================
// PHASE 0 — DOMAIN CONSTANTS (tests 1–3) + EVENTS (tests 19–20)
// =============================================================================

describe("certificate constants — types (test 1)", () => {
  it("declares exactly the ten architecture-frozen certificate types", () => {
    expect(Object.values(CertificateType).sort()).toEqual(
      [
        "COURSE_COMPLETION",
        "LEVEL_COMPLETION",
        "PARTICIPATION",
        "ATTENDANCE",
        "ACHIEVEMENT",
        "PROFESSIONAL_TRAINING",
        "DRIVING_SCHOOL",
        "LANGUAGE_COURSE",
        "IT_COURSE",
        "DESIGN_COURSE",
      ].sort()
    );
  });
});

describe("certificate constants — statuses match architecture (test 2)", () => {
  it("certificate lifecycle statuses", () => {
    expect(Object.values(CertificateStatus).sort()).toEqual(
      ["DRAFT", "PENDING_APPROVAL", "ISSUED", "SUSPENDED", "REVOKED", "STALE"].sort()
    );
    // Expiry is deliberately NOT a certificate status (D-6).
    expect(Object.values(CertificateStatus)).not.toContain("EXPIRED");
  });

  it("policy + template lifecycle statuses", () => {
    expect(Object.values(CertificatePolicyStatus).sort()).toEqual(
      ["ACTIVE", "INACTIVE", "ARCHIVED"].sort()
    );
    expect(Object.values(CertificateTemplateStatus).sort()).toEqual(
      ["ACTIVE", "INACTIVE", "ARCHIVED"].sort()
    );
  });

  it("request lifecycle statuses", () => {
    expect(Object.values(CertificateRequestStatus).sort()).toEqual(
      ["PENDING", "APPROVED", "REJECTED", "FULFILLED", "CANCELLED"].sort()
    );
  });

  it("public verification statuses include EXPIRED (projection only)", () => {
    expect(Object.values(CertificateVerificationPublicStatus).sort()).toEqual(
      ["VALID", "REVOKED", "SUSPENDED", "EXPIRED", "NOT_FOUND"].sort()
    );
  });

  it("export type + status vocabularies", () => {
    expect(Object.values(CertificateExportType).sort()).toEqual(["PDF", "API", "MINISTRY"].sort());
    expect(Object.values(CertificateExportStatus).sort()).toEqual(
      ["PENDING", "READY", "FAILED"].sort()
    );
  });

  it("eligibility blockers", () => {
    expect(Object.values(CertificateEligibilityBlocker).sort()).toEqual(
      [
        "POLICY_NOT_FOUND",
        "TRANSCRIPT_NOT_ISSUED",
        "TRANSCRIPT_REVOKED",
        "TRANSCRIPT_SUPERSEDED",
        "COURSE_NOT_COMPLETED",
        "PENDING_REQUIRED_SUBJECTS",
        "FINANCIAL_CLEARANCE_REQUIRED",
        "MANUAL_APPROVAL_REQUIRED",
        "CERTIFICATE_ALREADY_ISSUED",
      ].sort()
    );
  });

  it("eligibility warnings", () => {
    expect(Object.values(CertificateEligibilityWarning).sort()).toEqual(
      [
        "TRANSCRIPT_SUPERSEDED_WARNING",
        "TRANSCRIPT_STALE_WARNING",
        "CERTIFICATE_EXPIRING_SOON",
        "FINANCIAL_CLEARANCE_UNKNOWN",
        "MANUAL_APPROVAL_REQUIRED_WARNING",
      ].sort()
    );
  });

  it("financial clearance + stale reason vocabularies", () => {
    expect(Object.values(FinancialClearanceStatus).sort()).toEqual(
      ["NOT_REQUIRED", "CLEARED", "NOT_CLEARED", "UNKNOWN"].sort()
    );
    expect(Object.values(StaleReason).sort()).toEqual(
      [
        "TRANSCRIPT_SUPERSEDED",
        "TRANSCRIPT_REVOKED",
        "TRANSCRIPT_MARKED_STALE",
        "POLICY_CHANGED",
        "TEMPLATE_CHANGED",
      ].sort()
    );
  });
});

describe("certificate constants — no duplicate values (test 3)", () => {
  const groups: Record<string, Record<string, string>> = {
    CertificateType,
    CertificateStatus,
    CertificatePolicyStatus,
    CertificateTemplateStatus,
    CertificateRequestStatus,
    CertificateVerificationPublicStatus,
    CertificateExportType,
    CertificateExportStatus,
    CertificateEligibilityBlocker,
    FinancialClearanceStatus,
    StaleReason,
  };

  for (const [name, obj] of Object.entries(groups)) {
    it(`${name} has no duplicate values and value === key`, () => {
      const vals = Object.values(obj);
      expect(new Set(vals).size).toBe(vals.length);
      // Convention: const-object key equals its value.
      for (const [k, v] of Object.entries(obj)) expect(v).toBe(k);
    });
  }
});

describe("certificate domain events (tests 19–20)", () => {
  it("declares all nine certificate DomainEventType constants (test 19)", () => {
    expect(DomainEventType.CERTIFICATE_GENERATED).toBe("certificate.generated");
    expect(DomainEventType.CERTIFICATE_APPROVED).toBe("certificate.approved");
    expect(DomainEventType.CERTIFICATE_ISSUED).toBe("certificate.issued");
    expect(DomainEventType.CERTIFICATE_REVOKED).toBe("certificate.revoked");
    expect(DomainEventType.CERTIFICATE_SUSPENDED).toBe("certificate.suspended");
    expect(DomainEventType.CERTIFICATE_RESTORED).toBe("certificate.restored");
    expect(DomainEventType.CERTIFICATE_MARKED_STALE).toBe("certificate.marked_stale");
    expect(DomainEventType.CERTIFICATE_EXPORTED).toBe("certificate.exported");
    expect(DomainEventType.CERTIFICATE_VERIFIED).toBe("certificate.verified");
  });

  it("declares the CERTIFICATE aggregate type (test 20)", () => {
    expect(DomainAggregateType.CERTIFICATE).toBe("CERTIFICATE");
  });
});
