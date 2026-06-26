import { describe, it, expect, vi, beforeEach } from "vitest";
import { SYSTEM_ROLES } from "@/server/auth/permissions";

// Proves the create commands' execute() stamps the assigned teacherId via
// resolveAssignedTeacherId: forced to self for teachers, kept for admins. The
// helper's logic is unit-tested in teacher-access.test.ts; this asserts wiring.

const { mockGetTeacher, createAssessment, createAttendanceSession } = vi.hoisted(() => ({
  mockGetTeacher: vi.fn(),
  createAssessment: vi.fn(),
  createAttendanceSession: vi.fn(),
}));

vi.mock("@/modules/teachers/services/teacher.service", () => ({ getTeacherByUserId: mockGetTeacher }));
vi.mock("@/modules/audit-logs/services/audit.service", () => ({ auditService: { log: vi.fn() } }));
vi.mock("@/server/db", () => ({ getDb: vi.fn(async () => ({})) }));
vi.mock("@/modules/assessments/repositories/assessment.repository", () => ({ createAssessment }));
vi.mock("@/modules/attendance/repositories/attendance-session.repository", () => ({ createAttendanceSession }));

import { CreateAssessmentCommand } from "@/modules/assessments/commands/create-assessment.command";
import { CreateAttendanceSessionCommand } from "@/modules/attendance/commands/create-attendance-session.command";

const ORG = "org-1";
function ctx(roles: string[]) {
  return { userId: "user-1", organizationId: ORG, roles } as never;
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const input = (o: Record<string, unknown>) => o as any;

const assessmentInput = (teacherId?: string) =>
  input({
    assessmentPolicyId: "p", assessmentComponentId: "c", assessmentPeriodId: "per",
    academicYearId: "ay", academicTermId: null, classGroupId: "cg-A", courseId: "co",
    courseLevelId: "cl", levelSubjectId: "ls", subjectId: "su",
    title: "T", description: null, assessmentDate: "2026-01-01", maxScore: 20,
    ...(teacherId !== undefined && { teacherId }),
  });

const sessionInput = (teacherId?: string) =>
  input({
    academicYearId: "ay", academicTermId: null, classGroupId: "cg-A", courseId: "co",
    courseLevelId: "cl", subjectId: "su", levelSubjectId: "ls",
    classroomId: null, scheduleSlotId: null, sessionDate: "2026-01-01",
    startTime: "08:00", endTime: "09:00", title: null, notes: null,
    ...(teacherId !== undefined && { teacherId }),
  });

beforeEach(() => {
  vi.clearAllMocks();
  mockGetTeacher.mockResolvedValue({ id: "teacher-A" });
  createAssessment.mockResolvedValue({ id: "as-1", title: "T", classGroupId: "cg-A", levelSubjectId: "ls", assessmentDate: new Date(), maxScore: 20 });
  createAttendanceSession.mockResolvedValue({ id: "se-1", classGroupId: "cg-A", subjectId: "su", sessionDate: new Date(), status: "DRAFT" });
});

describe("CreateAssessmentCommand.execute — assigned teacher", () => {
  it("forces teacherId to self for a teacher, ignoring a client-supplied teacher (B → A)", async () => {
    await new CreateAssessmentCommand(assessmentInput("teacher-B"), ctx([SYSTEM_ROLES.TEACHER])).execute();
    expect(createAssessment.mock.calls[0][0].teacherId).toBe("teacher-A");
  });

  it("stamps self even when no teacherId is supplied", async () => {
    await new CreateAssessmentCommand(assessmentInput(undefined), ctx([SYSTEM_ROLES.TEACHER])).execute();
    expect(createAssessment.mock.calls[0][0].teacherId).toBe("teacher-A");
  });

  it("ORG_ADMIN may assign another teacher (B stays B)", async () => {
    await new CreateAssessmentCommand(assessmentInput("teacher-B"), ctx([SYSTEM_ROLES.ORG_ADMIN])).execute();
    expect(createAssessment.mock.calls[0][0].teacherId).toBe("teacher-B");
    expect(mockGetTeacher).not.toHaveBeenCalled();
  });
});

describe("CreateAttendanceSessionCommand.execute — assigned teacher", () => {
  it("forces teacherId to self for a teacher (B → A)", async () => {
    await new CreateAttendanceSessionCommand(sessionInput("teacher-B"), ctx([SYSTEM_ROLES.TEACHER])).execute();
    expect(createAttendanceSession.mock.calls[0][0].teacherId).toBe("teacher-A");
  });

  it("ORG_ADMIN may assign another teacher (B stays B)", async () => {
    await new CreateAttendanceSessionCommand(sessionInput("teacher-B"), ctx([SYSTEM_ROLES.ORG_ADMIN])).execute();
    expect(createAttendanceSession.mock.calls[0][0].teacherId).toBe("teacher-B");
  });
});
