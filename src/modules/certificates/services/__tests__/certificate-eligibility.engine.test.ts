import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  CertificateEligibilityBlocker as B,
  CertificateEligibilityWarning as W,
} from "@/modules/certificates/constants";
import type {
  CertificateEligibilityFacts,
  CertificatePolicyFacts,
} from "@/modules/certificates/types/eligibility-source";
import type { TranscriptSourceSubjectDto } from "@/modules/certificates/types/transcript-source";
import type { TranscriptCertificateSourceDto } from "@/modules/certificates/types/transcript-source";
import { evaluateCertificateEligibility } from "../certificate-eligibility.engine";

// =============================================================================
// CertificateEligibilityEngine — pure/deterministic evaluation tests (Phase 3B)
// -----------------------------------------------------------------------------
// The engine is a pure function of CertificateEligibilityFacts. These tests feed
// hand-built fixtures (no DB, no source) and assert the decision, its determinism,
// and that the engine takes no forbidden dependency.
// =============================================================================

const LOADED_AT = new Date("2026-07-07T10:00:00.000Z");

function subject(status: string, isRequired: boolean): TranscriptSourceSubjectDto {
  return {
    transcriptSubjectId: `sub-${status}-${isRequired}`,
    transcriptLevelId: "lvl-1",
    levelSubjectId: null,
    subjectId: null,
    subjectName: "Disciplina",
    subjectCode: null,
    subjectOrder: 1,
    finalGrade: null,
    status,
    minimumPassingGrade: null,
    attendancePercentage: null,
    minimumAttendancePercentage: null,
    completedAt: null,
    credits: null,
    workloadHours: null,
    isRequired,
    recoveryStatus: null,
  };
}

function makeTranscript(
  overrides: Partial<TranscriptCertificateSourceDto> = {}
): TranscriptCertificateSourceDto {
  return {
    transcriptVersionId: "ver-1",
    transcriptNumber: "TR-2026-000001",
    transcriptChecksum: "chk-1",
    transcriptStatus: "ISSUED",
    transcriptType: "COURSE_TRANSCRIPT",
    issuedAt: new Date("2026-07-01T00:00:00.000Z"),
    issuedBy: "user-1",
    studentSnapshot: { fullName: "João Silva" },
    courseSnapshot: { courseId: "course-1" },
    courseProgressSnapshot: { status: "COMPLETED" },
    levels: [],
    subjects: [subject("PASSED", true)],
    assessments: [],
    attendance: [],
    ...overrides,
  };
}

function makePolicy(overrides: Partial<CertificatePolicyFacts> = {}): CertificatePolicyFacts {
  return {
    id: "pol-1",
    certificateType: "COURSE_COMPLETION",
    requiresIssuedTranscript: true,
    requiresCourseCompleted: true,
    requiresNoPendingSubjects: true,
    requiresFinancialClearance: false,
    requiresManualApproval: false,
    autoIssueOnTranscriptIssued: false,
    validityMonths: null,
    staleAction: "MARK_STALE",
    ...overrides,
  };
}

function makeFacts(overrides: Partial<CertificateEligibilityFacts> = {}): CertificateEligibilityFacts {
  return {
    policy: makePolicy(),
    transcript: makeTranscript(),
    financialClearance: null,
    administrative: {},
    metadata: { loadedAt: LOADED_AT, sourceVersion: "1.0.0" },
    ...overrides,
  };
}

describe("evaluateCertificateEligibility — core decisions", () => {
  it("1. is eligible on the happy path", () => {
    const result = evaluateCertificateEligibility(makeFacts());
    expect(result.eligible).toBe(true);
    expect(result.blockingReasons).toEqual([]);
  });

  it("2. blocks POLICY_NOT_FOUND when policy is null", () => {
    const result = evaluateCertificateEligibility(makeFacts({ policy: null }));
    expect(result.blockingReasons).toContain(B.POLICY_NOT_FOUND);
    expect(result.eligible).toBe(false);
  });

  it("3. blocks TRANSCRIPT_NOT_ISSUED when transcript is null", () => {
    const result = evaluateCertificateEligibility(makeFacts({ transcript: null }));
    expect(result.blockingReasons).toContain(B.TRANSCRIPT_NOT_ISSUED);
  });

  it("4. blocks TRANSCRIPT_NOT_ISSUED for a DRAFT transcript", () => {
    const result = evaluateCertificateEligibility(
      makeFacts({ transcript: makeTranscript({ transcriptStatus: "DRAFT" }) })
    );
    expect(result.blockingReasons).toContain(B.TRANSCRIPT_NOT_ISSUED);
  });

  it("5. blocks TRANSCRIPT_REVOKED for a REVOKED transcript", () => {
    const result = evaluateCertificateEligibility(
      makeFacts({ transcript: makeTranscript({ transcriptStatus: "REVOKED" }) })
    );
    expect(result.blockingReasons).toContain(B.TRANSCRIPT_REVOKED);
    expect(result.blockingReasons).not.toContain(B.TRANSCRIPT_NOT_ISSUED);
  });

  it("6. blocks TRANSCRIPT_SUPERSEDED for a SUPERSEDED transcript", () => {
    const result = evaluateCertificateEligibility(
      makeFacts({ transcript: makeTranscript({ transcriptStatus: "SUPERSEDED" }) })
    );
    expect(result.blockingReasons).toContain(B.TRANSCRIPT_SUPERSEDED);
  });

  it("6b. does not emit snapshot-fact gates for a non-ISSUED transcript (no noisy blockers)", () => {
    // A DRAFT transcript with an incomplete course + pending subject must yield ONLY
    // the transcript-status blocker — the course/subject gates apply to ISSUED facts.
    const result = evaluateCertificateEligibility(
      makeFacts({
        transcript: makeTranscript({
          transcriptStatus: "DRAFT",
          courseProgressSnapshot: { status: "IN_PROGRESS" },
          subjects: [subject("IN_PROGRESS", true)],
        }),
      })
    );
    expect(result.blockingReasons).toEqual([B.TRANSCRIPT_NOT_ISSUED]);
    expect(result.blockingReasons).not.toContain(B.COURSE_NOT_COMPLETED);
    expect(result.blockingReasons).not.toContain(B.PENDING_REQUIRED_SUBJECTS);
  });

  it("7. blocks COURSE_NOT_COMPLETED when required and course status is not COMPLETED", () => {
    const result = evaluateCertificateEligibility(
      makeFacts({ transcript: makeTranscript({ courseProgressSnapshot: { status: "IN_PROGRESS" } }) })
    );
    expect(result.blockingReasons).toContain(B.COURSE_NOT_COMPLETED);
  });

  it("8. passes course completion when status is COMPLETED", () => {
    const result = evaluateCertificateEligibility(makeFacts());
    expect(result.blockingReasons).not.toContain(B.COURSE_NOT_COMPLETED);
  });

  it("9. blocks PENDING_REQUIRED_SUBJECTS for a required IN_PROGRESS subject", () => {
    const result = evaluateCertificateEligibility(
      makeFacts({ transcript: makeTranscript({ subjects: [subject("IN_PROGRESS", true)] }) })
    );
    expect(result.blockingReasons).toContain(B.PENDING_REQUIRED_SUBJECTS);
  });

  it("10. ignores a pending OPTIONAL subject (isRequired = false)", () => {
    const result = evaluateCertificateEligibility(
      makeFacts({
        transcript: makeTranscript({ subjects: [subject("PASSED", true), subject("IN_PROGRESS", false)] }),
      })
    );
    expect(result.blockingReasons).not.toContain(B.PENDING_REQUIRED_SUBJECTS);
    expect(result.eligible).toBe(true);
  });

  it("11. blocks FINANCIAL_CLEARANCE_REQUIRED when required and clearance is null", () => {
    const result = evaluateCertificateEligibility(
      makeFacts({ policy: makePolicy({ requiresFinancialClearance: true }), financialClearance: null })
    );
    expect(result.blockingReasons).toContain(B.FINANCIAL_CLEARANCE_REQUIRED);
  });

  it("12. blocks FINANCIAL_CLEARANCE_REQUIRED when NOT_CLEARED", () => {
    const result = evaluateCertificateEligibility(
      makeFacts({
        policy: makePolicy({ requiresFinancialClearance: true }),
        financialClearance: { status: "NOT_CLEARED", checkedAt: LOADED_AT, reference: null },
      })
    );
    expect(result.blockingReasons).toContain(B.FINANCIAL_CLEARANCE_REQUIRED);
  });

  it("13. blocks + warns when finance is required and UNKNOWN", () => {
    const result = evaluateCertificateEligibility(
      makeFacts({
        policy: makePolicy({ requiresFinancialClearance: true }),
        financialClearance: { status: "UNKNOWN", checkedAt: LOADED_AT, reference: null },
      })
    );
    expect(result.blockingReasons).toContain(B.FINANCIAL_CLEARANCE_REQUIRED);
    expect(result.warnings).toContain(W.FINANCIAL_CLEARANCE_UNKNOWN);
  });

  it("14. passes when finance is required and CLEARED", () => {
    const result = evaluateCertificateEligibility(
      makeFacts({
        policy: makePolicy({ requiresFinancialClearance: true }),
        financialClearance: { status: "CLEARED", checkedAt: LOADED_AT, reference: "clr-1" },
      })
    );
    expect(result.blockingReasons).not.toContain(B.FINANCIAL_CLEARANCE_REQUIRED);
    expect(result.eligible).toBe(true);
  });

  it("15. manual approval is a NON-blocking gate: eligible + warning, never a blocker", () => {
    const result = evaluateCertificateEligibility(
      makeFacts({ policy: makePolicy({ requiresManualApproval: true }) })
    );
    // Eligible-but-pending: the student qualifies; issue must route to PENDING_APPROVAL.
    expect(result.eligible).toBe(true);
    expect(result.blockingReasons).toEqual([]);
    expect(result.blockingReasons).not.toContain(B.MANUAL_APPROVAL_REQUIRED);
    expect(result.warnings).toContain(W.MANUAL_APPROVAL_REQUIRED_WARNING);
    expect(result.requiresApproval).toBe(true);
  });

  it("15b. does not require approval when the policy does not set it", () => {
    const result = evaluateCertificateEligibility(makeFacts());
    expect(result.requiresApproval).toBe(false);
    expect(result.warnings).not.toContain(W.MANUAL_APPROVAL_REQUIRED_WARNING);
  });

  it("16. blocks CERTIFICATE_ALREADY_ISSUED when administrative.alreadyIssued is true", () => {
    const result = evaluateCertificateEligibility(makeFacts({ administrative: { alreadyIssued: true } }));
    expect(result.blockingReasons).toContain(B.CERTIFICATE_ALREADY_ISSUED);
  });

  it("17. returns multiple independent hard blockers together", () => {
    const result = evaluateCertificateEligibility(
      makeFacts({
        policy: makePolicy({ requiresFinancialClearance: true }),
        financialClearance: null,
        transcript: makeTranscript({ courseProgressSnapshot: { status: "IN_PROGRESS" } }),
      })
    );
    expect(result.blockingReasons).toContain(B.COURSE_NOT_COMPLETED);
    expect(result.blockingReasons).toContain(B.FINANCIAL_CLEARANCE_REQUIRED);
    expect(result.blockingReasons.length).toBeGreaterThanOrEqual(2);
  });

  it("17b. hard blockers + manual approval: eligible=false, only hard blockers, warning still present", () => {
    const result = evaluateCertificateEligibility(
      makeFacts({
        policy: makePolicy({ requiresManualApproval: true, requiresFinancialClearance: true }),
        financialClearance: null,
      })
    );
    expect(result.eligible).toBe(false);
    // The manual-approval gate never enters the blocker list.
    expect(result.blockingReasons).not.toContain(B.MANUAL_APPROVAL_REQUIRED);
    expect(result.blockingReasons).toEqual([B.FINANCIAL_CLEARANCE_REQUIRED]);
    // The gate is still surfaced (warning + flag) even while other blockers fail.
    expect(result.warnings).toContain(W.MANUAL_APPROVAL_REQUIRED_WARNING);
    expect(result.requiresApproval).toBe(true);
  });

  it("18. warnings do not block when there is no blocker", () => {
    const result = evaluateCertificateEligibility(
      makeFacts({
        policy: makePolicy({ requiresFinancialClearance: false }),
        financialClearance: { status: "UNKNOWN", checkedAt: LOADED_AT, reference: null },
      })
    );
    expect(result.warnings).toContain(W.FINANCIAL_CLEARANCE_UNKNOWN);
    expect(result.blockingReasons).toEqual([]);
    expect(result.eligible).toBe(true);
  });

  it("19. eligible is exactly blockingReasons.length === 0", () => {
    const ok = evaluateCertificateEligibility(makeFacts());
    expect(ok.eligible).toBe(ok.blockingReasons.length === 0);
    const blocked = evaluateCertificateEligibility(makeFacts({ policy: null }));
    expect(blocked.eligible).toBe(blocked.blockingReasons.length === 0);
  });

  it("20. evaluatedPolicyId is the policy id, or null when no policy", () => {
    expect(evaluateCertificateEligibility(makeFacts()).evaluatedPolicyId).toBe("pol-1");
    expect(evaluateCertificateEligibility(makeFacts({ policy: null })).evaluatedPolicyId).toBeNull();
  });
});

describe("evaluateCertificateEligibility — timestamp, purity, determinism", () => {
  it("21. evaluatedAt uses metadata.loadedAt (or evaluationContext when supplied)", () => {
    expect(evaluateCertificateEligibility(makeFacts()).evaluatedAt).toEqual(LOADED_AT);
    const ctxAt = new Date("2026-08-01T00:00:00.000Z");
    const withCtx = evaluateCertificateEligibility(makeFacts({ evaluationContext: { evaluatedAt: ctxAt } }));
    expect(withCtx.evaluatedAt).toEqual(ctxAt);
  });

  it("22. returns the input facts unchanged (same reference)", () => {
    const facts = makeFacts();
    expect(evaluateCertificateEligibility(facts).facts).toBe(facts);
  });

  it("23. does not mutate the input facts", () => {
    const facts = makeFacts({ policy: makePolicy({ requiresManualApproval: true }) });
    const before = structuredClone(facts);
    evaluateCertificateEligibility(facts);
    expect(facts).toEqual(before);
  });

  it("24. is deterministic: same facts twice → equal result", () => {
    const facts = makeFacts({ policy: makePolicy({ requiresFinancialClearance: true }), financialClearance: null });
    expect(evaluateCertificateEligibility(facts)).toEqual(evaluateCertificateEligibility(facts));
  });
});

describe("CertificateEligibilityEngine — architecture guards (tests 25–32)", () => {
  const ENGINE_SRC = readFileSync(
    join(process.cwd(), "src", "modules", "certificates", "services", "certificate-eligibility.engine.ts"),
    "utf8"
  );

  it("25. imports no Prisma / db", () => {
    expect(ENGINE_SRC).not.toMatch(/@prisma\/client/);
    expect(ENGINE_SRC).not.toMatch(/@\/server\/db/);
    expect(ENGINE_SRC).not.toMatch(/PrismaClientOrTx/);
    expect(ENGINE_SRC).not.toMatch(/getDb/);
  });

  it("26. imports no repository", () => {
    expect(ENGINE_SRC).not.toMatch(/repositories\//);
  });

  it("27. does not import CertificateEligibilitySource", () => {
    expect(ENGINE_SRC).not.toMatch(/certificate-eligibility-source/);
  });

  it("28. does not import the Transcript ACL or transcript Prisma models", () => {
    expect(ENGINE_SRC).not.toMatch(/certificate-transcript-source/);
    expect(ENGINE_SRC).not.toMatch(/AcademicTranscript/);
  });

  it("29. imports no Grade / Attendance / CourseCompletion engine", () => {
    expect(ENGINE_SRC).not.toMatch(/GradeCalculation|grade-calculation|modules\/grades/);
    expect(ENGINE_SRC).not.toMatch(/AttendanceCalculation|attendance-calculation|modules\/attendance/);
    expect(ENGINE_SRC).not.toMatch(/CourseCompletion|course-completion/);
  });

  it("30. imports no EventPublisher / AuditService", () => {
    expect(ENGINE_SRC).not.toMatch(/eventPublisher|EventPublisher|publishDomainEvent/);
    expect(ENGINE_SRC).not.toMatch(/auditService|AuditService/);
  });

  it("31. reads no clock or randomness (determinism)", () => {
    expect(ENGINE_SRC).not.toMatch(/new Date\(/);
    expect(ENGINE_SRC).not.toMatch(/Date\.now\(/);
    expect(ENGINE_SRC).not.toMatch(/Math\.random\(/);
  });

  it("32. performs no DB / write calls", () => {
    expect(ENGINE_SRC).not.toMatch(/\.create\(/);
    expect(ENGINE_SRC).not.toMatch(/\.update\(/);
    expect(ENGINE_SRC).not.toMatch(/\.delete\(/);
    expect(ENGINE_SRC).not.toMatch(/\.upsert\(/);
    expect(ENGINE_SRC).not.toMatch(/\$queryRaw|\$executeRaw/);
  });
});
