import { describe, it, expect, vi, beforeEach } from "vitest";

// =============================================================================
// Approve / Reject justification commands — Fix H2 (end-to-end).
//
// The core guarantee: reviewing a justification (approve OR reject) updates ONLY
// the AttendanceJustification. It NEVER mutates the factual AttendanceRecord
// (status / minutesAttended / lateMinutes). The approved excuse is picked up by
// the calc-record queries via `hasApprovedJustification` and interpreted by the
// weighting engine — the record keeps its real LATE/ABSENT status.
//
// I/O is faked; the assertions verify the command WIRES the justification-only
// write + the summary/period recalc triggers, and that NO attendance-record
// mutation is ever attempted.
// =============================================================================

const authState = vi.hoisted(() => ({ can: true }));
const m = vi.hoisted(() => ({
  findJustification: vi.fn(),
  updateJustification: vi.fn(),
  auditLog: vi.fn(),
  publish: vi.fn(),
  triggerSubject: vi.fn(),
  triggerPeriod: vi.fn(),
  // A spy standing in for ANY attendance-record write. If a command ever touches
  // the record again this fires and the "does not mutate the record" tests fail.
  recordUpdate: vi.fn(),
}));

vi.mock("@/server/auth/rbac", () => ({
  getUserPermissions: vi.fn().mockResolvedValue([]),
  createAbility: () => ({ can: () => authState.can }),
}));
vi.mock("@/server/auth/permissions", () => ({
  PERMISSIONS: {
    ATTENDANCE_JUSTIFICATIONS_APPROVE: "attendance.justifications.approve",
    ATTENDANCE_JUSTIFICATIONS_REJECT: "attendance.justifications.reject",
  },
}));
vi.mock("@/modules/audit-logs/services/audit.service", () => ({
  auditService: { log: (...a: unknown[]) => m.auditLog(...a) },
}));
vi.mock("@/server/events/event-publisher", () => ({
  eventPublisher: { publish: (...a: unknown[]) => m.publish(...a) },
}));
vi.mock("@/server/events/event-types", () => ({
  DomainEventType: {
    ATTENDANCE_JUSTIFICATION_APPROVED: "attendance.justification_approved",
    ATTENDANCE_JUSTIFICATION_REJECTED: "attendance.justification_rejected",
  },
  DomainAggregateType: { ATTENDANCE_JUSTIFICATION: "AttendanceJustification" },
}));
vi.mock("@/modules/attendance/repositories/attendance-justification.repository", () => ({
  findJustificationById: (...a: unknown[]) => m.findJustification(...a),
  updateJustificationStatus: (...a: unknown[]) => m.updateJustification(...a),
}));
vi.mock("@/modules/attendance/services/student-subject-attendance-summary.service", () => ({
  triggerAttendanceSummaryRecalcForRecord: (...a: unknown[]) => m.triggerSubject(...a),
}));
vi.mock("@/modules/attendance/services/student-period-attendance-summary.service", () => ({
  triggerPeriodSummaryRecalcForRecord: (...a: unknown[]) => m.triggerPeriod(...a),
}));
// If any command re-introduces a direct DB record mutation, this spy makes it
// visible: `attendanceRecord.update*` calls are routed to `m.recordUpdate`.
vi.mock("@/server/db", () => ({
  getDb: async () => ({
    attendanceRecord: {
      update: (...a: unknown[]) => m.recordUpdate(...a),
      updateMany: (...a: unknown[]) => m.recordUpdate(...a),
    },
    $transaction: async (cb: (tx: unknown) => Promise<unknown>) =>
      cb({
        attendanceRecord: {
          update: (...a: unknown[]) => m.recordUpdate(...a),
          updateMany: (...a: unknown[]) => m.recordUpdate(...a),
        },
        attendanceJustification: { update: (...a: unknown[]) => m.updateJustification(...a) },
      }),
  }),
}));

import { ApproveAttendanceJustificationCommand } from "../approve-attendance-justification.command";
import { RejectAttendanceJustificationCommand } from "../reject-attendance-justification.command";

const ctx = { userId: "reviewer-1", organizationId: "org-A" };
const REC = "rec-1";

function pendingJustification(overrides: Record<string, unknown> = {}) {
  return {
    id: "just-1",
    organizationId: "org-A",
    attendanceRecordId: REC,
    studentId: "stu-1",
    reason: "Consulta médica",
    attachmentUrl: null,
    status: "PENDING",
    reviewedByUserId: null,
    reviewedAt: null,
    reviewNotes: null,
    createdAt: new Date("2026-05-01"),
    updatedAt: new Date("2026-05-01"),
    deletedAt: null,
    student: { id: "stu-1", firstName: "Ana", lastName: "Silva" },
    attendanceRecord: { id: REC, status: "LATE", attendanceSession: { id: "s1" } },
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  authState.can = true;
  m.findJustification.mockResolvedValue(pendingJustification());
});

describe("ApproveAttendanceJustificationCommand — never mutates the attendance record", () => {
  beforeEach(() => {
    // updateJustificationStatus echoes an APPROVED justification, record status intact.
    m.updateJustification.mockResolvedValue(
      pendingJustification({ status: "APPROVED", reviewedByUserId: ctx.userId, reviewNotes: "ok" })
    );
  });

  it("updates ONLY the justification to APPROVED (record status/minutes untouched)", async () => {
    await new ApproveAttendanceJustificationCommand(
      { justificationId: "just-1", reviewNotes: "ok" },
      ctx
    ).run();

    // Justification write happened with APPROVED + reviewer.
    expect(m.updateJustification).toHaveBeenCalledWith(
      "just-1",
      "org-A",
      expect.objectContaining({ status: "APPROVED", reviewedByUserId: ctx.userId })
    );
    // The factual record is NEVER mutated.
    expect(m.recordUpdate).not.toHaveBeenCalled();
  });

  it("does NOT write status EXCUSED and does NOT zero minutesAttended anywhere", async () => {
    await new ApproveAttendanceJustificationCommand({ justificationId: "just-1" }, ctx).run();

    // No record mutation at all — so certainly no EXCUSED / 0-minutes overwrite.
    expect(m.recordUpdate).not.toHaveBeenCalled();
    // And the only status the command ever writes is on the justification: APPROVED.
    for (const call of m.updateJustification.mock.calls) {
      expect(call[2].status).toBe("APPROVED");
      expect(call[2]).not.toHaveProperty("minutesAttended");
    }
  });

  it("audits the review with the preserved record status and previous justification status", async () => {
    await new ApproveAttendanceJustificationCommand({ justificationId: "just-1" }, ctx).run();

    expect(m.auditLog).toHaveBeenCalledTimes(1);
    const entry = m.auditLog.mock.calls[0][1];
    expect(entry).toMatchObject({ action: "attendance_justification.approved" });
    expect(entry.oldValues).toMatchObject({ status: "PENDING" });
    expect(entry.newValues).toMatchObject({
      status: "APPROVED",
      attendanceRecordStatusPreserved: "LATE", // record kept its real status
    });
  });

  it("triggers subject + period summary recalculation for the record", async () => {
    await new ApproveAttendanceJustificationCommand({ justificationId: "just-1" }, ctx).run();
    expect(m.triggerSubject).toHaveBeenCalledWith(ctx, REC);
    expect(m.triggerPeriod).toHaveBeenCalledWith(ctx, REC);
  });

  it("publishes the justification-approved event", async () => {
    await new ApproveAttendanceJustificationCommand({ justificationId: "just-1" }, ctx).run();
    const types = m.publish.mock.calls.map((c) => c[0].eventType);
    expect(types).toContain("attendance.justification_approved");
  });

  it("denies a caller without the approve permission", async () => {
    authState.can = false;
    await expect(
      new ApproveAttendanceJustificationCommand({ justificationId: "just-1" }, ctx).run()
    ).rejects.toThrow();
    expect(m.updateJustification).not.toHaveBeenCalled();
  });

  it("rejects approving a non-PENDING justification", async () => {
    m.findJustification.mockResolvedValue(pendingJustification({ status: "APPROVED" }));
    await expect(
      new ApproveAttendanceJustificationCommand({ justificationId: "just-1" }, ctx).run()
    ).rejects.toThrow();
    expect(m.updateJustification).not.toHaveBeenCalled();
  });
});

describe("RejectAttendanceJustificationCommand — never mutates the attendance record", () => {
  beforeEach(() => {
    m.updateJustification.mockResolvedValue(
      pendingJustification({ status: "REJECTED", reviewedByUserId: ctx.userId, reviewNotes: "Documento insuficiente" })
    );
  });

  it("updates ONLY the justification to REJECTED (record untouched)", async () => {
    await new RejectAttendanceJustificationCommand(
      { justificationId: "just-1", reviewNotes: "Documento insuficiente" },
      ctx
    ).run();

    expect(m.updateJustification).toHaveBeenCalledWith(
      "just-1",
      "org-A",
      expect.objectContaining({ status: "REJECTED", reviewedByUserId: ctx.userId })
    );
    expect(m.recordUpdate).not.toHaveBeenCalled();
  });

  it("triggers summary recalculation so a removed excuse is reflected", async () => {
    await new RejectAttendanceJustificationCommand({ justificationId: "just-1", reviewNotes: "Documento insuficiente" }, ctx).run();
    expect(m.triggerSubject).toHaveBeenCalledWith(ctx, REC);
    expect(m.triggerPeriod).toHaveBeenCalledWith(ctx, REC);
  });
});
