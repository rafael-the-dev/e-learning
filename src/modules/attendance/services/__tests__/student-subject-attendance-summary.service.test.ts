import { describe, it, expect, vi, beforeEach } from "vitest";
import type { AttendanceCalcRecordInput, EffectiveAttendancePolicy } from "@/modules/attendance/types";
import { DEFAULT_ATTENDANCE_POLICY } from "@/modules/attendance/types";

// =============================================================================
// Summary service orchestration — Phase 3 §10 tests 15–20 (+ transitions).
// The calculation engine and change-detection run for real; only I/O
// (repositories, db, audit, events) is faked via an in-memory store.
// =============================================================================

const store = vi.hoisted(() => ({
  enrollment: null as null | { id: string; studentId: string; classGroupId: string | null },
  levelSubject: null as null | { id: string; minimumAttendancePercentage: number | null; attendancePolicyId: string | null },
  policy: null as null | EffectiveAttendancePolicy,
  sessions: [] as { id: string; durationMinutes: number }[],
  records: [] as AttendanceCalcRecordInput[],
  summaries: new Map<string, Record<string, unknown>>(),
  throwOnUpsert: false,
  upsertCalls: 0,
}));

const auditLog = vi.fn();
const publish = vi.fn();

vi.mock("@/server/db", () => ({
  getDb: async () => ({
    levelSubject: { findFirst: async () => store.levelSubject },
    // Fake interactive transaction: just run the callback with a stub tx client.
    $transaction: async (cb: (tx: unknown) => Promise<unknown>) => cb({}),
  }),
}));

vi.mock("@/modules/audit-logs/services/audit.service", () => ({
  auditService: { log: (...a: unknown[]) => auditLog(...a) },
}));

vi.mock("@/server/events/event-publisher", () => ({
  eventPublisher: { publish: (...a: unknown[]) => publish(...a) },
}));

vi.mock("@/modules/attendance/services/attendance-policy.resolver", () => ({
  loadEffectiveAttendancePolicy: async () => store.policy,
}));

vi.mock("@/modules/attendance/repositories/attendance-session.repository", () => ({
  findCompletedSessionsForLevelSubject: async () => store.sessions,
}));

const key = (e: string, ls: string) => `${e}|${ls}`;

vi.mock("@/modules/attendance/repositories/student-subject-attendance-summary.repository", () => ({
  findEnrollmentContext: async (enrollmentId: string) =>
    store.enrollment && store.enrollment.id === enrollmentId ? store.enrollment : null,
  findCalcRecordsForEnrollment: async () => store.records,
  findEnrollmentsMarkedInSession: async () =>
    store.enrollment ? [{ enrollmentId: store.enrollment.id, studentId: store.enrollment.studentId }] : [],
  findSummaryByEnrollmentAndSubject: async (enrollmentId: string, levelSubjectId: string) =>
    store.summaries.get(key(enrollmentId, levelSubjectId)) ?? null,
  upsertSummary: async (data: { enrollmentId: string; levelSubjectId: string } & Record<string, unknown>) => {
    store.upsertCalls++;
    if (store.throwOnUpsert) throw new Error("upsert failed");
    const row = { id: `sum-${key(data.enrollmentId, data.levelSubjectId)}`, ...data };
    store.summaries.set(key(data.enrollmentId, data.levelSubjectId), row);
    return row;
  },
}));

import { recalculateStudentSubjectAttendanceSummary } from "../student-subject-attendance-summary.service";

const ctx = { userId: "u-1", organizationId: "org-A" };
const ENR = "enr-1";
const LS = "ls-1";

function effPolicy(over: Partial<EffectiveAttendancePolicy> = {}): EffectiveAttendancePolicy {
  return { ...DEFAULT_ATTENDANCE_POLICY, source: "FALLBACK", policyId: null, ...over };
}

beforeEach(() => {
  store.enrollment = { id: ENR, studentId: "stu-1", classGroupId: "cg-1" };
  store.levelSubject = { id: LS, minimumAttendancePercentage: 75, attendancePolicyId: null };
  store.policy = effPolicy();
  store.sessions = [{ id: "s1", durationMinutes: 60 }, { id: "s2", durationMinutes: 60 }];
  store.records = [
    { attendanceSessionId: "s1", status: "PRESENT", minutesAttended: 0, lateMinutes: null, hasApprovedJustification: false },
    { attendanceSessionId: "s2", status: "PRESENT", minutesAttended: 0, lateMinutes: null, hasApprovedJustification: false },
  ];
  store.summaries = new Map();
  store.throwOnUpsert = false;
  store.upsertCalls = 0;
  auditLog.mockClear();
  publish.mockClear();
});

describe("recalculateStudentSubjectAttendanceSummary", () => {
  it("15. upsert is idempotent — a second identical recalc writes nothing", async () => {
    const first = await recalculateStudentSubjectAttendanceSummary(ctx, { enrollmentId: ENR, levelSubjectId: LS });
    expect(first.changed).toBe(true);
    expect(first.next).toMatchObject({ attendancePercentage: 100, status: "SUFFICIENT" });
    expect(store.upsertCalls).toBe(1);

    const second = await recalculateStudentSubjectAttendanceSummary(ctx, { enrollmentId: ENR, levelSubjectId: LS });
    expect(second.changed).toBe(false);
    expect(store.upsertCalls).toBe(1); // no second write
  });

  it("16. no audit/event when the summary is unchanged", async () => {
    await recalculateStudentSubjectAttendanceSummary(ctx, { enrollmentId: ENR, levelSubjectId: LS });
    auditLog.mockClear();
    publish.mockClear();
    await recalculateStudentSubjectAttendanceSummary(ctx, { enrollmentId: ENR, levelSubjectId: LS });
    expect(auditLog).not.toHaveBeenCalled();
    expect(publish).not.toHaveBeenCalled();
  });

  it("17. audit + summary_recalculated event on a changed summary", async () => {
    await recalculateStudentSubjectAttendanceSummary(ctx, { enrollmentId: ENR, levelSubjectId: LS });
    expect(auditLog).toHaveBeenCalledTimes(1);
    expect(auditLog.mock.calls[0][1]).toMatchObject({ action: "attendance_summary.recalculated" });
    const eventTypes = publish.mock.calls.map((c) => c[0].eventType);
    expect(eventTypes).toContain("attendance.summary_recalculated");
  });

  it("18. a failed upsert rolls back — no event is published", async () => {
    store.throwOnUpsert = true;
    await expect(
      recalculateStudentSubjectAttendanceSummary(ctx, { enrollmentId: ENR, levelSubjectId: LS })
    ).rejects.toThrow();
    expect(publish).not.toHaveBeenCalled();
    expect(store.summaries.size).toBe(0); // nothing persisted
  });

  it("19. tenant isolation — an enrolment in another org is not found", async () => {
    store.enrollment = null; // findEnrollmentContext returns null for this org
    await expect(
      recalculateStudentSubjectAttendanceSummary(ctx, { enrollmentId: "enr-other", levelSubjectId: LS })
    ).rejects.toThrow();
    expect(store.upsertCalls).toBe(0);
  });

  it("20. a null enrollmentId is safely ignored by the trigger (no work)", async () => {
    const { triggerAttendanceSummaryRecalc } = await import(
      "../student-subject-attendance-summary.service"
    );
    triggerAttendanceSummaryRecalc(ctx, { enrollmentId: null, levelSubjectId: LS });
    triggerAttendanceSummaryRecalc(ctx, { enrollmentId: undefined, levelSubjectId: LS });
    await new Promise((r) => setTimeout(r, 0)); // flush any microtasks
    expect(store.upsertCalls).toBe(0);
    expect(auditLog).not.toHaveBeenCalled();
  });

  it("emits BELOW_REQUIRED on a SUFFICIENT → BELOW_REQUIRED crossing", async () => {
    store.summaries.set(key(ENR, LS), {
      id: `sum-${key(ENR, LS)}`,
      totalSessions: 2, totalScheduledMinutes: 120, totalPresentMinutes: 120,
      totalAbsentMinutes: 0, totalLateMinutes: 0, totalExcusedMinutes: 0,
      attendancePercentage: 100, status: "SUFFICIENT", attendancePolicyId: null,
    });
    store.records = [
      { attendanceSessionId: "s1", status: "ABSENT", minutesAttended: 0, lateMinutes: null, hasApprovedJustification: false },
      { attendanceSessionId: "s2", status: "ABSENT", minutesAttended: 0, lateMinutes: null, hasApprovedJustification: false },
    ];
    const r = await recalculateStudentSubjectAttendanceSummary(ctx, { enrollmentId: ENR, levelSubjectId: LS });
    expect(r.next.status).toBe("BELOW_REQUIRED");
    const eventTypes = publish.mock.calls.map((c) => c[0].eventType);
    expect(eventTypes).toContain("attendance.student_below_required");
  });

  it("emits recovered on a BELOW_REQUIRED → SUFFICIENT crossing", async () => {
    store.summaries.set(key(ENR, LS), {
      id: `sum-${key(ENR, LS)}`,
      totalSessions: 2, totalScheduledMinutes: 120, totalPresentMinutes: 0,
      totalAbsentMinutes: 120, totalLateMinutes: 0, totalExcusedMinutes: 0,
      attendancePercentage: 0, status: "BELOW_REQUIRED", attendancePolicyId: null,
    });
    // default records are both PRESENT → 100% → SUFFICIENT
    const r = await recalculateStudentSubjectAttendanceSummary(ctx, { enrollmentId: ENR, levelSubjectId: LS });
    expect(r.next.status).toBe("SUFFICIENT");
    const eventTypes = publish.mock.calls.map((c) => c[0].eventType);
    expect(eventTypes).toContain("attendance.student_recovered_attendance");
  });
});
