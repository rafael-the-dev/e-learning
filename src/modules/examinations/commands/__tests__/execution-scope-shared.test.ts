import { describe, it, expect, vi, beforeEach } from "vitest";
import { AuthorizationError } from "@/shared/lib/command";
import { PERMISSIONS } from "@/server/auth/permissions";

// Mock the three dependencies of the gate: RBAC ability, teacher resolution, and the
// assignment lookup. The gate's logic (admin bypass vs assignment+role) is what we test.
const state = vi.hoisted(() => ({ perms: new Set<string>() }));
vi.mock("@/server/auth/rbac", () => ({
  getUserPermissions: vi.fn(async () => state.perms),
  createAbility: (perms: Set<string>) => ({ can: (p: string) => perms.has(p) }),
}));
vi.mock("@/modules/teachers/services/teacher.service", () => ({
  getTeacherByUserId: vi.fn(),
}));
vi.mock("@/modules/examinations/repositories/exam-invigilator-assignment.repository", () => ({
  findAssignmentBySessionTeacher: vi.fn(),
}));

import { getTeacherByUserId } from "@/modules/teachers/services/teacher.service";
import { findAssignmentBySessionTeacher } from "@/modules/examinations/repositories/exam-invigilator-assignment.repository";
import {
  assertExamWriteCapability,
  enforceExamSessionWriteScope,
  ATTENDANCE_WRITE_ROLES,
  RESULT_WRITE_ROLES,
} from "../execution-scope-shared";

const ctx = { userId: "u-1", organizationId: "org-A" };
const tx = {} as never;
const ADMIN_ATTEND = PERMISSIONS.EXAMS_MARK_ATTENDANCE;
const ADMIN_RESULT = PERMISSIONS.EXAMS_ENTER_RESULTS;
const EXEC = PERMISSIONS.EXAMS_EXECUTE_ASSIGNED_SESSIONS;

function assignedAs(role: string) {
  vi.mocked(getTeacherByUserId).mockResolvedValue({ id: "teacher-1" } as never);
  vi.mocked(findAssignmentBySessionTeacher).mockResolvedValue({ role } as never);
}

async function attends(): Promise<boolean> {
  try {
    await enforceExamSessionWriteScope(ctx, tx, {
      examSessionId: "sess-1",
      adminPermission: ADMIN_ATTEND,
      allowedRoles: ATTENDANCE_WRITE_ROLES,
    });
    return true;
  } catch (e) {
    expect(e).toBeInstanceOf(AuthorizationError);
    return false;
  }
}
async function results(): Promise<boolean> {
  try {
    await enforceExamSessionWriteScope(ctx, tx, {
      examSessionId: "sess-1",
      adminPermission: ADMIN_RESULT,
      allowedRoles: RESULT_WRITE_ROLES,
    });
    return true;
  } catch (e) {
    expect(e).toBeInstanceOf(AuthorizationError);
    return false;
  }
}

beforeEach(() => {
  state.perms = new Set();
  vi.mocked(getTeacherByUserId).mockReset();
  vi.mocked(findAssignmentBySessionTeacher).mockReset();
});

describe("ADR-017 — admin path (operation-specific permission) is unchanged", () => {
  it("admin with the specific permission is authorized WITHOUT any assignment", async () => {
    state.perms = new Set([ADMIN_ATTEND]);
    expect(await attends()).toBe(true);
    // The admin branch short-circuits — teacher/assignment are never resolved.
    expect(getTeacherByUserId).not.toHaveBeenCalled();
    expect(findAssignmentBySessionTeacher).not.toHaveBeenCalled();
  });

  it("admin bypass is keyed to the OPERATION's permission (mark ≠ enter)", async () => {
    // Holds attendance admin perm only → may write attendance, but NOT results.
    state.perms = new Set([ADMIN_ATTEND]);
    expect(await attends()).toBe(true);
    expect(await results()).toBe(false); // no result perm, no exec perm → denied
  });

  it("capability gate: neither admin nor exec permission → denied", async () => {
    state.perms = new Set();
    await expect(assertExamWriteCapability(ctx, ADMIN_ATTEND)).rejects.toBeInstanceOf(AuthorizationError);
  });

  it("capability gate: admin OR exec permission → allowed", async () => {
    state.perms = new Set([ADMIN_ATTEND]);
    await expect(assertExamWriteCapability(ctx, ADMIN_ATTEND)).resolves.toBeUndefined();
    state.perms = new Set([EXEC]);
    await expect(assertExamWriteCapability(ctx, ADMIN_ATTEND)).resolves.toBeUndefined();
  });
});

describe("ADR-017 — teacher path (assignment + role matrix)", () => {
  beforeEach(() => {
    state.perms = new Set([EXEC]);
  });

  it("CHIEF may write attendance and results", async () => {
    assignedAs("CHIEF");
    expect(await attends()).toBe(true);
    expect(await results()).toBe(true);
  });

  it("INVIGILATOR may write attendance but NOT results", async () => {
    assignedAs("INVIGILATOR");
    expect(await attends()).toBe(true);
    expect(await results()).toBe(false);
  });

  it("MARKER may write attendance and results", async () => {
    assignedAs("MARKER");
    expect(await attends()).toBe(true);
    expect(await results()).toBe(true);
  });

  it("OBSERVER may write nothing", async () => {
    assignedAs("OBSERVER");
    expect(await attends()).toBe(false);
    expect(await results()).toBe(false);
  });

  it("a teacher with no active assignment on the session is denied", async () => {
    vi.mocked(getTeacherByUserId).mockResolvedValue({ id: "teacher-1" } as never);
    vi.mocked(findAssignmentBySessionTeacher).mockResolvedValue(null); // no / other-session / other-org
    expect(await attends()).toBe(false);
    expect(await results()).toBe(false);
  });

  it("a user with the exec permission but NO Teacher record is denied (no admin fallback)", async () => {
    vi.mocked(getTeacherByUserId).mockResolvedValue(null as never);
    expect(await attends()).toBe(false);
    expect(getTeacherByUserId).toHaveBeenCalled();
    expect(findAssignmentBySessionTeacher).not.toHaveBeenCalled();
  });

  it("the assignment lookup is scoped by org + session + teacher (in-tx client passed)", async () => {
    assignedAs("MARKER");
    await attends();
    expect(findAssignmentBySessionTeacher).toHaveBeenCalledWith(
      { organizationId: "org-A", examSessionId: "sess-1", teacherId: "teacher-1" },
      tx
    );
  });
});
