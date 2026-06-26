import { describe, it, expect, vi, beforeEach } from "vitest";
import { SYSTEM_ROLES } from "@/server/auth/permissions";
import { AuthorizationError } from "@/shared/lib/command";

const { mockGetTeacherByUserId, db } = vi.hoisted(() => ({
  mockGetTeacherByUserId: vi.fn(),
  db: {
    enrollment: { findFirst: vi.fn() },
    classGroup: { findFirst: vi.fn() },
    attendanceSession: { findFirst: vi.fn() },
    assessment: { findFirst: vi.fn() },
  },
}));

vi.mock("@/modules/teachers/services/teacher.service", () => ({
  getTeacherByUserId: mockGetTeacherByUserId,
}));
vi.mock("@/server/db", () => ({ getDb: vi.fn(async () => db) }));

import {
  assertTeacherCanAccessStudent,
  assertTeacherCanAccessClassGroup,
  assertTeacherCanAccessAttendanceSession,
  assertTeacherCanAccessAssessment,
  assertTeacherCanAccessEnrollment,
} from "../teacher-access";

const ORG = "org-1";

function ctx(roles: string[], userId = "user-1") {
  return { userId, organizationId: ORG, roles, ability: {} as never } as never;
}

beforeEach(() => {
  vi.clearAllMocks();
  // Teacher-A is the logged-in teacher for the teacher-scoped cases.
  mockGetTeacherByUserId.mockResolvedValue({ id: "teacher-A" });
});

// ── No-op for non-teacher-scoped callers ─────────────────────────────────────

describe("ownership guards are a no-op for non-teacher-scoped callers", () => {
  it("ORG_ADMIN may access any record without a teacher lookup or ownership query", async () => {
    await expect(assertTeacherCanAccessStudent(ctx([SYSTEM_ROLES.ORG_ADMIN]), "any")).resolves.toBeUndefined();
    await expect(assertTeacherCanAccessClassGroup(ctx([SYSTEM_ROLES.ORG_ADMIN]), "any")).resolves.toBeUndefined();
    await expect(assertTeacherCanAccessAttendanceSession(ctx([SYSTEM_ROLES.ORG_ADMIN]), "any")).resolves.toBeUndefined();
    await expect(assertTeacherCanAccessAssessment(ctx([SYSTEM_ROLES.ORG_ADMIN]), "any")).resolves.toBeUndefined();
    await expect(assertTeacherCanAccessEnrollment(ctx([SYSTEM_ROLES.ORG_ADMIN]), "any")).resolves.toBeUndefined();
    expect(mockGetTeacherByUserId).not.toHaveBeenCalled();
    expect(db.enrollment.findFirst).not.toHaveBeenCalled();
    expect(db.classGroup.findFirst).not.toHaveBeenCalled();
  });

  it("SECRETARY and SUPER_ADMIN are not teacher-scoped", async () => {
    await expect(assertTeacherCanAccessStudent(ctx([SYSTEM_ROLES.SECRETARY]), "any")).resolves.toBeUndefined();
    await expect(assertTeacherCanAccessStudent(ctx([SYSTEM_ROLES.SUPER_ADMIN]), "any")).resolves.toBeUndefined();
  });
});

// ── Unlinked teacher owns nothing ────────────────────────────────────────────

describe("a teacher-scoped account with no linked profile owns nothing", () => {
  it("throws for every guard", async () => {
    mockGetTeacherByUserId.mockResolvedValue(null);
    await expect(assertTeacherCanAccessStudent(ctx([SYSTEM_ROLES.TEACHER]), "s")).rejects.toBeInstanceOf(AuthorizationError);
    await expect(assertTeacherCanAccessClassGroup(ctx([SYSTEM_ROLES.TEACHER]), "c")).rejects.toBeInstanceOf(AuthorizationError);
    await expect(assertTeacherCanAccessAttendanceSession(ctx([SYSTEM_ROLES.TEACHER]), "x")).rejects.toBeInstanceOf(AuthorizationError);
    expect(db.enrollment.findFirst).not.toHaveBeenCalled();
  });
});

// ── Student ownership ────────────────────────────────────────────────────────

describe("assertTeacherCanAccessStudent", () => {
  it("allows Teacher A to access their own student (A)", async () => {
    db.enrollment.findFirst.mockResolvedValue({ id: "enr-1" });
    await expect(assertTeacherCanAccessStudent(ctx([SYSTEM_ROLES.TEACHER]), "student-A")).resolves.toBeUndefined();
    // Scoped to teacher-A's class groups — never another teacher.
    const where = db.enrollment.findFirst.mock.calls[0][0].where;
    expect(where).toMatchObject({ studentId: "student-A", organizationId: ORG, classGroup: { teacherId: "teacher-A" } });
  });

  it("blocks Teacher A from accessing another teacher's student (B)", async () => {
    db.enrollment.findFirst.mockResolvedValue(null);
    await expect(assertTeacherCanAccessStudent(ctx([SYSTEM_ROLES.TEACHER]), "student-B")).rejects.toBeInstanceOf(AuthorizationError);
  });
});

// ── Class group ownership ────────────────────────────────────────────────────

describe("assertTeacherCanAccessClassGroup", () => {
  it("allows Teacher A to access class group A", async () => {
    db.classGroup.findFirst.mockResolvedValue({ id: "cg-A" });
    await expect(assertTeacherCanAccessClassGroup(ctx([SYSTEM_ROLES.TEACHER]), "cg-A")).resolves.toBeUndefined();
    const where = db.classGroup.findFirst.mock.calls[0][0].where;
    expect(where).toMatchObject({ id: "cg-A", organizationId: ORG, teacherId: "teacher-A" });
  });

  it("blocks Teacher A from class group B (not theirs)", async () => {
    db.classGroup.findFirst.mockResolvedValue(null);
    await expect(assertTeacherCanAccessClassGroup(ctx([SYSTEM_ROLES.TEACHER]), "cg-B")).rejects.toBeInstanceOf(AuthorizationError);
  });
});

// ── Attendance session ownership (with classGroup fallback) ──────────────────

describe("assertTeacherCanAccessAttendanceSession", () => {
  it("allows access to session A and scopes via teacherId OR classGroup.teacherId", async () => {
    db.attendanceSession.findFirst.mockResolvedValue({ id: "sess-A" });
    await expect(assertTeacherCanAccessAttendanceSession(ctx([SYSTEM_ROLES.TEACHER]), "sess-A")).resolves.toBeUndefined();
    const where = db.attendanceSession.findFirst.mock.calls[0][0].where;
    expect(where.OR).toEqual([{ teacherId: "teacher-A" }, { classGroup: { teacherId: "teacher-A" } }]);
  });

  it("blocks Teacher A from session B (neither assigned nor in their class group)", async () => {
    db.attendanceSession.findFirst.mockResolvedValue(null);
    await expect(assertTeacherCanAccessAttendanceSession(ctx([SYSTEM_ROLES.TEACHER]), "sess-B")).rejects.toBeInstanceOf(AuthorizationError);
  });
});

// ── Assessment ownership (with classGroup fallback) ──────────────────────────

describe("assertTeacherCanAccessAssessment", () => {
  it("allows access to assessment A and scopes via teacherId OR classGroup.teacherId", async () => {
    db.assessment.findFirst.mockResolvedValue({ id: "as-A" });
    await expect(assertTeacherCanAccessAssessment(ctx([SYSTEM_ROLES.TEACHER]), "as-A")).resolves.toBeUndefined();
    const where = db.assessment.findFirst.mock.calls[0][0].where;
    expect(where.OR).toEqual([{ teacherId: "teacher-A" }, { classGroup: { teacherId: "teacher-A" } }]);
  });

  it("blocks Teacher A from assessment B", async () => {
    db.assessment.findFirst.mockResolvedValue(null);
    await expect(assertTeacherCanAccessAssessment(ctx([SYSTEM_ROLES.TEACHER]), "as-B")).rejects.toBeInstanceOf(AuthorizationError);
  });
});

// ── Enrollment ownership ─────────────────────────────────────────────────────

describe("assertTeacherCanAccessEnrollment", () => {
  it("allows access to an enrollment in Teacher A's class group", async () => {
    db.enrollment.findFirst.mockResolvedValue({ id: "enr-A" });
    await expect(assertTeacherCanAccessEnrollment(ctx([SYSTEM_ROLES.TEACHER]), "enr-A")).resolves.toBeUndefined();
    const where = db.enrollment.findFirst.mock.calls[0][0].where;
    expect(where).toMatchObject({ id: "enr-A", organizationId: ORG, classGroup: { teacherId: "teacher-A" } });
  });

  it("blocks Teacher A from an enrollment in another teacher's class group", async () => {
    db.enrollment.findFirst.mockResolvedValue(null);
    await expect(assertTeacherCanAccessEnrollment(ctx([SYSTEM_ROLES.TEACHER]), "enr-B")).rejects.toBeInstanceOf(AuthorizationError);
  });
});
