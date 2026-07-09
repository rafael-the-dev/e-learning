import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { makeFakeDb, seed, asClient, type FakeDb } from "../../repositories/__tests__/_fake-db";
import { loadExaminationEligibilityFacts } from "../examination-eligibility-source.service";

// =============================================================================
// ExaminationEligibilitySource (Phase 3A) — behavioural + guard tests
// -----------------------------------------------------------------------------
// Drives the read-aggregation façade against the generic in-memory fake DB (passed
// as the optional client). Proves it LOADS FACTS and DECIDES NOTHING: no eligible /
// blockingReasons / warnings / requiresApproval / can* anywhere; missing
// integrations surface as null / UNKNOWN; period/session/candidate load only when
// their id is supplied; cross-tenant rows return null facts (no throw).
// =============================================================================

const ORG = "org-A";
const OTHER = "org-B";
const BASE = { organizationId: ORG, studentId: "stu-1", enrollmentId: "enr-1", levelSubjectId: "ls-1" };

let db: FakeDb;

function seedCore(): void {
  seed(db, "student", { id: "stu-1", organizationId: ORG, code: "S-001", firstName: "João", lastName: "Silva", status: "ACTIVE", deletedAt: null });
  seed(db, "enrollment", { id: "enr-1", organizationId: ORG, status: "ACTIVE", courseId: "c-1", courseLevelId: "cl-1", currentLevelId: "cl-1", deletedAt: null });
  seed(db, "levelSubject", { id: "ls-1", organizationId: ORG, subjectId: "sub-1", minimumAttendancePercentage: 75, minimumPassingGrade: 10, isRequired: true, credits: 4, workloadHours: 60, deletedAt: null });
  seed(db, "subject", { id: "sub-1", organizationId: ORG, name: "Código da Estrada", deletedAt: null });
}

beforeEach(() => {
  db = makeFakeDb();
});

describe("core facts", () => {
  it("1. loads student / enrollment / levelSubject facts verbatim", async () => {
    seedCore();
    const f = await loadExaminationEligibilityFacts(BASE, asClient(db));
    expect(f.student).toMatchObject({ id: "stu-1", studentNumber: "S-001", fullName: "João Silva", status: "ACTIVE" });
    expect(f.enrollment).toMatchObject({ id: "enr-1", status: "ACTIVE", courseId: "c-1", courseLevelId: "cl-1" });
    expect(f.levelSubject).toMatchObject({ id: "ls-1", subjectId: "sub-1", subjectName: "Código da Estrada", minimumAttendancePercentage: 75, isRequired: true });
  });

  it("3. loads subject progress verbatim (no recalculation)", async () => {
    seedCore();
    seed(db, "studentSubjectProgress", { organizationId: ORG, enrollmentId: "enr-1", levelSubjectId: "ls-1", status: "IN_PROGRESS", finalGrade: null, attendancePercentage: 80, completedAt: null });
    const f = await loadExaminationEligibilityFacts(BASE, asClient(db));
    expect(f.subjectProgress).toMatchObject({ exists: true, status: "IN_PROGRESS", attendancePercentage: 80, source: "StudentSubjectProgress" });
    expect(f.subjectProgress.passedAt).toBeNull();
  });

  it("2/4. missing optional sources → null / exists:false / UNKNOWN", async () => {
    seedCore(); // no progress, no attendance summary, no prerequisites, no exam ids
    const f = await loadExaminationEligibilityFacts(BASE, asClient(db));
    expect(f.subjectProgress.exists).toBe(false);
    expect(f.attendance).toBeNull();
    expect(f.prerequisites.items).toEqual([]);
    expect(f.financialClearance.status).toBe("UNKNOWN");
    expect(f.disciplinary.status).toBe("UNKNOWN");
    expect(f.manualApproval.requiredByPolicy).toBeNull();
    expect(f.examPeriod).toBeNull();
    expect(f.examSession).toBeNull();
    expect(f.existingCandidate).toBeNull();
  });

  it("4. loads attendance summary facts verbatim + copies requiredPercentage from levelSubject", async () => {
    seedCore();
    seed(db, "studentSubjectAttendanceSummary", { organizationId: ORG, enrollmentId: "enr-1", levelSubjectId: "ls-1", attendancePercentage: 62, totalPresentMinutes: 620, totalScheduledMinutes: 1000, status: "AT_RISK" });
    const f = await loadExaminationEligibilityFacts(BASE, asClient(db));
    expect(f.attendance).toMatchObject({ percentage: 62, present: 620, total: 1000, requiredPercentage: 75, status: "AT_RISK", source: "StudentSubjectAttendanceSummary" });
  });

  it("prerequisites are copied (items with group logic + requirement), not evaluated", async () => {
    seedCore();
    seed(db, "levelSubjectPrerequisiteGroup", { id: "g-1", organizationId: ORG, levelSubjectId: "ls-1", logicType: "ALL", status: "ACTIVE", deletedAt: null });
    seed(db, "levelSubjectPrerequisiteItem", { id: "i-1", organizationId: ORG, prerequisiteGroupId: "g-1", prerequisiteLevelSubjectId: "ls-0", requirementType: "MUST_PASS", minimumRequiredGrade: null, status: "ACTIVE", deletedAt: null });
    const f = await loadExaminationEligibilityFacts(BASE, asClient(db));
    expect(f.prerequisites.items).toHaveLength(1);
    expect(f.prerequisites.items[0]).toMatchObject({ id: "i-1", groupId: "g-1", groupLogicType: "ALL", prerequisiteLevelSubjectId: "ls-0", requirementType: "MUST_PASS" });
  });
});

describe("previous attempts (count / max / last)", () => {
  it("5. aggregates attempts by copy — count, maxAttemptNumber, lastAttemptStatus", async () => {
    seedCore();
    seed(db, "examAttempt", { id: "a-1", organizationId: ORG, studentId: "stu-1", enrollmentId: "enr-1", levelSubjectId: "ls-1", attemptNumber: 1, status: "ABANDONED", source: null, deletedAt: null });
    seed(db, "examAttempt", { id: "a-2", organizationId: ORG, studentId: "stu-1", enrollmentId: "enr-1", levelSubjectId: "ls-1", attemptNumber: 2, status: "RESULTED", source: null, deletedAt: null });
    const f = await loadExaminationEligibilityFacts(BASE, asClient(db));
    expect(f.previousAttempts.count).toBe(2);
    expect(f.previousAttempts.maxAttemptNumber).toBe(2);
    expect(f.previousAttempts.lastAttemptStatus).toBe("RESULTED");
    expect(f.previousAttempts.source).toBe("ExamAttempt");
  });
});

describe("optional exam facts load only when ids provided", () => {
  it("6/7/8. loads period, session, and existing candidate when ids given", async () => {
    seedCore();
    seed(db, "examPeriod", { id: "p-1", organizationId: ORG, status: "OPEN", startsAt: new Date("2026-07-01"), endsAt: new Date("2026-07-31"), deletedAt: null });
    seed(db, "examSession", { id: "sess-1", organizationId: ORG, periodId: "p-1", status: "SCHEDULED", startsAt: new Date("2026-07-10"), endsAt: new Date("2026-07-10"), capacity: 30, deletedAt: null });
    seed(db, "examCandidate", { id: "cand-1", organizationId: ORG, examSessionId: "sess-1", studentId: "stu-1", status: "REGISTERED", deletedAt: null });
    const f = await loadExaminationEligibilityFacts({ ...BASE, examPeriodId: "p-1", examSessionId: "sess-1" }, asClient(db));
    expect(f.examPeriod).toMatchObject({ id: "p-1", status: "OPEN" });
    expect(f.examSession).toMatchObject({ id: "sess-1", periodId: "p-1", capacity: 30 });
    expect(f.existingCandidate).toMatchObject({ candidateId: "cand-1", status: "REGISTERED", examSessionId: "sess-1" });
  });
});

describe("no decisions (facts only)", () => {
  it("9/10/11/12/15/16/17/18. output has NO decision fields", async () => {
    seedCore();
    seed(db, "examSession", { id: "sess-1", organizationId: ORG, periodId: "p-1", status: "SCHEDULED", startsAt: new Date(), endsAt: new Date(), capacity: 1, deletedAt: null });
    seed(db, "examCandidate", { id: "cand-1", organizationId: ORG, examSessionId: "sess-1", studentId: "stu-1", status: "REGISTERED", deletedAt: null });
    const f = await loadExaminationEligibilityFacts({ ...BASE, examSessionId: "sess-1" }, asClient(db));
    const keys = new Set(Object.keys(f));
    for (const forbidden of ["eligible", "blockingReasons", "warnings", "requiresApproval", "decision", "canRegister", "canSchedule", "canOverride"]) {
      expect(keys.has(forbidden)).toBe(false);
    }
    const json = JSON.stringify(f);
    expect(json).not.toMatch(/SESSION_FULL|ALREADY_REGISTERED|ATTENDANCE_BELOW_REQUIRED|SUBJECT_ALREADY_PASSED/);
    // existingCandidate is a FACT — present, but no ALREADY_REGISTERED decision.
    expect(f.existingCandidate).not.toBeNull();
  });
});

describe("tenant isolation + determinism", () => {
  it("14. cross-tenant student/enrollment/levelSubject → null facts (no throw)", async () => {
    seed(db, "student", { id: "stu-1", organizationId: OTHER, code: "X", firstName: "A", lastName: "B", status: "ACTIVE", deletedAt: null });
    seed(db, "enrollment", { id: "enr-1", organizationId: OTHER, status: "ACTIVE", courseId: "c", deletedAt: null });
    seed(db, "levelSubject", { id: "ls-1", organizationId: OTHER, subjectId: "s", isRequired: true, deletedAt: null });
    const f = await loadExaminationEligibilityFacts(BASE, asClient(db));
    expect(f.student).toBeNull();
    expect(f.enrollment).toBeNull();
    expect(f.levelSubject).toBeNull();
  });

  it("soft-deleted student is treated as absent (null)", async () => {
    seed(db, "student", { id: "stu-1", organizationId: ORG, code: "S", firstName: "A", lastName: "B", status: "ACTIVE", deletedAt: new Date() });
    const f = await loadExaminationEligibilityFacts(BASE, asClient(db));
    expect(f.student).toBeNull();
  });

  it("19/20. loadedAt uses input.now when supplied; sourceVersion is stable", async () => {
    seedCore();
    const now = new Date("2026-07-09T12:00:00.000Z");
    const f = await loadExaminationEligibilityFacts({ ...BASE, now }, asClient(db));
    expect(f.metadata.loadedAt).toEqual(now);
    expect(f.metadata.sourceVersion).toBe("examination-eligibility-source.v1");
  });

  it("13. accepts an optional transaction client (the fake) — reads through it", async () => {
    seedCore();
    const f = await loadExaminationEligibilityFacts(BASE, asClient(db));
    expect(f.student).not.toBeNull();
  });
});

describe("architecture guards (static source scan)", () => {
  const RAW = readFileSync(
    join(process.cwd(), "src", "modules", "examinations", "services", "examination-eligibility-source.service.ts"),
    "utf8"
  );
  // Strip comments before scanning: the header/inline comments legitimately NAME the
  // forbidden concepts (e.g. "never reads the Transcript or Certificate engines",
  // "no `requiresApproval`") to document the boundary. The guards must scan CODE, not
  // prose.
  const SRC = RAW.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

  it("21-26. no Transcript / Certificate / Grade / Attendance-engine / Progression-command / EligibilityEngine imports (in code)", () => {
    expect(SRC).not.toMatch(/modules\/(transcripts|certificates|grades|attendance)/);
    expect(SRC).not.toMatch(/AcademicTranscript|Certificate/);
    expect(SRC).not.toMatch(/progression\/commands|GradeCalculation|AttendanceCalculation/);
    expect(SRC).not.toMatch(/EligibilityEngine|evaluateExaminationEligibility/);
  });

  it("27/28. no commands, routes, or React/UI imports", () => {
    expect(SRC).not.toMatch(/examinations\/commands|\/commands"/);
    expect(SRC).not.toMatch(/from ["']react["']|from ["']next\/|"use client"/);
  });

  it("29. no writes (create/update/delete/upsert) or event/audit", () => {
    expect(SRC).not.toMatch(/\.create\(|\.createMany\(|\.update\(|\.updateMany\(|\.delete\(|\.deleteMany\(|\.upsert\(/);
    expect(SRC).not.toMatch(/eventPublisher|auditService/);
  });

  it("30. no blocker/decision vocabulary in the code", () => {
    expect(SRC).not.toMatch(/blockingReasons|requiresApproval|\beligible\b|canRegister|canSchedule|SESSION_FULL|ALREADY_REGISTERED/);
  });
});
