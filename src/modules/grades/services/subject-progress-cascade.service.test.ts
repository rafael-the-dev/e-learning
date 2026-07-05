import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  levelSubjectFindFirst: vi.fn(),
  subjectProgressFindFirst: vi.fn(),
  findResultsByEnrollmentAndLevelSubject: vi.fn(),
  upsertStudentSubjectProgress: vi.fn(),
  findActivePolicyForLevelSubject: vi.fn(),
  findActiveComponentsByPolicy: vi.fn(),
  recalculateStudentLevelProgress: vi.fn(),
  auditLog: vi.fn(),
  publish: vi.fn(),
  loadEffectiveAttendancePolicy: vi.fn(),
  findSummaryByEnrollmentAndSubject: vi.fn(),
}));

vi.mock("@/server/db", () => ({
  getDb: vi.fn(async () => ({
    levelSubject: { findFirst: mocks.levelSubjectFindFirst },
    studentSubjectProgress: { findFirst: mocks.subjectProgressFindFirst },
  })),
}));
vi.mock("@/modules/grades/repositories/student-assessment-result.repository", () => ({
  findResultsByEnrollmentAndLevelSubject: mocks.findResultsByEnrollmentAndLevelSubject,
}));
vi.mock("@/modules/assessments/repositories/student-subject-progress.repository", () => ({
  upsertStudentSubjectProgress: mocks.upsertStudentSubjectProgress,
}));
vi.mock("@/modules/assessments/repositories/assessment-policy.repository", () => ({
  findActivePolicyForLevelSubject: mocks.findActivePolicyForLevelSubject,
}));
vi.mock("@/modules/assessments/repositories/assessment-component.repository", () => ({
  findActiveComponentsByPolicy: mocks.findActiveComponentsByPolicy,
}));
vi.mock("@/modules/prerequisites/services/recalculate-level-progress.service", () => ({
  recalculateStudentLevelProgress: mocks.recalculateStudentLevelProgress,
}));
vi.mock("@/modules/audit-logs/services/audit.service", () => ({
  auditService: { log: mocks.auditLog },
}));
vi.mock("@/server/events/event-publisher", () => ({
  eventPublisher: { publish: mocks.publish },
}));
vi.mock("@/modules/attendance/services/attendance-policy.resolver", () => ({
  loadEffectiveAttendancePolicy: mocks.loadEffectiveAttendancePolicy,
}));
vi.mock("@/modules/attendance/repositories/student-subject-attendance-summary.repository", () => ({
  findSummaryByEnrollmentAndSubject: mocks.findSummaryByEnrollmentAndSubject,
}));

import { recalculateSubjectProgressCascade } from "@/modules/grades/services/subject-progress-cascade.service";
import type { AuthContext } from "@/server/auth/context";

const context = { organizationId: "org-1", userId: "u1" } as AuthContext;
const params = { studentId: "s1", enrollmentId: "e1", levelSubjectId: "ls1" };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.levelSubjectFindFirst.mockResolvedValue({
    minimumPassingGrade: 50,
    minimumAttendancePercentage: null,
    courseLevelId: "cl1",
    attendancePolicyId: null,
  });
  // Phase 5 gate OFF by default → attendance never affects academics (existing
  // tests stay behaviour-neutral).
  mocks.loadEffectiveAttendancePolicy.mockResolvedValue({
    enforceAttendanceForProgress: false,
    policyId: null,
    source: "FALLBACK",
  });
  mocks.findSummaryByEnrollmentAndSubject.mockResolvedValue(null);
  mocks.findActivePolicyForLevelSubject.mockResolvedValue({
    id: "p1",
    calculationMethod: "SIMPLE_AVERAGE",
    roundingMethod: "NONE",
    minimumPassingGrade: 50,
    allowRecovery: false,
  });
  mocks.findActiveComponentsByPolicy.mockResolvedValue([
    { id: "c1", weight: 1, maxGrade: 100, isRequired: true },
  ]);
  mocks.upsertStudentSubjectProgress.mockImplementation(async (data: Record<string, unknown>) => ({
    id: "prog-1",
    ...data,
  }));
  mocks.recalculateStudentLevelProgress.mockResolvedValue(undefined);
  mocks.subjectProgressFindFirst.mockResolvedValue(null); // new row by default
});

describe("recalculateSubjectProgressCascade", () => {
  it("derives progress from the canonical StudentAssessmentResult (single source of truth)", async () => {
    mocks.findResultsByEnrollmentAndLevelSubject.mockResolvedValue([
      { assessmentComponentId: "c1", grade: 80, normalizedGrade: 80 },
    ]);

    const progress = await recalculateSubjectProgressCascade(context, params);

    // Reads the canonical grade store, keyed by enrollment + level subject.
    // A 4th arg (the db/tx client) is now threaded through for transactionality.
    expect(mocks.findResultsByEnrollmentAndLevelSubject).toHaveBeenCalledWith(
      "e1", "ls1", "org-1", expect.anything()
    );
    expect(progress.status).toBe("PASSED");
    expect(progress.finalGrade).toBe(80);
  });

  it("cascades to level progress (subject -> level -> course)", async () => {
    mocks.findResultsByEnrollmentAndLevelSubject.mockResolvedValue([
      { assessmentComponentId: "c1", grade: 80, normalizedGrade: 80 },
    ]);

    await recalculateSubjectProgressCascade(context, params);

    expect(mocks.recalculateStudentLevelProgress).toHaveBeenCalledWith("e1", "cl1", "org-1", undefined);
  });

  it("publishes STUDENT_SUBJECT_PASSED when the subject is passed", async () => {
    mocks.findResultsByEnrollmentAndLevelSubject.mockResolvedValue([
      { assessmentComponentId: "c1", grade: 90, normalizedGrade: 90 },
    ]);

    await recalculateSubjectProgressCascade(context, params);

    expect(mocks.publish).toHaveBeenCalledWith(
      expect.objectContaining({ payload: expect.objectContaining({ levelSubjectId: "ls1" }) })
    );
  });

  it("progression changes when a required grade is removed (invalidation/cancel path)", async () => {
    // With no canonical result (the grade was cancelled/invalidated and thus
    // excluded from the read), a required component is missing -> BLOCKED, not PASSED.
    mocks.findResultsByEnrollmentAndLevelSubject.mockResolvedValue([]);

    const progress = await recalculateSubjectProgressCascade(context, params);

    expect(progress.status).toBe("BLOCKED");
    expect(progress.finalGrade).toBeNull();
    // Still cascades so level/course progress reflect the removal.
    expect(mocks.recalculateStudentLevelProgress).toHaveBeenCalledWith("e1", "cl1", "org-1", undefined);
  });

  // completedAt wiring: the cascade reads the prior row and resolves a STABLE
  // completedAt (helper unit-tested exhaustively in completed-at.test.ts).
  describe("stable completedAt", () => {
    const D1 = new Date("2026-03-01T00:00:00Z");
    const passingResults = [{ assessmentComponentId: "c1", grade: 80, normalizedGrade: 80 }];
    const completedAtArg = () => mocks.upsertStudentSubjectProgress.mock.calls[0][0].completedAt as Date | null;

    it("stamps completedAt when a subject first becomes PASSED", async () => {
      mocks.subjectProgressFindFirst.mockResolvedValue(null); // new row
      mocks.findResultsByEnrollmentAndLevelSubject.mockResolvedValue(passingResults);

      await recalculateSubjectProgressCascade(context, params);

      expect(completedAtArg()).toBeInstanceOf(Date);
    });

    it("preserves the original completedAt when the subject stays PASSED (idempotent recalc)", async () => {
      mocks.subjectProgressFindFirst.mockResolvedValue({ status: "PASSED", completedAt: D1 });
      mocks.findResultsByEnrollmentAndLevelSubject.mockResolvedValue(passingResults);

      await recalculateSubjectProgressCascade(context, params);

      // A later recalculation must NOT move the date forward.
      expect(completedAtArg()).toEqual(D1);
    });

    it("clears completedAt when a previously-completed subject drops to a non-terminal status", async () => {
      mocks.subjectProgressFindFirst.mockResolvedValue({ status: "PASSED", completedAt: D1 });
      // No canonical results → required component missing → BLOCKED (non-terminal).
      mocks.findResultsByEnrollmentAndLevelSubject.mockResolvedValue([]);

      await recalculateSubjectProgressCascade(context, params);

      expect(completedAtArg()).toBeNull();
    });
  });

  // Recovery lifecycle: a failing grade with allowRecovery is RECOVERY_REQUIRED,
  // a real non-terminal state — it must NOT collapse to FAILED.
  describe("recovery lifecycle", () => {
    const statusArg = () => mocks.upsertStudentSubjectProgress.mock.calls[0][0].status as string;
    const completedAtArg = () => mocks.upsertStudentSubjectProgress.mock.calls[0][0].completedAt as Date | null;
    const auditActions = () =>
      mocks.auditLog.mock.calls.map((c: unknown[]) => (c[1] as { action: string }).action);

    const allowRecovery = (allow: boolean) =>
      mocks.findActivePolicyForLevelSubject.mockResolvedValue({
        id: "p1", calculationMethod: "SIMPLE_AVERAGE", roundingMethod: "NONE",
        minimumPassingGrade: 50, allowRecovery: allow,
      });

    it("failing grade + allowRecovery=true (no recovery yet) → RECOVERY_REQUIRED, not FAILED", async () => {
      allowRecovery(true);
      mocks.subjectProgressFindFirst.mockResolvedValue(null);
      mocks.findResultsByEnrollmentAndLevelSubject.mockResolvedValue([
        { assessmentComponentId: "c1", grade: 45, normalizedGrade: 45, sourceType: "CONTINUOUS" },
      ]);

      const progress = await recalculateSubjectProgressCascade(context, params);

      expect(progress.status).toBe("RECOVERY_REQUIRED");
      expect(statusArg()).not.toBe("FAILED");
    });

    it("RECOVERY_REQUIRED does not set completedAt (non-terminal)", async () => {
      allowRecovery(true);
      mocks.subjectProgressFindFirst.mockResolvedValue(null);
      mocks.findResultsByEnrollmentAndLevelSubject.mockResolvedValue([
        { assessmentComponentId: "c1", grade: 45, normalizedGrade: 45, sourceType: "CONTINUOUS" },
      ]);

      await recalculateSubjectProgressCascade(context, params);

      expect(completedAtArg()).toBeNull();
    });

    it("emits a student_subject_progress.recovery_required audit on entry", async () => {
      allowRecovery(true);
      mocks.subjectProgressFindFirst.mockResolvedValue({ status: "IN_PROGRESS", completedAt: null });
      mocks.findResultsByEnrollmentAndLevelSubject.mockResolvedValue([
        { assessmentComponentId: "c1", grade: 45, normalizedGrade: 45, sourceType: "CONTINUOUS" },
      ]);

      await recalculateSubjectProgressCascade(context, params);

      expect(auditActions()).toContain("student_subject_progress.recovery_required");
    });

    it("failing grade + allowRecovery=false → FAILED (terminal, completedAt stamped)", async () => {
      allowRecovery(false);
      mocks.subjectProgressFindFirst.mockResolvedValue(null);
      mocks.findResultsByEnrollmentAndLevelSubject.mockResolvedValue([
        { assessmentComponentId: "c1", grade: 45, normalizedGrade: 45, sourceType: "CONTINUOUS" },
      ]);

      const progress = await recalculateSubjectProgressCascade(context, params);

      expect(progress.status).toBe("FAILED");
      expect(completedAtArg()).toBeInstanceOf(Date);
    });

    it("RECOVERY_REQUIRED → PASSED after a successful recovery stamps completedAt + audits 'recovered'", async () => {
      allowRecovery(true);
      mocks.subjectProgressFindFirst.mockResolvedValue({ status: "RECOVERY_REQUIRED", completedAt: null });
      mocks.findResultsByEnrollmentAndLevelSubject.mockResolvedValue([
        { assessmentComponentId: "c1", grade: 65, normalizedGrade: 65, sourceType: "RECOVERY" },
      ]);

      const progress = await recalculateSubjectProgressCascade(context, params);

      expect(progress.status).toBe("PASSED");
      expect(completedAtArg()).toBeInstanceOf(Date);
      expect(auditActions()).toContain("student_subject_progress.recovered");
    });

    it("RECOVERY_REQUIRED → FAILED once the recovery attempt is used and still failing (exhausted)", async () => {
      allowRecovery(true);
      mocks.subjectProgressFindFirst.mockResolvedValue({ status: "RECOVERY_REQUIRED", completedAt: null });
      // A RECOVERY-sourced canonical row exists but still below the minimum.
      mocks.findResultsByEnrollmentAndLevelSubject.mockResolvedValue([
        { assessmentComponentId: "c1", grade: 45, normalizedGrade: 45, sourceType: "RECOVERY" },
      ]);

      const progress = await recalculateSubjectProgressCascade(context, params);

      expect(progress.status).toBe("FAILED");
      expect(completedAtArg()).toBeInstanceOf(Date);
      expect(auditActions()).toContain("student_subject_progress.failed_after_recovery");
    });

    it("resolves each component independently from its single canonical row (no double-count)", async () => {
      // Two components, each with exactly one (recovery-resolved) row: the final
      // grade must average the two once — never sum an original + recovery.
      mocks.findActivePolicyForLevelSubject.mockResolvedValue({
        id: "p1", calculationMethod: "SIMPLE_AVERAGE", roundingMethod: "NONE",
        minimumPassingGrade: 50, allowRecovery: true,
      });
      mocks.findActiveComponentsByPolicy.mockResolvedValue([
        { id: "c1", weight: 1, maxGrade: 100, isRequired: true },
        { id: "c2", weight: 1, maxGrade: 100, isRequired: true },
      ]);
      mocks.findResultsByEnrollmentAndLevelSubject.mockResolvedValue([
        { assessmentComponentId: "c1", grade: 60, normalizedGrade: 60, sourceType: "RECOVERY" },
        { assessmentComponentId: "c2", grade: 80, normalizedGrade: 80, sourceType: "CONTINUOUS" },
      ]);

      const progress = await recalculateSubjectProgressCascade(context, params);

      expect(progress.finalGrade).toBe(70); // (60 + 80) / 2 — each component counted once
      expect(progress.status).toBe("PASSED");
    });
  });

  // Attendance Engine Phase 5 — GATED academic wiring. The gate fires ONLY when
  // enforcement is enabled AND a threshold + persisted percentage exist.
  describe("attendance gate (Phase 5)", () => {
    const statusArg = () => mocks.upsertStudentSubjectProgress.mock.calls[0][0].status as string;
    const attendanceArg = () =>
      mocks.upsertStudentSubjectProgress.mock.calls[0][0].attendancePercentage as number | null;
    const completedAtArg = () => mocks.upsertStudentSubjectProgress.mock.calls[0][0].completedAt as Date | null;
    const passing = [{ assessmentComponentId: "c1", grade: 80, normalizedGrade: 80 }];

    const withThreshold = (min: number | null) =>
      mocks.levelSubjectFindFirst.mockResolvedValue({
        minimumPassingGrade: 50, minimumAttendancePercentage: min, courseLevelId: "cl1", attendancePolicyId: "ap1",
      });
    const enforce = (on: boolean) =>
      mocks.loadEffectiveAttendancePolicy.mockResolvedValue({
        enforceAttendanceForProgress: on, policyId: "ap1", source: "LEVEL_SUBJECT",
      });

    it("1/2/3. gate DISABLED: low attendance does not touch progress — stays PASSED, attendancePercentage null", async () => {
      withThreshold(75);
      enforce(false);
      mocks.findSummaryByEnrollmentAndSubject.mockResolvedValue({ attendancePercentage: 40, status: "BELOW_REQUIRED" });
      mocks.findResultsByEnrollmentAndLevelSubject.mockResolvedValue(passing);

      const progress = await recalculateSubjectProgressCascade(context, params);

      expect(progress.status).toBe("PASSED");
      expect(attendanceArg()).toBeNull(); // not persisted while gate off (safe default)
      expect(mocks.findSummaryByEnrollmentAndSubject).not.toHaveBeenCalled(); // short-circuited
    });

    it("4/5. gate ENABLED + below minimum → INCOMPLETE with completedAt null", async () => {
      withThreshold(75);
      enforce(true);
      mocks.findSummaryByEnrollmentAndSubject.mockResolvedValue({ attendancePercentage: 40, status: "BELOW_REQUIRED" });
      mocks.findResultsByEnrollmentAndLevelSubject.mockResolvedValue(passing);

      const progress = await recalculateSubjectProgressCascade(context, params);

      expect(progress.status).toBe("INCOMPLETE");
      expect(attendanceArg()).toBe(40); // real value persisted
      expect(completedAtArg()).toBeNull(); // non-terminal
    });

    it("6. gate ENABLED + sufficient attendance + passing grade → PASSED", async () => {
      withThreshold(75);
      enforce(true);
      mocks.findSummaryByEnrollmentAndSubject.mockResolvedValue({ attendancePercentage: 90, status: "SUFFICIENT" });
      mocks.findResultsByEnrollmentAndLevelSubject.mockResolvedValue(passing);

      const progress = await recalculateSubjectProgressCascade(context, params);

      expect(progress.status).toBe("PASSED");
      expect(attendanceArg()).toBe(90);
    });

    it("20. gate ENABLED but no threshold on the subject → not enforced (dormant)", async () => {
      withThreshold(null);
      enforce(true);
      mocks.findResultsByEnrollmentAndLevelSubject.mockResolvedValue(passing);

      const progress = await recalculateSubjectProgressCascade(context, params);

      expect(progress.status).toBe("PASSED");
      expect(statusArg()).not.toBe("INCOMPLETE");
      expect(mocks.findSummaryByEnrollmentAndSubject).not.toHaveBeenCalled();
    });

    it("gate ENABLED + threshold but no persisted summary → dormant (never fabricates)", async () => {
      withThreshold(75);
      enforce(true);
      mocks.findSummaryByEnrollmentAndSubject.mockResolvedValue(null);
      mocks.findResultsByEnrollmentAndLevelSubject.mockResolvedValue(passing);

      const progress = await recalculateSubjectProgressCascade(context, params);

      expect(progress.status).toBe("PASSED");
      expect(attendanceArg()).toBeNull();
    });
  });

  // Sprint C: events (STUDENT_SUBJECT_PASSED/FAILED) and the generic
  // `student_subject_progress.updated` audit must represent REAL transitions.
  describe("transition-only events & audit (Sprint C)", () => {
    const eventTypes = () => mocks.publish.mock.calls.map((c: unknown[]) => (c[0] as { eventType: string }).eventType);
    const auditActions = () => mocks.auditLog.mock.calls.map((c: unknown[]) => (c[1] as { action: string }).action);
    const passing = [{ assessmentComponentId: "c1", grade: 80, normalizedGrade: 80 }];
    const failing = [{ assessmentComponentId: "c1", grade: 40, normalizedGrade: 40, sourceType: "CONTINUOUS" }];

    it("IN_PROGRESS → PASSED emits STUDENT_SUBJECT_PASSED and writes the updated audit", async () => {
      mocks.subjectProgressFindFirst.mockResolvedValue({ status: "IN_PROGRESS", finalGrade: null, attendancePercentage: null, completedAt: null, progressReason: null });
      mocks.findResultsByEnrollmentAndLevelSubject.mockResolvedValue(passing);

      await recalculateSubjectProgressCascade(context, params);

      expect(eventTypes()).toContain("student_subject.passed");
      expect(auditActions()).toContain("student_subject_progress.updated");
    });

    it("PASSED → PASSED (idempotent recalc) emits NOTHING and writes NO audit", async () => {
      mocks.subjectProgressFindFirst.mockResolvedValue(null);
      mocks.findResultsByEnrollmentAndLevelSubject.mockResolvedValue(passing);
      await recalculateSubjectProgressCascade(context, params); // first run → PASSED

      const persisted = mocks.upsertStudentSubjectProgress.mock.calls[0][0];
      mocks.subjectProgressFindFirst.mockResolvedValue({
        status: persisted.status,
        finalGrade: persisted.finalGrade,
        attendancePercentage: persisted.attendancePercentage,
        completedAt: persisted.completedAt,
        progressReason: persisted.progressReason,
      });
      mocks.publish.mockClear();
      mocks.auditLog.mockClear();

      await recalculateSubjectProgressCascade(context, params); // second run → identical

      expect(mocks.publish).not.toHaveBeenCalled();
      expect(mocks.auditLog).not.toHaveBeenCalled();
    });

    it("FAILED → FAILED (idempotent recalc) emits NOTHING and writes NO audit", async () => {
      mocks.subjectProgressFindFirst.mockResolvedValue(null);
      mocks.findResultsByEnrollmentAndLevelSubject.mockResolvedValue(failing);
      await recalculateSubjectProgressCascade(context, params); // first run → FAILED

      const persisted = mocks.upsertStudentSubjectProgress.mock.calls[0][0];
      mocks.subjectProgressFindFirst.mockResolvedValue({
        status: persisted.status,
        finalGrade: persisted.finalGrade,
        attendancePercentage: persisted.attendancePercentage,
        completedAt: persisted.completedAt,
        progressReason: persisted.progressReason,
      });
      mocks.publish.mockClear();
      mocks.auditLog.mockClear();

      await recalculateSubjectProgressCascade(context, params); // second run → identical

      expect(mocks.publish).not.toHaveBeenCalled();
      expect(mocks.auditLog).not.toHaveBeenCalled();
    });

    it("FAILED → PASSED emits STUDENT_SUBJECT_PASSED", async () => {
      mocks.subjectProgressFindFirst.mockResolvedValue({ status: "FAILED", finalGrade: 40, attendancePercentage: null, completedAt: new Date("2026-01-01"), progressReason: null });
      mocks.findResultsByEnrollmentAndLevelSubject.mockResolvedValue(passing);

      await recalculateSubjectProgressCascade(context, params);

      expect(eventTypes()).toContain("student_subject.passed");
      expect(eventTypes()).not.toContain("student_subject.failed");
    });

    it("PASSED → FAILED emits STUDENT_SUBJECT_FAILED", async () => {
      mocks.subjectProgressFindFirst.mockResolvedValue({ status: "PASSED", finalGrade: 80, attendancePercentage: null, completedAt: new Date("2026-01-01"), progressReason: null });
      mocks.findResultsByEnrollmentAndLevelSubject.mockResolvedValue(failing);

      await recalculateSubjectProgressCascade(context, params);

      expect(eventTypes()).toContain("student_subject.failed");
      expect(eventTypes()).not.toContain("student_subject.passed");
    });

    it("a grade change with the same status still writes the updated audit (meaningful change)", async () => {
      mocks.subjectProgressFindFirst.mockResolvedValue({ status: "PASSED", finalGrade: 70, attendancePercentage: null, completedAt: new Date("2026-01-01"), progressReason: null });
      mocks.findResultsByEnrollmentAndLevelSubject.mockResolvedValue(passing); // grade 80 → still PASSED

      await recalculateSubjectProgressCascade(context, params);

      expect(auditActions()).toContain("student_subject_progress.updated");
      // stays PASSED → no duplicate terminal event
      expect(mocks.publish).not.toHaveBeenCalled();
    });
  });
});
