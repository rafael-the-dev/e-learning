import { describe, it, expect, vi, beforeEach } from "vitest";

// =============================================================================
// Attendance → academic wiring (Phase 5 §10 tests 7,8,12,14,16,17).
// The cascade + policy resolution are mocked; we verify the GATE, transitions,
// events/audit, dryRun and tenant isolation.
// =============================================================================

const m = vi.hoisted(() => ({
  enrollmentFindFirst: vi.fn(),
  levelSubjectFindFirst: vi.fn(),
  progressFindFirst: vi.fn(),
  loadPolicy: vi.fn(),
  cascade: vi.fn(),
  auditLog: vi.fn(),
  publish: vi.fn(),
}));

vi.mock("@/server/db", () => ({
  getDb: async () => ({
    enrollment: { findFirst: m.enrollmentFindFirst },
    levelSubject: { findFirst: m.levelSubjectFindFirst },
    studentSubjectProgress: { findFirst: m.progressFindFirst },
    $transaction: async (cb: (tx: unknown) => Promise<unknown>) => cb({}),
  }),
}));
vi.mock("@/modules/grades/services/subject-progress-cascade.service", () => ({
  recalculateSubjectProgressCascade: (...a: unknown[]) => m.cascade(...a),
}));
vi.mock("@/modules/attendance/services/attendance-policy.resolver", () => ({
  loadEffectiveAttendancePolicy: (...a: unknown[]) => m.loadPolicy(...a),
}));
vi.mock("@/modules/audit-logs/services/audit.service", () => ({ auditService: { log: (...a: unknown[]) => m.auditLog(...a) } }));
vi.mock("@/server/events/event-publisher", () => ({ eventPublisher: { publish: (...a: unknown[]) => m.publish(...a) } }));

import { applyAttendanceAcademicImpact } from "../attendance-academic-wiring.service";

const ctx = { userId: "u1", organizationId: "org-1" };
const input = { enrollmentId: "e1", levelSubjectId: "ls1" };
const eventTypes = () => m.publish.mock.calls.map((c) => c[0].eventType);

beforeEach(() => {
  vi.clearAllMocks();
  m.enrollmentFindFirst.mockResolvedValue({ studentId: "s1" });
  m.levelSubjectFindFirst.mockResolvedValue({ attendancePolicyId: "ap1" });
  m.loadPolicy.mockResolvedValue({ enforceAttendanceForProgress: true, policyId: "ap1" });
  m.progressFindFirst.mockResolvedValue({ status: "PASSED", attendancePercentage: 90 });
  m.cascade.mockResolvedValue({ id: "prog-1", status: "PASSED", attendancePercentage: 90 });
});

describe("applyAttendanceAcademicImpact", () => {
  it("no-ops when enforcement is off and there is no stale impact", async () => {
    m.loadPolicy.mockResolvedValue({ enforceAttendanceForProgress: false, policyId: "ap1" });
    m.progressFindFirst.mockResolvedValue({ status: "PASSED", attendancePercentage: null });

    const r = await applyAttendanceAcademicImpact(ctx, input);

    expect(r.ran).toBe(false);
    expect(m.cascade).not.toHaveBeenCalled();
  });

  it("runs (to clear) when enforcement off but a stale attendancePercentage lingers", async () => {
    m.loadPolicy.mockResolvedValue({ enforceAttendanceForProgress: false, policyId: "ap1" });
    m.progressFindFirst.mockResolvedValue({ status: "INCOMPLETE", attendancePercentage: 40 });
    m.cascade.mockResolvedValue({ id: "prog-1", status: "PASSED", attendancePercentage: null });

    const r = await applyAttendanceAcademicImpact(ctx, input);

    expect(r.ran).toBe(true);
    expect(m.cascade).toHaveBeenCalled();
    expect(r.newStatus).toBe("PASSED");
  });

  it("7. PASSED → INCOMPLETE emits subject_marked_incomplete + audit", async () => {
    m.progressFindFirst.mockResolvedValue({ status: "PASSED", attendancePercentage: 90 });
    m.cascade.mockResolvedValue({ id: "prog-1", status: "INCOMPLETE", attendancePercentage: 40 });

    const r = await applyAttendanceAcademicImpact(ctx, input);

    expect(r.newStatus).toBe("INCOMPLETE");
    expect(eventTypes()).toContain("attendance.subject_marked_incomplete");
    expect(eventTypes()).toContain("attendance.academic_impact_applied");
    const actions = m.auditLog.mock.calls.map((c) => c[1].action);
    expect(actions).toContain("student_subject_progress.marked_incomplete");
  });

  it("8. INCOMPLETE → PASSED emits subject_recovered_from_incomplete", async () => {
    m.progressFindFirst.mockResolvedValue({ status: "INCOMPLETE", attendancePercentage: 40 });
    m.cascade.mockResolvedValue({ id: "prog-1", status: "PASSED", attendancePercentage: 95 });

    const r = await applyAttendanceAcademicImpact(ctx, input);

    expect(r.newStatus).toBe("PASSED");
    expect(eventTypes()).toContain("attendance.subject_recovered_from_incomplete");
  });

  it("12. no event when the status/percentage did not change", async () => {
    m.progressFindFirst.mockResolvedValue({ status: "PASSED", attendancePercentage: 90 });
    m.cascade.mockResolvedValue({ id: "prog-1", status: "PASSED", attendancePercentage: 90 });

    const r = await applyAttendanceAcademicImpact(ctx, input);

    expect(r.changed).toBe(false);
    expect(m.publish).not.toHaveBeenCalled();
  });

  it("14/16. dryRun runs the cascade but persists nothing and emits no events", async () => {
    m.progressFindFirst.mockResolvedValue({ status: "PASSED", attendancePercentage: 90 });
    m.cascade.mockResolvedValue({ id: "prog-1", status: "INCOMPLETE", attendancePercentage: 40 });

    const r = await applyAttendanceAcademicImpact(ctx, input, { dryRun: true });

    expect(r.dryRun).toBe(true);
    expect(r.newStatus).toBe("INCOMPLETE"); // preview
    expect(m.cascade).toHaveBeenCalled();
    expect(m.publish).not.toHaveBeenCalled();
    expect(m.auditLog).not.toHaveBeenCalled();
  });

  it("17. tenant isolation — enrolment in another org is not found", async () => {
    m.enrollmentFindFirst.mockResolvedValue(null);
    await expect(applyAttendanceAcademicImpact(ctx, input)).rejects.toThrow();
    expect(m.cascade).not.toHaveBeenCalled();
  });
});
