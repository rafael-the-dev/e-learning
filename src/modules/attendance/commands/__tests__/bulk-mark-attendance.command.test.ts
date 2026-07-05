import { describe, it, expect, vi, beforeEach } from "vitest";
import type { BulkMarkAttendanceSchema } from "@/modules/attendance/schemas/attendance.schema";

// =============================================================================
// BulkMarkAttendanceCommand — Sprint B: enrollmentId is resolved SERVER-SIDE and
// a client-supplied value is never trusted or persisted (IDOR fix).
//
// The enrolment is matched by (studentId, session.classGroupId, organizationId,
// ACTIVE), exactly like MarkAttendanceCommand, so the persisted enrollmentId can
// only belong to that student, that class group's course/level context, and this
// tenant. These tests drive the real command over an in-memory enrolment store.
// =============================================================================

const authState = vi.hoisted(() => ({ can: true }));
const h = vi.hoisted(() => {
  interface Enr {
    id: string;
    studentId: string;
    classGroupId: string;
    organizationId: string;
    status: string;
    deletedAt: null;
  }
  const store: {
    enrollments: Enr[];
    session: { id: string; status: string; classGroupId: string; durationMinutes: number } | null;
  } = { enrollments: [], session: null };

  // Emulates the Prisma `where` used by both validate() and execute().
  const match = (e: Enr, where: Record<string, unknown>): boolean => {
    const sid = where.studentId as { in?: string[] } | string | undefined;
    const studentOk =
      sid && typeof sid === "object" && Array.isArray(sid.in)
        ? sid.in.includes(e.studentId)
        : e.studentId === sid;
    return (
      Boolean(studentOk) &&
      e.classGroupId === where.classGroupId &&
      e.organizationId === where.organizationId &&
      e.status === "ACTIVE" &&
      e.deletedAt === null
    );
  };
  return { store, match };
});

const m = vi.hoisted(() => ({
  upsert: vi.fn(),
  auditLog: vi.fn(),
  triggerSubjectSession: vi.fn(),
  triggerPeriodSession: vi.fn(),
  triggerSubjectRecord: vi.fn(),
  triggerPeriodRecord: vi.fn(),
  updateSession: vi.fn(),
  assertTeacher: vi.fn(),
}));

vi.mock("@/server/auth/rbac", () => ({
  getUserPermissions: vi.fn().mockResolvedValue([]),
  createAbility: () => ({ can: () => authState.can }),
}));
vi.mock("@/server/auth/permissions", () => ({
  PERMISSIONS: { ATTENDANCE_RECORDS_MARK: "attendance.records.mark" },
}));
vi.mock("@/server/auth/teacher-access", () => ({
  assertTeacherCanAccessAttendanceSession: (...a: unknown[]) => m.assertTeacher(...a),
}));
vi.mock("@/modules/audit-logs/services/audit.service", () => ({
  auditService: { log: (...a: unknown[]) => m.auditLog(...a) },
}));
vi.mock("@/server/db", () => ({
  getDb: async () => ({
    enrollment: {
      findMany: async ({ where }: { where: Record<string, unknown> }) =>
        h.store.enrollments.filter((e) => h.match(e, where)).map((e) => ({ id: e.id, studentId: e.studentId })),
      findFirst: async ({ where }: { where: Record<string, unknown> }) => {
        const hit = h.store.enrollments.find((e) => h.match(e, where));
        return hit ? { id: hit.id } : null;
      },
    },
  }),
}));
vi.mock("@/modules/attendance/repositories/attendance-session.repository", () => ({
  findAttendanceSessionById: async () => h.store.session,
  updateAttendanceSession: (...a: unknown[]) => m.updateSession(...a),
}));
vi.mock("@/modules/attendance/repositories/attendance-record.repository", () => ({
  upsertAttendanceRecord: (data: Record<string, unknown>) => {
    m.upsert(data);
    return { id: `rec-${data.studentId}`, ...data };
  },
}));
vi.mock("@/modules/attendance/services/student-subject-attendance-summary.service", () => ({
  triggerAttendanceSummaryRecalcForSession: (...a: unknown[]) => m.triggerSubjectSession(...a),
  triggerAttendanceSummaryRecalcForRecord: (...a: unknown[]) => m.triggerSubjectRecord(...a),
}));
vi.mock("@/modules/attendance/services/student-period-attendance-summary.service", () => ({
  triggerPeriodSummaryRecalcForSession: (...a: unknown[]) => m.triggerPeriodSession(...a),
  triggerPeriodSummaryRecalcForRecord: (...a: unknown[]) => m.triggerPeriodRecord(...a),
}));

import { BulkMarkAttendanceCommand } from "../bulk-mark-attendance.command";
import { MarkAttendanceCommand } from "../mark-attendance.command";

const ctx = { userId: "u1", organizationId: "org-1" };

/** Finds the enrollmentId the command persisted for a given studentId. */
function persistedEnrollmentId(studentId: string): unknown {
  const call = m.upsert.mock.calls.find((c) => c[0].studentId === studentId);
  return call?.[0].enrollmentId;
}

beforeEach(() => {
  vi.clearAllMocks();
  authState.can = true;
  h.store.session = { id: "sess-1", status: "OPEN", classGroupId: "cg-1", durationMinutes: 60 };
  h.store.enrollments = [
    { id: "enr-A", studentId: "stu-A", classGroupId: "cg-1", organizationId: "org-1", status: "ACTIVE", deletedAt: null },
    { id: "enr-B", studentId: "stu-B", classGroupId: "cg-1", organizationId: "org-1", status: "ACTIVE", deletedAt: null },
  ];
});

describe("BulkMarkAttendanceCommand — server-side enrollment resolution", () => {
  it("1. resolves each student's enrolment server-side", async () => {
    await new BulkMarkAttendanceCommand(
      { sessionId: "sess-1", records: [{ studentId: "stu-A", status: "PRESENT" }] },
      ctx
    ).run();

    expect(persistedEnrollmentId("stu-A")).toBe("enr-A");
  });

  it("2. IGNORES a client-supplied enrollmentId belonging to another student", async () => {
    // Simulate a forged payload: a raw enrollmentId sneaks past the schema strip.
    const forged = {
      sessionId: "sess-1",
      records: [{ studentId: "stu-A", status: "PRESENT", enrollmentId: "enr-B" }],
    } as unknown as BulkMarkAttendanceSchema;

    await new BulkMarkAttendanceCommand(forged, ctx).run();

    // The record is attributed to stu-A's OWN enrolment, never the injected enr-B.
    expect(persistedEnrollmentId("stu-A")).toBe("enr-A");
    expect(persistedEnrollmentId("stu-A")).not.toBe("enr-B");
  });

  it("3. IGNORES a cross-tenant enrollmentId", async () => {
    const forged = {
      sessionId: "sess-1",
      records: [{ studentId: "stu-A", status: "PRESENT", enrollmentId: "enr-OTHER-ORG" }],
    } as unknown as BulkMarkAttendanceSchema;

    await new BulkMarkAttendanceCommand(forged, ctx).run();

    expect(persistedEnrollmentId("stu-A")).toBe("enr-A");
  });

  it("4. rejects a student not enrolled in the session's class group", async () => {
    await expect(
      new BulkMarkAttendanceCommand(
        { sessionId: "sess-1", records: [{ studentId: "stu-X", status: "PRESENT" }] },
        ctx
      ).run()
    ).rejects.toThrow();
    expect(m.upsert).not.toHaveBeenCalled();
  });

  it("5. preserves existing valid behaviour (minutes, status, triggers, audit)", async () => {
    await new BulkMarkAttendanceCommand(
      {
        sessionId: "sess-1",
        records: [
          { studentId: "stu-A", status: "PRESENT" },
          { studentId: "stu-B", status: "LATE", lateMinutes: 15 },
        ],
      },
      ctx
    ).run();

    const a = m.upsert.mock.calls.find((c) => c[0].studentId === "stu-A")![0];
    const b = m.upsert.mock.calls.find((c) => c[0].studentId === "stu-B")![0];
    expect(a).toMatchObject({ enrollmentId: "enr-A", status: "PRESENT", minutesAttended: 60 });
    expect(b).toMatchObject({ enrollmentId: "enr-B", status: "LATE", minutesAttended: 45, lateMinutes: 15 });

    expect(m.auditLog).toHaveBeenCalledTimes(1);
    expect(m.triggerSubjectSession).toHaveBeenCalledWith(ctx, "sess-1");
    expect(m.triggerPeriodSession).toHaveBeenCalledWith(ctx, "sess-1");
  });

  it("denies a caller without the mark permission (before any write)", async () => {
    authState.can = false;
    await expect(
      new BulkMarkAttendanceCommand(
        { sessionId: "sess-1", records: [{ studentId: "stu-A", status: "PRESENT" }] },
        ctx
      ).run()
    ).rejects.toThrow();
    expect(m.upsert).not.toHaveBeenCalled();
  });
});

describe("6. single-mark and bulk-mark resolve enrollment consistently", () => {
  it("both attribute the same student to the same server-resolved enrolment", async () => {
    await new MarkAttendanceCommand({ sessionId: "sess-1", studentId: "stu-A", status: "PRESENT" }, ctx).run();
    const single = persistedEnrollmentId("stu-A");

    m.upsert.mockClear();

    await new BulkMarkAttendanceCommand(
      { sessionId: "sess-1", records: [{ studentId: "stu-A", status: "PRESENT" }] },
      ctx
    ).run();
    const bulk = persistedEnrollmentId("stu-A");

    expect(single).toBe("enr-A");
    expect(bulk).toBe("enr-A");
    expect(single).toBe(bulk);
  });
});
