import { describe, it, expect, vi, beforeEach } from "vitest";
import type { PeriodCalcRecord } from "@/modules/attendance/types";

// =============================================================================
// Period service orchestration — Phase 4 §12 tests 2, 10–14, 17, 19, 20.
// Engine + policy resolution run for real; only I/O is faked.
// =============================================================================

type RawRec = Omit<PeriodCalcRecord, "policy" | "minimumAttendancePercentage">;

const store = vi.hoisted(() => ({
  enrollment: null as null | { id: string; studentId: string; courseId: string; courseLevelId: string | null; classGroupId: string | null },
  records: [] as RawRec[],
  levelSubjects: new Map<string, { attendancePolicyId: string | null; minimumAttendancePercentage: number | null }>(),
  summaries: new Map<string, Record<string, unknown>>(),
  triggerRecord: null as null | { enrollmentId: string | null; attendanceSession: { academicYearId: string; academicTermId: string | null } },
  upsertCalls: 0,
  throwOnUpsert: false,
}));

const auditLog = vi.fn();
const publish = vi.fn();
const findPeriodCalcRecords = vi.fn();

vi.mock("@/server/db", () => ({
  getDb: async () => ({
    $transaction: async (cb: (tx: unknown) => Promise<unknown>) => cb({}),
    attendanceRecord: { findFirst: async () => store.triggerRecord },
  }),
}));
vi.mock("@/modules/audit-logs/services/audit.service", () => ({ auditService: { log: (...a: unknown[]) => auditLog(...a) } }));
vi.mock("@/server/events/event-publisher", () => ({ eventPublisher: { publish: (...a: unknown[]) => publish(...a) } }));

vi.mock("@/modules/attendance/services/attendance-policy.resolver", async (orig) => ({
  ...(await orig<typeof import("@/modules/attendance/services/attendance-policy.resolver")>()),
  findRawOrgDefaultPolicy: async () => null, // no org default → fallback policy
  findRawPoliciesByIds: async () => new Map(),
}));

const key = (e: string, y: string, t: string | null) => `${e}|${y}|${t ?? "NULL"}`;

vi.mock("@/modules/attendance/repositories/student-period-attendance-summary.repository", () => ({
  findEnrollmentContextForPeriod: async (enrollmentId: string) =>
    store.enrollment && store.enrollment.id === enrollmentId ? store.enrollment : null,
  findPeriodCalcRecords: (...a: unknown[]) => findPeriodCalcRecords(...a),
  findLevelSubjectsForPeriod: async () => store.levelSubjects,
  findPeriodSummary: async (enrollmentId: string, academicYearId: string, academicTermId: string | null) =>
    store.summaries.get(key(enrollmentId, academicYearId, academicTermId)) ?? null,
  upsertPeriodSummary: async (data: { enrollmentId: string; academicYearId: string; academicTermId: string | null } & Record<string, unknown>) => {
    store.upsertCalls++;
    if (store.throwOnUpsert) throw new Error("upsert failed");
    const row = { id: `p-${key(data.enrollmentId, data.academicYearId, data.academicTermId)}`, ...data };
    store.summaries.set(key(data.enrollmentId, data.academicYearId, data.academicTermId), row);
    return row;
  },
}));

import {
  recalculateStudentPeriodAttendanceSummary,
  triggerPeriodSummaryRecalcForRecord,
} from "../student-period-attendance-summary.service";

const ctx = { userId: "u-1", organizationId: "org-A" };
const ENR = "enr-1";
const YEAR = "ay-1";

function rawRec(over: Partial<RawRec> & Pick<RawRec, "levelSubjectId" | "status">): RawRec {
  return { durationMinutes: 60, minutesAttended: 0, lateMinutes: null, hasApprovedJustification: false, ...over };
}

beforeEach(() => {
  store.enrollment = { id: ENR, studentId: "stu-1", courseId: "c-1", courseLevelId: "cl-1", classGroupId: "cg-1" };
  store.records = [rawRec({ levelSubjectId: "ls-1", status: "PRESENT" }), rawRec({ levelSubjectId: "ls-1", status: "ABSENT" })];
  store.levelSubjects = new Map([["ls-1", { attendancePolicyId: null, minimumAttendancePercentage: 75 }]]);
  store.summaries = new Map();
  store.triggerRecord = null;
  store.upsertCalls = 0;
  store.throwOnUpsert = false;
  auditLog.mockClear();
  publish.mockClear();
  findPeriodCalcRecords.mockReset();
  findPeriodCalcRecords.mockImplementation(async () => store.records);
});

describe("recalculateStudentPeriodAttendanceSummary", () => {
  it("2. passes the academicTermId through to the record loader (term aggregation)", async () => {
    await recalculateStudentPeriodAttendanceSummary(ctx, { enrollmentId: ENR, academicYearId: YEAR, academicTermId: "term-1" });
    expect(findPeriodCalcRecords).toHaveBeenCalledWith(ENR, YEAR, "term-1", "org-A");
  });

  it("10. idempotent — a second identical recalc writes nothing", async () => {
    const first = await recalculateStudentPeriodAttendanceSummary(ctx, { enrollmentId: ENR, academicYearId: YEAR });
    expect(first.changed).toBe(true);
    expect(store.upsertCalls).toBe(1);
    const second = await recalculateStudentPeriodAttendanceSummary(ctx, { enrollmentId: ENR, academicYearId: YEAR });
    expect(second.changed).toBe(false);
    expect(store.upsertCalls).toBe(1);
  });

  it("11. no audit/event when unchanged", async () => {
    await recalculateStudentPeriodAttendanceSummary(ctx, { enrollmentId: ENR, academicYearId: YEAR });
    auditLog.mockClear();
    publish.mockClear();
    await recalculateStudentPeriodAttendanceSummary(ctx, { enrollmentId: ENR, academicYearId: YEAR });
    expect(auditLog).not.toHaveBeenCalled();
    expect(publish).not.toHaveBeenCalled();
  });

  it("12. audit + period_summary_recalculated event on a changed summary", async () => {
    await recalculateStudentPeriodAttendanceSummary(ctx, { enrollmentId: ENR, academicYearId: YEAR });
    expect(auditLog.mock.calls[0][1]).toMatchObject({ action: "attendance_period_summary.recalculated" });
    expect(publish.mock.calls.map((c) => c[0].eventType)).toContain("attendance.period_summary_recalculated");
  });

  it("13. tenant isolation — enrolment in another org is not found", async () => {
    store.enrollment = null;
    await expect(
      recalculateStudentPeriodAttendanceSummary(ctx, { enrollmentId: "enr-x", academicYearId: YEAR })
    ).rejects.toThrow();
    expect(store.upsertCalls).toBe(0);
  });

  it("14. dryRun does not mutate", async () => {
    const r = await recalculateStudentPeriodAttendanceSummary(ctx, { enrollmentId: ENR, academicYearId: YEAR }, { dryRun: true });
    expect(r.dryRun).toBe(true);
    expect(r.changed).toBe(true); // would change (no prior row)
    expect(store.upsertCalls).toBe(0);
    expect(auditLog).not.toHaveBeenCalled();
    expect(publish).not.toHaveBeenCalled();
  });

  it("17/18. only writes the period summary — no academic/progress write on this path", async () => {
    await recalculateStudentPeriodAttendanceSummary(ctx, { enrollmentId: ENR, academicYearId: YEAR });
    // The single write is the period upsert; the service imports no progress/cascade writer.
    expect(store.upsertCalls).toBe(1);
  });

  it("19. a failed upsert rolls back — no event published", async () => {
    store.throwOnUpsert = true;
    await expect(
      recalculateStudentPeriodAttendanceSummary(ctx, { enrollmentId: ENR, academicYearId: YEAR })
    ).rejects.toThrow();
    expect(publish).not.toHaveBeenCalled();
    expect(store.summaries.size).toBe(0);
  });

  it("20. repair recreates a missing summary", async () => {
    // no existing row → recalc creates it
    const r = await recalculateStudentPeriodAttendanceSummary(ctx, { enrollmentId: ENR, academicYearId: YEAR });
    expect(r.changed).toBe(true);
    expect(store.summaries.has(key(ENR, YEAR, null))).toBe(true);
  });

  it("emits period_below_required on a GOOD → BELOW_REQUIRED crossing", async () => {
    store.summaries.set(key(ENR, YEAR, null), {
      id: `p-${key(ENR, YEAR, null)}`,
      totalSessions: 2, presentCount: 2, absentCount: 0, lateCount: 0, excusedCount: 0, remoteCount: 0,
      totalScheduledMinutes: 120, totalPresentMinutes: 120, attendancePercentage: 100, status: "GOOD",
    });
    store.records = [rawRec({ levelSubjectId: "ls-1", status: "ABSENT" }), rawRec({ levelSubjectId: "ls-1", status: "ABSENT" })];
    const r = await recalculateStudentPeriodAttendanceSummary(ctx, { enrollmentId: ENR, academicYearId: YEAR });
    expect(r.next.status).toBe("BELOW_REQUIRED");
    expect(publish.mock.calls.map((c) => c[0].eventType)).toContain("attendance.period_below_required");
  });
});

describe("triggerPeriodSummaryRecalcForRecord", () => {
  it("19b. a null enrollmentId is safely ignored (fire-and-forget, no throw)", async () => {
    store.triggerRecord = { enrollmentId: null, attendanceSession: { academicYearId: YEAR, academicTermId: null } };
    expect(() => triggerPeriodSummaryRecalcForRecord(ctx, "rec-x")).not.toThrow();
    await new Promise((r) => setTimeout(r, 0));
    expect(store.upsertCalls).toBe(0);
  });
});
