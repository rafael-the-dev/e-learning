import { describe, it, expect, vi, beforeEach } from "vitest";

// =============================================================================
// Period recalc command layer — RBAC, batch filter scoping, dryRun (test 15).
// =============================================================================

const authState = vi.hoisted(() => ({ can: true }));
const recalcOne = vi.hoisted(() => vi.fn());
const findEnrollments = vi.hoisted(() => vi.fn());
const auditLog = vi.fn();

vi.mock("@/server/auth/rbac", () => ({
  getUserPermissions: vi.fn().mockResolvedValue([]),
  createAbility: () => ({ can: () => authState.can }),
}));
vi.mock("@/modules/audit-logs/services/audit.service", () => ({ auditService: { log: (...a: unknown[]) => auditLog(...a) } }));
vi.mock("@/modules/attendance/services/student-period-attendance-summary.service", () => ({
  recalculateStudentPeriodAttendanceSummary: (...a: unknown[]) => recalcOne(...a),
}));
vi.mock("@/modules/attendance/repositories/student-period-attendance-summary.repository", () => ({
  findDistinctPeriodEnrollments: (...a: unknown[]) => findEnrollments(...a),
}));
vi.mock("@/server/db", () => ({ getDb: async () => ({ enrollment: { findFirst: async () => ({ id: "enr-1" }) } }) }));

import { RecalculatePeriodAttendanceSummariesCommand } from "../recalculate-period-attendance-summaries.command";

const ctx = { userId: "u-1", organizationId: "org-A" };

beforeEach(() => {
  authState.can = true;
  recalcOne.mockReset();
  recalcOne.mockResolvedValue({ changed: true });
  findEnrollments.mockReset();
  findEnrollments.mockResolvedValue(["e1", "e2"]);
  auditLog.mockClear();
});

describe("RecalculatePeriodAttendanceSummariesCommand", () => {
  it("denies a caller without the recalculate permission", async () => {
    authState.can = false;
    await expect(new RecalculatePeriodAttendanceSummariesCommand({ academicYearId: "ay-1" }, ctx).run()).rejects.toThrow();
  });

  it("requires an academicYearId", async () => {
    await expect(
      new RecalculatePeriodAttendanceSummariesCommand({} as { academicYearId: string }, ctx).run()
    ).rejects.toThrow();
  });

  it("15. passes the scope filters to the target finder and recomputes each", async () => {
    const res = await new RecalculatePeriodAttendanceSummariesCommand(
      { academicYearId: "ay-1", academicTermId: "t-1", classGroupId: "cg-1", courseId: "c-1" },
      ctx
    ).run();
    expect(findEnrollments).toHaveBeenCalledWith("org-A", {
      academicYearId: "ay-1",
      academicTermId: "t-1",
      classGroupId: "cg-1",
      courseId: "c-1",
    });
    expect(res).toMatchObject({ targets: 2, changed: 2, failed: 0, dryRun: false });
    expect(recalcOne).toHaveBeenCalledTimes(2);
    expect(auditLog).toHaveBeenCalledTimes(1);
  });

  it("dryRun does not audit and forwards dryRun to the service", async () => {
    recalcOne.mockResolvedValue({ changed: false });
    const res = await new RecalculatePeriodAttendanceSummariesCommand({ academicYearId: "ay-1", dryRun: true }, ctx).run();
    expect(res.dryRun).toBe(true);
    expect(recalcOne.mock.calls[0][2]).toEqual({ dryRun: true });
    expect(auditLog).not.toHaveBeenCalled();
  });

  it("counts a failed target without aborting the sweep", async () => {
    recalcOne.mockRejectedValueOnce(new Error("boom")).mockResolvedValueOnce({ changed: true });
    const res = await new RecalculatePeriodAttendanceSummariesCommand({ academicYearId: "ay-1" }, ctx).run();
    expect(res).toMatchObject({ targets: 2, changed: 1, failed: 1 });
  });
});
