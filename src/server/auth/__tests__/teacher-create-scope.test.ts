import { describe, it, expect, vi, beforeEach } from "vitest";
import { SYSTEM_ROLES } from "@/server/auth/permissions";
import { AuthorizationError } from "@/shared/lib/command";

// Create/retake/recalc commands enforce teacher ownership in authorize(). The
// ownership query itself is unit-tested in teacher-access.test.ts; here we prove
// each command's authorize() is WIRED to it (and uses the server-resolved
// teacherId, never the client-supplied input.teacherId).

const { mockGetTeacher, db, findRetakeById } = vi.hoisted(() => ({
  mockGetTeacher: vi.fn(),
  findRetakeById: vi.fn(),
  db: {
    classGroup: { findFirst: vi.fn() },
    assessment: { findFirst: vi.fn() },
    enrollment: { findFirst: vi.fn() },
  },
}));

vi.mock("@/server/auth/rbac", () => ({
  getUserPermissions: vi.fn().mockResolvedValue([]),
  createAbility: () => ({ can: () => true }), // permission gate always passes; ownership is under test
}));
vi.mock("@/modules/teachers/services/teacher.service", () => ({ getTeacherByUserId: mockGetTeacher }));
vi.mock("@/server/db", () => ({ getDb: vi.fn(async () => db) }));
vi.mock("@/modules/assessments/repositories/assessment-retake.repository", () => ({
  findRetakeById,
  updateAssessmentRetake: vi.fn(),
}));

import { CreateAssessmentCommand } from "@/modules/assessments/commands/create-assessment.command";
import { CreateAttendanceSessionCommand } from "@/modules/attendance/commands/create-attendance-session.command";
import { CreateAssessmentRetakeCommand } from "@/modules/assessments/commands/create-assessment-retake.command";
import { GradeAssessmentRetakeCommand } from "@/modules/assessments/commands/grade-assessment-retake.command";
import { RecalculateStudentSubjectProgressCommand } from "@/modules/assessments/commands/recalculate-student-subject-progress.command";

const ORG = "org-1";
function ctx(roles: string[]) {
  return { userId: "user-1", organizationId: ORG, roles } as never;
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const input = (o: Record<string, unknown>) => o as any;

beforeEach(() => {
  vi.clearAllMocks();
  mockGetTeacher.mockResolvedValue({ id: "teacher-A" });
});

// ── create-assessment ────────────────────────────────────────────────────────

describe("CreateAssessmentCommand.authorize — create-time class-group scope", () => {
  it("ORG_ADMIN may create for any class group (no ownership query)", async () => {
    await new CreateAssessmentCommand(input({ classGroupId: "cg-B" }), ctx([SYSTEM_ROLES.ORG_ADMIN])).authorize();
    expect(mockGetTeacher).not.toHaveBeenCalled();
    expect(db.classGroup.findFirst).not.toHaveBeenCalled();
  });

  it("Teacher A may create for their own class group (A)", async () => {
    db.classGroup.findFirst.mockResolvedValue({ id: "cg-A" });
    await expect(
      new CreateAssessmentCommand(input({ classGroupId: "cg-A" }), ctx([SYSTEM_ROLES.TEACHER])).authorize()
    ).resolves.toBeUndefined();
  });

  it("Teacher A may NOT create for another teacher's class group (B)", async () => {
    db.classGroup.findFirst.mockResolvedValue(null);
    await expect(
      new CreateAssessmentCommand(input({ classGroupId: "cg-B" }), ctx([SYSTEM_ROLES.TEACHER])).authorize()
    ).rejects.toBeInstanceOf(AuthorizationError);
  });

  it("uses the server-resolved teacherId — a client-supplied input.teacherId cannot widen scope", async () => {
    db.classGroup.findFirst.mockResolvedValue({ id: "cg-A" });
    await new CreateAssessmentCommand(
      input({ classGroupId: "cg-A", teacherId: "teacher-B" }),
      ctx([SYSTEM_ROLES.TEACHER])
    ).authorize();
    // ownership query is bound to teacher-A (resolved), never the input "teacher-B"
    expect(db.classGroup.findFirst.mock.calls[0][0].where).toMatchObject({
      id: "cg-A",
      organizationId: ORG,
      teacherId: "teacher-A",
    });
  });
});

// ── create-attendance-session ────────────────────────────────────────────────

describe("CreateAttendanceSessionCommand.authorize — create-time class-group scope", () => {
  it("ORG_ADMIN may create for any class group", async () => {
    await new CreateAttendanceSessionCommand(input({ classGroupId: "cg-B" }), ctx([SYSTEM_ROLES.ORG_ADMIN])).authorize();
    expect(db.classGroup.findFirst).not.toHaveBeenCalled();
  });

  it("Teacher A may create for class group A", async () => {
    db.classGroup.findFirst.mockResolvedValue({ id: "cg-A" });
    await expect(
      new CreateAttendanceSessionCommand(input({ classGroupId: "cg-A" }), ctx([SYSTEM_ROLES.TEACHER])).authorize()
    ).resolves.toBeUndefined();
  });

  it("Teacher A may NOT create for class group B", async () => {
    db.classGroup.findFirst.mockResolvedValue(null);
    await expect(
      new CreateAttendanceSessionCommand(input({ classGroupId: "cg-B" }), ctx([SYSTEM_ROLES.TEACHER])).authorize()
    ).rejects.toBeInstanceOf(AuthorizationError);
  });
});

// ── retake create / grade ────────────────────────────────────────────────────

describe("retake commands enforce assessment ownership", () => {
  it("Teacher A cannot create a retake on Teacher B's assessment", async () => {
    db.assessment.findFirst.mockResolvedValue(null);
    await expect(
      new CreateAssessmentRetakeCommand(input({ assessmentId: "as-B" }), ctx([SYSTEM_ROLES.TEACHER])).authorize()
    ).rejects.toBeInstanceOf(AuthorizationError);
  });

  it("Teacher A cannot grade a retake of Teacher B's assessment", async () => {
    findRetakeById.mockResolvedValue({ id: "rt-1", assessmentId: "as-B" });
    db.assessment.findFirst.mockResolvedValue(null);
    await expect(
      new GradeAssessmentRetakeCommand(input({ retakeId: "rt-1" }), ctx([SYSTEM_ROLES.TEACHER])).authorize()
    ).rejects.toBeInstanceOf(AuthorizationError);
  });

  it("Teacher A may grade a retake of their own assessment", async () => {
    findRetakeById.mockResolvedValue({ id: "rt-2", assessmentId: "as-A" });
    db.assessment.findFirst.mockResolvedValue({ id: "as-A" });
    await expect(
      new GradeAssessmentRetakeCommand(input({ retakeId: "rt-2" }), ctx([SYSTEM_ROLES.TEACHER])).authorize()
    ).resolves.toBeUndefined();
  });
});

// ── progress recalc ──────────────────────────────────────────────────────────

describe("RecalculateStudentSubjectProgressCommand enforces enrollment ownership", () => {
  it("Teacher A cannot recalc progress for an enrollment in Teacher B's class group", async () => {
    db.enrollment.findFirst.mockResolvedValue(null);
    await expect(
      new RecalculateStudentSubjectProgressCommand(
        input({ studentId: "s", enrollmentId: "enr-B", levelSubjectId: "ls" }),
        ctx([SYSTEM_ROLES.TEACHER])
      ).authorize()
    ).rejects.toBeInstanceOf(AuthorizationError);
  });

  it("ORG_ADMIN may recalc any enrollment", async () => {
    await new RecalculateStudentSubjectProgressCommand(
      input({ studentId: "s", enrollmentId: "enr-B", levelSubjectId: "ls" }),
      ctx([SYSTEM_ROLES.ORG_ADMIN])
    ).authorize();
    expect(db.enrollment.findFirst).not.toHaveBeenCalled();
  });
});
