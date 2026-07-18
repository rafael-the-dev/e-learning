import type { PrismaClientOrTx } from "@/server/db";
import { AuthorizationError } from "@/shared/lib/command";
import { createAbility, getUserPermissions } from "@/server/auth/rbac";
import { PERMISSIONS, type Permission } from "@/server/auth/permissions";
import { ExamInvigilatorRole } from "@/modules/examinations/constants";
import { getTeacherByUserId } from "@/modules/teachers/services/teacher.service";
import { findAssignmentBySessionTeacher } from "@/modules/examinations/repositories/exam-invigilator-assignment.repository";

// =============================================================================
// ASSIGNMENT-SCOPED TEACHER EXECUTION — shared authorization gate (ADR-017)
// -----------------------------------------------------------------------------
// The Examination Engine originally DEFERRED "teacher assignment-scoped writes":
// mark/correct attendance and enter/update/submit results authorized on the ADMIN
// permission ONLY (admin / secretary). This gate implements the deferred behaviour
// WITHOUT changing admin behaviour:
//
//   admin permission (exams.markAttendance / exams.enterResults / …)  → allow  [unchanged]
//   OR  exams.executeAssignedSessions  → resolve Teacher from the authenticated
//       user, then require an ACTIVE ExamInvigilatorAssignment on the TARGET session
//       whose role authorizes the operation.
//
// The ADMIN bypass is keyed to the operation's SPECIFIC permission (never a nominal
// "is admin" role). The assignment check runs INSIDE the mutation transaction
// (`tx`), so an assignment removed between authorize() and the write is denied — no
// check-then-mutate window. The teacher identity is ALWAYS resolved server-side from
// the authenticated user; a `teacherId` is NEVER trusted from input. A user who holds
// the permission but has no active Teacher record is DENIED (never an admin fallback).
// =============================================================================

/** Roles that may write ATTENDANCE on an assigned session (ADR-017 matrix). */
export const ATTENDANCE_WRITE_ROLES: string[] = [
  ExamInvigilatorRole.CHIEF,
  ExamInvigilatorRole.INVIGILATOR,
  ExamInvigilatorRole.MARKER,
];

/** Roles that may write RESULTS (enter/update/submit) on an assigned session. */
export const RESULT_WRITE_ROLES: string[] = [
  ExamInvigilatorRole.CHIEF,
  ExamInvigilatorRole.MARKER,
];

/** The minimal authenticated context the gate needs. `userId` is the acting user. */
interface ExecutionContext {
  userId: string;
  organizationId: string;
}

/**
 * Coarse capability check for a command's `authorize()`: the actor must hold EITHER
 * the operation's admin permission OR `exams.executeAssignedSessions`. It does NOT
 * resolve the session — the authoritative assignment/role check runs in-tx in
 * `enforceExamSessionWriteScope`. Cheap early rejection for a user with neither.
 */
export async function assertExamWriteCapability(
  context: ExecutionContext,
  adminPermission: Permission
): Promise<void> {
  const ability = createAbility(await getUserPermissions(context.userId, context.organizationId));
  if (ability.can(adminPermission)) return;
  if (ability.can(PERMISSIONS.EXAMS_EXECUTE_ASSIGNED_SESSIONS)) return;
  throw new AuthorizationError();
}

/**
 * Authoritative, IN-TRANSACTION write gate for a RESOLVED target session.
 * Admin path (operation-specific permission) returns immediately — behaviour
 * unchanged. Otherwise the actor must (1) hold `exams.executeAssignedSessions`,
 * (2) resolve to an active Teacher, and (3) have an assignment on THIS session whose
 * role is in `allowedRoles`. Any failure → AuthorizationError (no admin fallback).
 */
export async function enforceExamSessionWriteScope(
  context: ExecutionContext,
  tx: PrismaClientOrTx,
  opts: { examSessionId: string; adminPermission: Permission; allowedRoles: string[] }
): Promise<void> {
  const ability = createAbility(await getUserPermissions(context.userId, context.organizationId));
  if (ability.can(opts.adminPermission)) return; // admin / secretary — unchanged

  if (!ability.can(PERMISSIONS.EXAMS_EXECUTE_ASSIGNED_SESSIONS)) throw new AuthorizationError();

  // teacherId is resolved server-side from the authenticated user — never from input.
  const teacher = await getTeacherByUserId(context.organizationId, context.userId);
  if (!teacher) throw new AuthorizationError();

  const assignment = await findAssignmentBySessionTeacher(
    { organizationId: context.organizationId, examSessionId: opts.examSessionId, teacherId: teacher.id },
    tx
  );
  if (!assignment || !opts.allowedRoles.includes(assignment.role)) throw new AuthorizationError();
}
