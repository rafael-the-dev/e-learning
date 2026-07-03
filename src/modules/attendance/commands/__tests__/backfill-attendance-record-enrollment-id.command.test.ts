import { describe, it, expect, vi, beforeEach } from "vitest";
import type { BackfillEnrollmentCandidate } from "@/modules/attendance/types/backfill";

// =============================================================================
// End-to-end backfill verification. The resolver, report service and command
// are REAL; only the Prisma repository layer is faked by an in-memory store so
// idempotency, no-overwrite, org isolation and batching are exercised for real.
// =============================================================================

interface FakeRecord {
  id: string;
  studentId: string;
  attendanceSessionId: string;
  organizationId: string;
  enrollmentId: string | null;
  deletedAt: Date | null;
  session: { courseId: string; classGroupId: string; courseLevelId: string | null };
}
interface FakeEnrollment extends BackfillEnrollmentCandidate {
  organizationId: string;
  studentId: string;
  deletedAt: Date | null;
}

const state = vi.hoisted(() => ({
  records: [] as FakeRecord[],
  enrollments: [] as FakeEnrollment[],
  updateCalls: 0,
}));

// The scan service resolves getDb() to thread a client to the (fully mocked)
// repository. The repo ignores it, so a stub client is enough.
vi.mock("@/server/db", () => ({ getDb: async () => ({}) }));

vi.mock("@/modules/attendance/repositories/attendance-enrollment-backfill.repository", () => ({
  countAttendanceRecords: async (orgId: string) =>
    state.records.filter((r) => r.organizationId === orgId && r.deletedAt === null).length,
  countRecordsWithEnrollment: async (orgId: string) =>
    state.records.filter((r) => r.organizationId === orgId && r.deletedAt === null && r.enrollmentId !== null).length,
  countRecordsNeedingBackfill: async (orgId: string) =>
    state.records.filter((r) => r.organizationId === orgId && r.deletedAt === null && r.enrollmentId === null).length,
  findNullEnrollmentRecordsBatch: async (orgId: string, afterId: string | null, take: number) =>
    state.records
      .filter((r) => r.organizationId === orgId && r.deletedAt === null && r.enrollmentId === null && (afterId === null || r.id > afterId))
      .sort((a, b) => a.id.localeCompare(b.id))
      .slice(0, take)
      .map((r) => ({
        id: r.id,
        studentId: r.studentId,
        attendanceSessionId: r.attendanceSessionId,
        courseId: r.session.courseId,
        classGroupId: r.session.classGroupId,
        courseLevelId: r.session.courseLevelId,
      })),
  findCandidateEnrollmentsByStudents: async (orgId: string, studentIds: string[]) => {
    const map = new Map<string, BackfillEnrollmentCandidate[]>();
    for (const e of state.enrollments) {
      if (e.organizationId !== orgId || e.deletedAt !== null) continue;
      if (e.status === "CANCELLED") continue;
      if (!studentIds.includes(e.studentId)) continue;
      const list = map.get(e.studentId) ?? [];
      list.push({ id: e.id, courseId: e.courseId, classGroupId: e.classGroupId, currentLevelId: e.currentLevelId, initialLevelId: e.initialLevelId, status: e.status });
      map.set(e.studentId, list);
    }
    return map;
  },
  updateRecordEnrollmentIdIfNull: async (recordId: string, orgId: string, enrollmentId: string) => {
    state.updateCalls++;
    const rec = state.records.find(
      (r) => r.id === recordId && r.organizationId === orgId && r.enrollmentId === null && r.deletedAt === null
    );
    if (!rec) return 0; // guarded: already filled / wrong org
    rec.enrollmentId = enrollmentId;
    return 1;
  },
}));

const authState = vi.hoisted(() => ({ can: true }));
vi.mock("@/server/auth/rbac", () => ({
  getUserPermissions: vi.fn().mockResolvedValue([]),
  createAbility: () => ({ can: () => authState.can }),
}));

const auditLog = vi.fn();
vi.mock("@/modules/audit-logs/services/audit.service", () => ({
  auditService: { log: (...args: unknown[]) => auditLog(...args) },
}));

import {
  scanAttendanceEnrollmentBackfill,
  getAttendanceEnrollmentBackfillReport,
} from "@/modules/attendance/services/attendance-enrollment-backfill-report.service";
import { BackfillAttendanceRecordEnrollmentIdCommand } from "../backfill-attendance-record-enrollment-id.command";

const ORG = "org-A";
const ctx = { userId: "u-1", organizationId: ORG };

function rec(over: Partial<FakeRecord> & Pick<FakeRecord, "id">): FakeRecord {
  return {
    studentId: "s-1",
    attendanceSessionId: "sess-1",
    organizationId: ORG,
    enrollmentId: null,
    deletedAt: null,
    session: { courseId: "c-1", classGroupId: "cg-1", courseLevelId: "lvl-1" },
    ...over,
  };
}
function enr(over: Partial<FakeEnrollment> & Pick<FakeEnrollment, "id">): FakeEnrollment {
  return {
    organizationId: ORG,
    studentId: "s-1",
    courseId: "c-1",
    classGroupId: "cg-1",
    currentLevelId: null,
    initialLevelId: null,
    status: "ACTIVE",
    deletedAt: null,
    ...over,
  };
}

beforeEach(() => {
  state.records = [];
  state.enrollments = [];
  state.updateCalls = 0;
  authState.can = true;
  auditLog.mockClear();
});

describe("backfill scan — mutation behaviour", () => {
  it("1. dryRun does not mutate", async () => {
    state.records = [rec({ id: "r-1" })];
    state.enrollments = [enr({ id: "e-1" })];
    const res = await scanAttendanceEnrollmentBackfill(ORG, { apply: false });
    expect(res.updatedRecords).toBe(0);
    expect(state.updateCalls).toBe(0);
    expect(state.records[0].enrollmentId).toBeNull();
    expect(res.resolvableRecords).toBe(1);
  });

  it("2. unambiguous row is backfilled on apply", async () => {
    state.records = [rec({ id: "r-1" })];
    state.enrollments = [enr({ id: "e-1", classGroupId: "cg-1" })];
    const res = await scanAttendanceEnrollmentBackfill(ORG, { apply: true });
    expect(res.updatedRecords).toBe(1);
    expect(state.records[0].enrollmentId).toBe("e-1");
  });

  it("3. existing enrollmentId is not overwritten", async () => {
    state.records = [rec({ id: "r-1", enrollmentId: "PRE-EXISTING" })];
    state.enrollments = [enr({ id: "e-1", classGroupId: "cg-1" })];
    const res = await scanAttendanceEnrollmentBackfill(ORG, { apply: true });
    expect(res.filledEnrollmentRecords).toBe(1);
    expect(res.nullableEnrollmentRecords).toBe(0);
    expect(state.updateCalls).toBe(0); // filled rows never enter the null batch
    expect(state.records[0].enrollmentId).toBe("PRE-EXISTING");
  });

  it("4. ambiguous row is skipped and reported", async () => {
    state.records = [rec({ id: "r-1" })];
    state.enrollments = [enr({ id: "e-1", classGroupId: "cg-1" }), enr({ id: "e-2", classGroupId: "cg-1" })];
    const res = await scanAttendanceEnrollmentBackfill(ORG, { apply: true });
    expect(res.updatedRecords).toBe(0);
    expect(res.ambiguousRecords).toBe(1);
    expect(res.sampleAmbiguousRows[0]).toMatchObject({ recordId: "r-1", candidateIds: ["e-1", "e-2"] });
    expect(state.records[0].enrollmentId).toBeNull();
  });

  it("5. unresolved row is skipped and reported", async () => {
    state.records = [rec({ id: "r-1" })]; // no enrolment for the student
    const res = await scanAttendanceEnrollmentBackfill(ORG, { apply: true });
    expect(res.updatedRecords).toBe(0);
    expect(res.unresolvedRecords).toBe(1);
    expect(res.sampleUnresolvedRows[0]).toMatchObject({ recordId: "r-1" });
    expect(state.records[0].enrollmentId).toBeNull();
  });

  it("6. is idempotent — a second apply updates nothing", async () => {
    state.records = [rec({ id: "r-1" })];
    state.enrollments = [enr({ id: "e-1", classGroupId: "cg-1" })];
    const first = await scanAttendanceEnrollmentBackfill(ORG, { apply: true });
    const second = await scanAttendanceEnrollmentBackfill(ORG, { apply: true });
    expect(first.updatedRecords).toBe(1);
    expect(second.updatedRecords).toBe(0);
    expect(second.nullableEnrollmentRecords).toBe(0);
  });

  it("7. respects organization isolation", async () => {
    state.records = [rec({ id: "r-1", organizationId: "org-A" }), rec({ id: "r-2", organizationId: "org-B" })];
    // candidate lives in org-B only — must not be used for org-A, and vice-versa
    state.enrollments = [enr({ id: "e-B", organizationId: "org-B", classGroupId: "cg-1" })];
    const res = await scanAttendanceEnrollmentBackfill("org-A", { apply: true });
    expect(res.totalAttendanceRecords).toBe(1);
    expect(res.updatedRecords).toBe(0); // org-A row has no org-A candidate
    expect(state.records.find((r) => r.id === "r-2")!.enrollmentId).toBeNull(); // org-B untouched
  });

  it("8. batch mode handles multiple rows across batches", async () => {
    state.records = [rec({ id: "r-1" }), rec({ id: "r-2" }), rec({ id: "r-3" })];
    state.enrollments = [enr({ id: "e-1", classGroupId: "cg-1" })];
    const res = await scanAttendanceEnrollmentBackfill(ORG, { apply: true, batchSize: 1 });
    expect(res.scannedRecords).toBe(3);
    expect(res.updatedRecords).toBe(3);
    expect(state.records.every((r) => r.enrollmentId === "e-1")).toBe(true);
  });

  it("9. report counts are internally consistent", async () => {
    state.records = [
      rec({ id: "r-1" }), // resolvable
      rec({ id: "r-2", session: { courseId: "c-1", classGroupId: "cg-1", courseLevelId: "lvl-1" } }), // ambiguous
      rec({ id: "r-3", studentId: "s-none" }), // unresolved
      rec({ id: "r-4", enrollmentId: "FILLED" }), // already filled
    ];
    state.enrollments = [
      enr({ id: "e-1", studentId: "s-1", classGroupId: "cg-1" }),
      enr({ id: "e-2", studentId: "s-1", classGroupId: "cg-1" }), // makes s-1 ambiguous
    ];
    const report = await getAttendanceEnrollmentBackfillReport(ORG);
    expect(report.totalAttendanceRecords).toBe(4);
    expect(report.filledEnrollmentRecords).toBe(1);
    expect(report.nullableEnrollmentRecords).toBe(3);
    // r-1 and r-2 both belong to s-1 who now has 2 same-classGroup enrolments → both ambiguous
    expect(report.resolvableRecords + report.ambiguousRecords + report.unresolvedRecords).toBe(
      report.nullableEnrollmentRecords
    );
    expect(report.ambiguousRecords).toBe(2);
    expect(report.unresolvedRecords).toBe(1);
    expect(report.resolvableRecords).toBe(0);
  });

  it("10. never touches academic data — only enrollmentId is written", async () => {
    state.records = [rec({ id: "r-1" })];
    state.enrollments = [enr({ id: "e-1", classGroupId: "cg-1" })];
    const res = await scanAttendanceEnrollmentBackfill(ORG, { apply: true });
    // The only mutation recorded is the guarded enrollmentId update; no summary /
    // progress writer exists on this path (nothing else is mockable/called).
    expect(state.updateCalls).toBe(1);
    expect(res.updatedRecords).toBe(1);
    // enrollmentId is the ONLY field written — the guarded update carries no other
    // column, and nothing on this path touches summaries or attendancePercentage.
    expect(state.records[0].enrollmentId).toBe("e-1");
  });
});

describe("BackfillAttendanceRecordEnrollmentIdCommand", () => {
  it("defaults to dryRun (safe) when dryRun is omitted", async () => {
    state.records = [rec({ id: "r-1" })];
    state.enrollments = [enr({ id: "e-1", classGroupId: "cg-1" })];
    const res = await new BackfillAttendanceRecordEnrollmentIdCommand({}, ctx).run();
    expect(res.dryRun).toBe(true);
    expect(res.updatedRecords).toBe(0);
    expect(state.records[0].enrollmentId).toBeNull();
    expect(auditLog).not.toHaveBeenCalled();
  });

  it("applies and audits a real run that changed rows", async () => {
    state.records = [rec({ id: "r-1" })];
    state.enrollments = [enr({ id: "e-1", classGroupId: "cg-1" })];
    const res = await new BackfillAttendanceRecordEnrollmentIdCommand({ dryRun: false }, ctx).run();
    expect(res.updatedRecords).toBe(1);
    expect(auditLog).toHaveBeenCalledTimes(1);
    expect(auditLog.mock.calls[0][1]).toMatchObject({ action: "attendance_record.enrollment_backfilled" });
  });

  it("does not audit a real run that changed nothing", async () => {
    state.records = [rec({ id: "r-1", studentId: "s-none" })]; // unresolved
    const res = await new BackfillAttendanceRecordEnrollmentIdCommand({ dryRun: false }, ctx).run();
    expect(res.updatedRecords).toBe(0);
    expect(auditLog).not.toHaveBeenCalled();
  });

  it("rejects an invalid batchSize", async () => {
    await expect(new BackfillAttendanceRecordEnrollmentIdCommand({ batchSize: 0 }, ctx).run()).rejects.toThrow();
  });

  it("denies a caller without the backfill permission", async () => {
    authState.can = false;
    state.records = [rec({ id: "r-1" })];
    state.enrollments = [enr({ id: "e-1", classGroupId: "cg-1" })];
    await expect(new BackfillAttendanceRecordEnrollmentIdCommand({}, ctx).run()).rejects.toThrow();
    expect(state.records[0].enrollmentId).toBeNull(); // authorize() blocks before execute()
  });
});
