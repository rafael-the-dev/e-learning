import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ExaminationEligibilityBlocker,
  ExaminationEligibilityWarning,
} from "../../constants";
import type { ExaminationEligibilityFacts } from "../../types/eligibility-source";
import { evaluateExaminationEligibility } from "../examination-eligibility.engine";

// =============================================================================
// ExaminationEligibilityEngine (Phase 3B) — pure-decision tests
// -----------------------------------------------------------------------------
// The engine is a pure, synchronous function of ExaminationEligibilityFacts. These
// tests drive it with hand-built facts (no DB, no source) and assert: correct
// blockers/warnings, non-blocking gates, `eligible === blockingReasons.length===0`,
// facts immutability + same-reference return, and static purity guards.
// =============================================================================

const LOADED_AT = new Date("2026-07-09T12:00:00.000Z");

/** A fully-eligible facts baseline: no blockers, no warnings, no approval. */
function makeFacts(overrides: Partial<ExaminationEligibilityFacts> = {}): ExaminationEligibilityFacts {
  return {
    student: { id: "stu-1", studentNumber: "S-001", fullName: "João Silva", status: "ACTIVE" },
    enrollment: { id: "enr-1", status: "ACTIVE", courseId: "c-1", courseLevelId: "cl-1", currentLevelId: "cl-1" },
    levelSubject: {
      id: "ls-1", subjectId: "sub-1", subjectName: "Código", minimumAttendancePercentage: 75,
      minimumPassingGrade: 10, isRequired: true, credits: 4, workloadHours: 60,
    },
    subjectProgress: {
      exists: true, status: "IN_PROGRESS", finalGrade: null, attendancePercentage: 80,
      completedAt: null, passedAt: null, source: "StudentSubjectProgress",
    },
    attendance: {
      percentage: 80, present: 800, total: 1000, requiredPercentage: 75, status: "SUFFICIENT",
      source: "StudentSubjectAttendanceSummary",
    },
    prerequisites: { items: [], allMet: null, source: "LevelSubjectPrerequisiteGroup" },
    financialClearance: { status: "NOT_REQUIRED", checkedAt: null, reference: null },
    disciplinary: { status: "CLEAR", reason: null },
    previousAttempts: { attempts: [], count: 0, lastAttemptStatus: null, maxAttemptNumber: null, source: "ExamAttempt" },
    examPeriod: null,
    examSession: null,
    manualApproval: { requiredByPolicy: null, overrides: [] },
    metadata: {
      sourceVersion: "examination-eligibility-source.v1",
      loadedAt: LOADED_AT,
      requestedExamPeriodId: null,
      requestedExamSessionId: null,
    },
    ...overrides,
  };
}

const B = ExaminationEligibilityBlocker;
const W = ExaminationEligibilityWarning;

describe("happy path", () => {
  it("1. fully eligible facts → eligible true, no blockers, no warnings", () => {
    const r = evaluateExaminationEligibility(makeFacts());
    expect(r.eligible).toBe(true);
    expect(r.blockingReasons).toEqual([]);
    expect(r.warnings).toEqual([]);
    expect(r.requiresApproval).toBe(false);
  });
});

describe("student / enrollment / levelSubject", () => {
  it("2. missing student → NO_STUDENT", () => {
    expect(evaluateExaminationEligibility(makeFacts({ student: null })).blockingReasons).toContain(B.NO_STUDENT);
  });
  it("3. missing enrollment → NO_ACTIVE_ENROLLMENT", () => {
    expect(evaluateExaminationEligibility(makeFacts({ enrollment: null })).blockingReasons).toContain(B.NO_ACTIVE_ENROLLMENT);
  });
  it("4. inactive enrollment → NO_ACTIVE_ENROLLMENT", () => {
    const facts = makeFacts({ enrollment: { id: "e", status: "SUSPENDED", courseId: "c", courseLevelId: null, currentLevelId: null } });
    expect(evaluateExaminationEligibility(facts).blockingReasons).toContain(B.NO_ACTIVE_ENROLLMENT);
  });
  it("5. missing levelSubject → LEVEL_SUBJECT_NOT_FOUND", () => {
    expect(evaluateExaminationEligibility(makeFacts({ levelSubject: null })).blockingReasons).toContain(B.LEVEL_SUBJECT_NOT_FOUND);
  });
});

describe("subject already passed", () => {
  it("6. PASSED → SUBJECT_ALREADY_PASSED", () => {
    const facts = makeFacts({ subjectProgress: { ...makeFacts().subjectProgress, status: "PASSED" } });
    expect(evaluateExaminationEligibility(facts).blockingReasons).toContain(B.SUBJECT_ALREADY_PASSED);
  });
  it("7. COMPLETED → SUBJECT_ALREADY_PASSED", () => {
    const facts = makeFacts({ subjectProgress: { ...makeFacts().subjectProgress, status: "COMPLETED" } });
    expect(evaluateExaminationEligibility(facts).blockingReasons).toContain(B.SUBJECT_ALREADY_PASSED);
  });
  it("IN_PROGRESS/FAILED do not trigger SUBJECT_ALREADY_PASSED", () => {
    for (const status of ["IN_PROGRESS", "FAILED", "NOT_STARTED", "RECOVERY_REQUIRED"]) {
      const facts = makeFacts({ subjectProgress: { ...makeFacts().subjectProgress, status } });
      expect(evaluateExaminationEligibility(facts).blockingReasons).not.toContain(B.SUBJECT_ALREADY_PASSED);
    }
  });
});

describe("attendance", () => {
  it("8. attendance unknown (null) → ATTENDANCE_UNKNOWN warning only", () => {
    const r = evaluateExaminationEligibility(makeFacts({ attendance: null }));
    expect(r.warnings).toContain(W.ATTENDANCE_UNKNOWN);
    expect(r.blockingReasons).not.toContain(B.ATTENDANCE_BELOW_REQUIRED);
  });
  it("9. attendance below required → ATTENDANCE_BELOW_REQUIRED", () => {
    const facts = makeFacts({ attendance: { percentage: 60, present: 600, total: 1000, requiredPercentage: 75, status: "BELOW_REQUIRED", source: "StudentSubjectAttendanceSummary" } });
    expect(evaluateExaminationEligibility(facts).blockingReasons).toContain(B.ATTENDANCE_BELOW_REQUIRED);
  });
  it("10. attendance exactly required → no blocker", () => {
    const facts = makeFacts({ attendance: { percentage: 75, present: 750, total: 1000, requiredPercentage: 75, status: "SUFFICIENT", source: "StudentSubjectAttendanceSummary" } });
    expect(evaluateExaminationEligibility(facts).blockingReasons).not.toContain(B.ATTENDANCE_BELOW_REQUIRED);
  });
  it("requiredPercentage null → no blocker", () => {
    const facts = makeFacts({ attendance: { percentage: 10, present: 100, total: 1000, requiredPercentage: null, status: "NOT_STARTED", source: "StudentSubjectAttendanceSummary" } });
    expect(evaluateExaminationEligibility(facts).blockingReasons).not.toContain(B.ATTENDANCE_BELOW_REQUIRED);
  });
});

describe("prerequisites", () => {
  it("11. prerequisites present but unevaluated (allMet null) → warning only", () => {
    const facts = makeFacts({ prerequisites: { items: [{ id: "i", groupId: "g", groupLogicType: "ALL", prerequisiteLevelSubjectId: "ls0", requirementType: "MUST_PASS", minimumRequiredGrade: null }], allMet: null, source: "LevelSubjectPrerequisiteGroup" } });
    const r = evaluateExaminationEligibility(facts);
    expect(r.warnings).toContain(W.PREREQUISITE_STATUS_UNKNOWN);
    expect(r.blockingReasons).not.toContain(B.PREREQUISITE_NOT_MET);
  });
  it("no prerequisite items + allMet null → no warning", () => {
    expect(evaluateExaminationEligibility(makeFacts()).warnings).not.toContain(W.PREREQUISITE_STATUS_UNKNOWN);
  });
  it("12. prerequisites not met (allMet false) → PREREQUISITE_NOT_MET", () => {
    const facts = makeFacts({ prerequisites: { items: [], allMet: false, source: "LevelSubjectPrerequisiteGroup" } });
    expect(evaluateExaminationEligibility(facts).blockingReasons).toContain(B.PREREQUISITE_NOT_MET);
  });
  it("allMet true → no blocker, no warning", () => {
    const facts = makeFacts({ prerequisites: { items: [], allMet: true, source: "LevelSubjectPrerequisiteGroup" } });
    const r = evaluateExaminationEligibility(facts);
    expect(r.blockingReasons).not.toContain(B.PREREQUISITE_NOT_MET);
    expect(r.warnings).not.toContain(W.PREREQUISITE_STATUS_UNKNOWN);
  });
});

describe("financial clearance", () => {
  it("13. UNKNOWN → warning only", () => {
    const r = evaluateExaminationEligibility(makeFacts({ financialClearance: { status: "UNKNOWN", checkedAt: null, reference: null } }));
    expect(r.warnings).toContain(W.FINANCIAL_CLEARANCE_UNKNOWN);
    expect(r.blockingReasons).not.toContain(B.FINANCIAL_CLEARANCE_REQUIRED);
  });
  it("14. NOT_CLEARED → FINANCIAL_CLEARANCE_REQUIRED", () => {
    expect(evaluateExaminationEligibility(makeFacts({ financialClearance: { status: "NOT_CLEARED", checkedAt: null, reference: null } })).blockingReasons).toContain(B.FINANCIAL_CLEARANCE_REQUIRED);
  });
  it("CLEARED / NOT_REQUIRED → no blocker, no warning", () => {
    for (const status of ["CLEARED", "NOT_REQUIRED"] as const) {
      const r = evaluateExaminationEligibility(makeFacts({ financialClearance: { status, checkedAt: null, reference: null } }));
      expect(r.blockingReasons).not.toContain(B.FINANCIAL_CLEARANCE_REQUIRED);
      expect(r.warnings).not.toContain(W.FINANCIAL_CLEARANCE_UNKNOWN);
    }
  });
});

describe("disciplinary", () => {
  it("15. UNKNOWN → warning only", () => {
    const r = evaluateExaminationEligibility(makeFacts({ disciplinary: { status: "UNKNOWN", reason: null } }));
    expect(r.warnings).toContain(W.DISCIPLINARY_STATUS_UNKNOWN);
    expect(r.blockingReasons).not.toContain(B.DISCIPLINARY_BLOCK);
  });
  it("16. BLOCKED → DISCIPLINARY_BLOCK", () => {
    expect(evaluateExaminationEligibility(makeFacts({ disciplinary: { status: "BLOCKED", reason: "x" } })).blockingReasons).toContain(B.DISCIPLINARY_BLOCK);
  });
  it("CLEAR → no blocker, no warning", () => {
    const r = evaluateExaminationEligibility(makeFacts({ disciplinary: { status: "CLEAR", reason: null } }));
    expect(r.blockingReasons).not.toContain(B.DISCIPLINARY_BLOCK);
    expect(r.warnings).not.toContain(W.DISCIPLINARY_STATUS_UNKNOWN);
  });
});

describe("previous attempts", () => {
  it("17. attempts present → warning only (never blocks)", () => {
    const facts = makeFacts({ previousAttempts: { attempts: [{ id: "a", attemptNumber: 1, status: "RESULTED" }], count: 1, lastAttemptStatus: "RESULTED", maxAttemptNumber: 1, source: "ExamAttempt" } });
    const r = evaluateExaminationEligibility(facts);
    expect(r.warnings).toContain(W.PREVIOUS_ATTEMPTS_FOUND);
    expect(r.eligible).toBe(true);
  });
});

describe("exam period", () => {
  it("18. period requested but missing → EXAM_PERIOD_MISSING warning only", () => {
    const r = evaluateExaminationEligibility(makeFacts({ metadata: { ...makeFacts().metadata, requestedExamPeriodId: "p-1" }, examPeriod: null }));
    expect(r.warnings).toContain(W.EXAM_PERIOD_MISSING);
    expect(r.blockingReasons).not.toContain(B.EXAM_PERIOD_CLOSED);
  });
  it("19. period not OPEN (LOCKED/COMPLETED/CANCELLED) → EXAM_PERIOD_CLOSED", () => {
    for (const status of ["LOCKED", "COMPLETED", "CANCELLED", "DRAFT"]) {
      const facts = makeFacts({ metadata: { ...makeFacts().metadata, requestedExamPeriodId: "p-1" }, examPeriod: { id: "p-1", status, startsAt: LOADED_AT, endsAt: LOADED_AT } });
      expect(evaluateExaminationEligibility(facts).blockingReasons).toContain(B.EXAM_PERIOD_CLOSED);
    }
  });
  it("period OPEN → no blocker", () => {
    const facts = makeFacts({ metadata: { ...makeFacts().metadata, requestedExamPeriodId: "p-1" }, examPeriod: { id: "p-1", status: "OPEN", startsAt: LOADED_AT, endsAt: LOADED_AT } });
    expect(evaluateExaminationEligibility(facts).blockingReasons).not.toContain(B.EXAM_PERIOD_CLOSED);
  });
  it("period not requested → no warning, no blocker even if null", () => {
    const r = evaluateExaminationEligibility(makeFacts());
    expect(r.warnings).not.toContain(W.EXAM_PERIOD_MISSING);
    expect(r.blockingReasons).not.toContain(B.EXAM_PERIOD_CLOSED);
  });
});

describe("exam session", () => {
  it("20. session requested but missing → EXAM_SESSION_MISSING warning only", () => {
    const r = evaluateExaminationEligibility(makeFacts({ metadata: { ...makeFacts().metadata, requestedExamSessionId: "s-1" }, examSession: null }));
    expect(r.warnings).toContain(W.EXAM_SESSION_MISSING);
    expect(r.blockingReasons).not.toContain(B.EXAM_SESSION_NOT_AVAILABLE);
  });
  it("21. session not SCHEDULED/LOCKED → EXAM_SESSION_NOT_AVAILABLE", () => {
    for (const status of ["DRAFT", "IN_PROGRESS", "COMPLETED", "RESULTS_RECORDED", "PUBLISHED", "CANCELLED"]) {
      const facts = makeFacts({ metadata: { ...makeFacts().metadata, requestedExamSessionId: "s-1" }, examSession: { id: "s-1", status, periodId: "p-1", startsAt: LOADED_AT, endsAt: LOADED_AT, capacity: 30 } });
      expect(evaluateExaminationEligibility(facts).blockingReasons).toContain(B.EXAM_SESSION_NOT_AVAILABLE);
    }
  });
  it("session SCHEDULED or LOCKED → available", () => {
    for (const status of ["SCHEDULED", "LOCKED"]) {
      const facts = makeFacts({ metadata: { ...makeFacts().metadata, requestedExamSessionId: "s-1" }, examSession: { id: "s-1", status, periodId: "p-1", startsAt: LOADED_AT, endsAt: LOADED_AT, capacity: 30 } });
      expect(evaluateExaminationEligibility(facts).blockingReasons).not.toContain(B.EXAM_SESSION_NOT_AVAILABLE);
    }
  });
});

describe("manual approval (non-blocking gate)", () => {
  it("22. required → requiresApproval true + warning; eligible stays true with no blockers", () => {
    const r = evaluateExaminationEligibility(makeFacts({ manualApproval: { requiredByPolicy: true, overrides: [] } }));
    expect(r.requiresApproval).toBe(true);
    expect(r.warnings).toContain(W.MANUAL_APPROVAL_REQUIRED);
    expect(r.eligible).toBe(true);
  });
  it("23. required + a blocker → eligible false but requiresApproval true", () => {
    const r = evaluateExaminationEligibility(makeFacts({ manualApproval: { requiredByPolicy: true, overrides: [] }, student: null }));
    expect(r.requiresApproval).toBe(true);
    expect(r.eligible).toBe(false);
  });
});

describe("accumulation + invariants", () => {
  it("24. multiple blockers accumulate", () => {
    const r = evaluateExaminationEligibility(makeFacts({
      student: null,
      enrollment: null,
      levelSubject: null,
      financialClearance: { status: "NOT_CLEARED", checkedAt: null, reference: null },
      disciplinary: { status: "BLOCKED", reason: "x" },
    }));
    expect(r.blockingReasons).toEqual(expect.arrayContaining([B.NO_STUDENT, B.NO_ACTIVE_ENROLLMENT, B.LEVEL_SUBJECT_NOT_FOUND, B.FINANCIAL_CLEARANCE_REQUIRED, B.DISCIPLINARY_BLOCK]));
    expect(r.eligible).toBe(false);
  });
  it("25. warnings never affect eligible", () => {
    const r = evaluateExaminationEligibility(makeFacts({
      attendance: null,
      financialClearance: { status: "UNKNOWN", checkedAt: null, reference: null },
      disciplinary: { status: "UNKNOWN", reason: null },
      previousAttempts: { attempts: [{ id: "a", attemptNumber: 1, status: "ABANDONED" }], count: 1, lastAttemptStatus: "ABANDONED", maxAttemptNumber: 1, source: "ExamAttempt" },
    }));
    expect(r.warnings.length).toBeGreaterThan(0);
    expect(r.eligible).toBe(true);
    expect(r.blockingReasons).toEqual([]);
  });
  it("26. eligible === (blockingReasons.length === 0), across many random-ish combos", () => {
    const variants: Partial<ExaminationEligibilityFacts>[] = [
      {},
      { student: null },
      { disciplinary: { status: "BLOCKED", reason: "x" } },
      { financialClearance: { status: "UNKNOWN", checkedAt: null, reference: null } },
      { manualApproval: { requiredByPolicy: true, overrides: [] } },
    ];
    for (const v of variants) {
      const r = evaluateExaminationEligibility(makeFacts(v));
      expect(r.eligible).toBe(r.blockingReasons.length === 0);
    }
  });
});

describe("determinism + immutability", () => {
  it("27. evaluatedAt equals facts.metadata.loadedAt", () => {
    expect(evaluateExaminationEligibility(makeFacts()).evaluatedAt).toBe(LOADED_AT);
  });
  it("28. engineVersion is stable", () => {
    expect(evaluateExaminationEligibility(makeFacts()).metadata.engineVersion).toBe("examination-eligibility-engine.v1");
  });
  it("29. returns the SAME facts reference as evaluatedFacts", () => {
    const facts = makeFacts();
    expect(evaluateExaminationEligibility(facts).evaluatedFacts).toBe(facts);
  });
  it("30. input facts are not mutated", () => {
    const facts = makeFacts({ manualApproval: { requiredByPolicy: true, overrides: [] }, attendance: null });
    const before = JSON.stringify(facts);
    evaluateExaminationEligibility(facts);
    expect(JSON.stringify(facts)).toBe(before);
  });
  it("determinism: same facts → identical result twice", () => {
    const facts = makeFacts({ disciplinary: { status: "BLOCKED", reason: "x" } });
    expect(evaluateExaminationEligibility(facts)).toEqual(evaluateExaminationEligibility(facts));
  });
});

describe("forbidden operational blockers are NOT engine blockers", () => {
  const forbidden = ["SESSION_FULL", "ALREADY_REGISTERED", "ROOM_CONFLICT", "INVIGILATOR_CONFLICT", "STUDENT_TIMETABLE_CONFLICT", "SEAT_UNAVAILABLE", "DUPLICATE_CANDIDATE"];
  it("31/32. SESSION_FULL & ALREADY_REGISTERED (and other command-level blockers) are absent from the blocker vocabulary", () => {
    const values = new Set(Object.values(ExaminationEligibilityBlocker));
    for (const f of forbidden) expect(values.has(f as never)).toBe(false);
  });
  it("33/34. session capacity never blocks (command-level, E-3a)", () => {
    const facts = makeFacts({
      metadata: { ...makeFacts().metadata, requestedExamSessionId: "s-1" },
      examSession: { id: "s-1", status: "SCHEDULED", periodId: "p-1", startsAt: LOADED_AT, endsAt: LOADED_AT, capacity: 0 },
    });
    const r = evaluateExaminationEligibility(facts);
    expect(r.eligible).toBe(true);
    expect(r.blockingReasons).toEqual([]);
  });
});

describe("static purity guards (source scan)", () => {
  const RAW = readFileSync(
    join(process.cwd(), "src", "modules", "examinations", "services", "examination-eligibility.engine.ts"),
    "utf8"
  );
  const SRC = RAW.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

  it("35. no clock / randomness / env", () => {
    expect(SRC).not.toMatch(/new Date\(|Date\.now|Math\.random|process\.env/);
  });
  it("36. no DB / repository / getDb / prisma / service imports", () => {
    expect(SRC).not.toMatch(/getDb|PrismaClient|@\/server\/db|\/repositories\/|repository|-source\.service/);
  });
  it("37. no async / await / Promise", () => {
    expect(SRC).not.toMatch(/\basync\b|\bawait\b|Promise</);
  });
  it("38. no writes (create/update/delete/upsert)", () => {
    expect(SRC).not.toMatch(/\.create\(|\.update\(|\.updateMany\(|\.delete\(|\.deleteMany\(|\.upsert\(/);
  });
  it("39. no Transcript/Certificate/Grade/Attendance/Progression engine imports", () => {
    expect(SRC).not.toMatch(/modules\/(transcripts|certificates|grades|attendance)|progression\/commands|AcademicTranscript/);
  });
  it("40. no command imports", () => {
    expect(SRC).not.toMatch(/examinations\/commands|\/commands"/);
  });
  it("41. no event/audit imports", () => {
    expect(SRC).not.toMatch(/eventPublisher|auditService/);
  });
});
