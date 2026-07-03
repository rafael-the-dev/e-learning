import { describe, it, expect, vi, beforeEach } from "vitest";

// =============================================================================
// Recalc command layer — RBAC gate, batch scope validation, delegation + audit.
// The single-writer service is mocked; these tests cover the command wrappers.
// =============================================================================

const authState = vi.hoisted(() => ({ can: true }));
const recalcOne = vi.hoisted(() => vi.fn());
const targets = vi.hoisted(() => ({ list: [] as { enrollmentId: string; levelSubjectId: string }[] }));
const auditLog = vi.fn();

vi.mock("@/server/auth/rbac", () => ({
  getUserPermissions: vi.fn().mockResolvedValue([]),
  createAbility: () => ({ can: () => authState.can }),
}));
vi.mock("@/modules/audit-logs/services/audit.service", () => ({
  auditService: { log: (...a: unknown[]) => auditLog(...a) },
}));
vi.mock("@/modules/attendance/services/student-subject-attendance-summary.service", () => ({
  recalculateStudentSubjectAttendanceSummary: (...a: unknown[]) => recalcOne(...a),
}));
vi.mock("@/modules/attendance/repositories/student-subject-attendance-summary.repository", () => ({
  findDistinctSummaryTargets: async () => targets.list,
}));
vi.mock("@/server/db", () => ({
  getDb: async () => ({ enrollment: { findFirst: async () => ({ id: "enr-1" }) } }),
}));

import { RecalculateAttendanceSummariesCommand } from "../recalculate-attendance-summaries.command";
import { RecalculateStudentSubjectAttendanceSummaryCommand } from "../recalculate-student-subject-attendance-summary.command";

const ctx = { userId: "u-1", organizationId: "org-A" };

beforeEach(() => {
  authState.can = true;
  targets.list = [];
  recalcOne.mockReset();
  recalcOne.mockResolvedValue({ changed: true });
  auditLog.mockClear();
});

describe("RecalculateStudentSubjectAttendanceSummaryCommand", () => {
  it("denies a caller without the recalculate permission", async () => {
    authState.can = false;
    await expect(
      new RecalculateStudentSubjectAttendanceSummaryCommand({ enrollmentId: "enr-1", levelSubjectId: "ls-1" }, ctx).run()
    ).rejects.toThrow();
  });

  it("delegates to the single-writer service when authorized", async () => {
    await new RecalculateStudentSubjectAttendanceSummaryCommand({ enrollmentId: "enr-1", levelSubjectId: "ls-1" }, ctx).run();
    expect(recalcOne).toHaveBeenCalledTimes(1);
    expect(recalcOne.mock.calls[0][1]).toEqual({ enrollmentId: "enr-1", levelSubjectId: "ls-1" });
  });
});

describe("RecalculateAttendanceSummariesCommand (batch)", () => {
  it("rejects an unbounded sweep with no scope filter", async () => {
    await expect(new RecalculateAttendanceSummariesCommand({}, ctx).run()).rejects.toThrow();
  });

  it("recomputes every target and audits the sweep", async () => {
    targets.list = [
      { enrollmentId: "e1", levelSubjectId: "ls1" },
      { enrollmentId: "e2", levelSubjectId: "ls1" },
    ];
    recalcOne.mockResolvedValueOnce({ changed: true }).mockResolvedValueOnce({ changed: false });
    const res = await new RecalculateAttendanceSummariesCommand({ levelSubjectId: "ls1" }, ctx).run();
    expect(res).toEqual({ targets: 2, changed: 1, failed: 0 });
    expect(recalcOne).toHaveBeenCalledTimes(2);
    expect(auditLog.mock.calls[0][1]).toMatchObject({ action: "attendance_summary.batch_recalculated" });
  });

  it("counts a failed target without aborting the sweep", async () => {
    targets.list = [
      { enrollmentId: "e1", levelSubjectId: "ls1" },
      { enrollmentId: "e2", levelSubjectId: "ls1" },
    ];
    recalcOne.mockRejectedValueOnce(new Error("boom")).mockResolvedValueOnce({ changed: true });
    const res = await new RecalculateAttendanceSummariesCommand({ classGroupId: "cg1" }, ctx).run();
    expect(res).toEqual({ targets: 2, changed: 1, failed: 1 });
  });
});
