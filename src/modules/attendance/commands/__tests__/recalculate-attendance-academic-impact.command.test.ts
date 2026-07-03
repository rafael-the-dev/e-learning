import { describe, it, expect, vi, beforeEach } from "vitest";

// =============================================================================
// Repair command (Phase 5 §10 tests 15,16,17): idempotent, dryRun, tenant, filters.
// =============================================================================

const authState = vi.hoisted(() => ({ can: true }));
const m = vi.hoisted(() => ({
  findTargets: vi.fn(),
  recalcSummary: vi.fn(),
  applyImpact: vi.fn(),
  auditLog: vi.fn(),
}));

vi.mock("@/server/auth/rbac", () => ({
  getUserPermissions: vi.fn().mockResolvedValue([]),
  createAbility: () => ({ can: () => authState.can }),
}));
vi.mock("@/modules/audit-logs/services/audit.service", () => ({ auditService: { log: (...a: unknown[]) => m.auditLog(...a) } }));
vi.mock("@/modules/attendance/repositories/student-subject-attendance-summary.repository", () => ({
  findDistinctSummaryTargets: (...a: unknown[]) => m.findTargets(...a),
}));
vi.mock("@/modules/attendance/services/student-subject-attendance-summary.service", () => ({
  recalculateStudentSubjectAttendanceSummary: (...a: unknown[]) => m.recalcSummary(...a),
}));
vi.mock("@/modules/attendance/services/attendance-academic-wiring.service", () => ({
  applyAttendanceAcademicImpact: (...a: unknown[]) => m.applyImpact(...a),
}));

import { RecalculateAttendanceAcademicImpactCommand } from "../recalculate-attendance-academic-impact.command";

const ctx = { userId: "u1", organizationId: "org-1" };

beforeEach(() => {
  vi.clearAllMocks();
  authState.can = true;
  m.findTargets.mockResolvedValue([
    { enrollmentId: "e1", levelSubjectId: "ls1" },
    { enrollmentId: "e2", levelSubjectId: "ls1" },
  ]);
  m.recalcSummary.mockResolvedValue({ changed: true });
  m.applyImpact.mockResolvedValue({ changed: true, previousStatus: "PASSED", newStatus: "PASSED" });
});

describe("RecalculateAttendanceAcademicImpactCommand", () => {
  it("requires at least one scope filter", async () => {
    await expect(new RecalculateAttendanceAcademicImpactCommand({}, ctx).run()).rejects.toThrow();
  });

  it("17. denies a caller without the recalculate permission", async () => {
    authState.can = false;
    await expect(
      new RecalculateAttendanceAcademicImpactCommand({ academicYearId: "ay1" }, ctx).run()
    ).rejects.toThrow();
  });

  it("passes the scope filters to the target finder", async () => {
    await new RecalculateAttendanceAcademicImpactCommand(
      { academicYearId: "ay1", classGroupId: "cg1" },
      ctx
    ).run();
    expect(m.findTargets).toHaveBeenCalledWith("org-1", {
      enrollmentId: undefined,
      levelSubjectId: undefined,
      classGroupId: "cg1",
      academicYearId: "ay1",
    });
  });

  it("15. recomputes the summary then applies impact for each target (real run)", async () => {
    m.applyImpact
      .mockResolvedValueOnce({ changed: true, previousStatus: "PASSED", newStatus: "INCOMPLETE" })
      .mockResolvedValueOnce({ changed: false, previousStatus: "PASSED", newStatus: "PASSED" });

    const res = await new RecalculateAttendanceAcademicImpactCommand({ academicYearId: "ay1" }, ctx).run();

    expect(m.recalcSummary).toHaveBeenCalledTimes(2);
    // summary recompute must NOT double-wire (applyAcademicImpact:false)
    expect(m.recalcSummary.mock.calls[0][2]).toEqual({ applyAcademicImpact: false });
    expect(res).toMatchObject({ targets: 2, changed: 1, markedIncomplete: 1, failed: 0, dryRun: false });
    expect(m.auditLog).toHaveBeenCalledTimes(1);
  });

  it("16. dryRun does not recompute summaries, does not audit, forwards dryRun", async () => {
    m.applyImpact.mockResolvedValue({ changed: false, previousStatus: "PASSED", newStatus: "PASSED" });

    const res = await new RecalculateAttendanceAcademicImpactCommand({ academicYearId: "ay1", dryRun: true }, ctx).run();

    expect(res.dryRun).toBe(true);
    expect(m.recalcSummary).not.toHaveBeenCalled();
    expect(m.applyImpact.mock.calls[0][2]).toEqual({ dryRun: true });
    expect(m.auditLog).not.toHaveBeenCalled();
  });

  it("counts recovered-from-incomplete transitions", async () => {
    m.applyImpact.mockResolvedValue({ changed: true, previousStatus: "INCOMPLETE", newStatus: "PASSED" });
    const res = await new RecalculateAttendanceAcademicImpactCommand({ enrollmentId: "e1", levelSubjectId: "ls1" }, ctx).run();
    expect(res.recoveredFromIncomplete).toBe(1);
    expect(res.targets).toBe(1); // single explicit target skips the finder
    expect(m.findTargets).not.toHaveBeenCalled();
  });

  it("counts a failed target without aborting the sweep", async () => {
    m.applyImpact.mockRejectedValueOnce(new Error("boom")).mockResolvedValueOnce({ changed: true, previousStatus: "PASSED", newStatus: "PASSED" });
    const res = await new RecalculateAttendanceAcademicImpactCommand({ academicYearId: "ay1" }, ctx).run();
    expect(res.failed).toBe(1);
    expect(res.changed).toBe(1);
  });
});
