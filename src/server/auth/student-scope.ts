import { redirect } from "next/navigation";
import { AuthorizationError } from "@/shared/lib/command";
import { SYSTEM_ROLES } from "@/server/auth/permissions";
import { getStudentByUserId } from "@/modules/students/services/student.service";
import type { AuthContext } from "@/server/auth/context";

// =============================================================================
// STUDENT SCOPE — central, app-wide data-access scoping for the STUDENT role.
//
// A STUDENT user (who is not also ORG_ADMIN/SUPER_ADMIN) only ever sees data
// tied to their own linked Student profile. studentId is ALWAYS resolved
// server-side from currentUser.id → Student.userId — never accepted from a URL
// or query param. This module is the single source of truth for "is this
// request student-scoped, and to which studentId" so individual modules don't
// re-derive it.
//
// Mirrors src/server/auth/teacher-scope.ts. See docs/student-portal.md.
// =============================================================================

/**
 * The access scope passed into list services/repositories. A discriminated
 * union so a repository can branch on `type` without guessing whether a bare
 * `studentId` was intentionally omitted vs. forgotten.
 */
export type StudentDataAccessScope =
  | { type: "organization"; organizationId: string }
  | { type: "student"; organizationId: string; studentId: string };

export interface StudentScope {
  /** True when the caller is a STUDENT who must be restricted to their own data. */
  isStudentScoped: boolean;
  /** Resolved Student.id — undefined when student-scoped but no Student profile is linked. */
  studentId?: string;
  userId: string;
  organizationId: string;
}

const ADMIN_ROLES: string[] = [SYSTEM_ROLES.ORG_ADMIN, SYSTEM_ROLES.SUPER_ADMIN];

/**
 * Pure role test (no DB) — usable from the nav server component and tests.
 * ORG_ADMIN/SUPER_ADMIN are never student-scoped even if they also hold the
 * STUDENT role (they're trusted with org-wide data, and may preview the
 * Portal). SECRETARY/TEACHER are not student-scoped. Anyone else holding
 * STUDENT is.
 */
export function isStudentScopedRoles(roles: string[] | undefined | null): boolean {
  const list = roles ?? [];
  if (list.some((r) => ADMIN_ROLES.includes(r))) return false;
  return list.includes(SYSTEM_ROLES.STUDENT);
}

/**
 * Resolves whether the current request is student-scoped and, if so, the
 * studentId — looked up from Student.userId, never from client input.
 * `studentId` is undefined when the user is student-scoped but their account
 * isn't linked to a Student profile; callers decide how to handle that
 * (block vs. redirect) via the helpers below.
 */
export async function resolveStudentScope(context: AuthContext): Promise<StudentScope> {
  const base = { userId: context.userId, organizationId: context.organizationId };

  if (!isStudentScopedRoles(context.roles)) {
    return { isStudentScoped: false, ...base };
  }

  const student = await getStudentByUserId(context.organizationId, context.userId);
  return { isStudentScoped: true, studentId: student?.id, ...base };
}

/**
 * Resolves the {@link StudentDataAccessScope} to hand to a list service/repository.
 * Throws AuthorizationError when student-scoped but no Student profile is
 * linked — a list page can't safely render anything in that state, so it
 * surfaces as a 403 rather than silently returning org-wide data.
 */
export async function resolveStudentDataAccessScope(
  context: AuthContext
): Promise<StudentDataAccessScope> {
  const scope = await resolveStudentScope(context);

  if (!scope.isStudentScoped) {
    return { type: "organization", organizationId: context.organizationId };
  }
  if (!scope.studentId) {
    throw new AuthorizationError("Esta conta ainda não está vinculada a um perfil de aluno.");
  }
  return { type: "student", organizationId: context.organizationId, studentId: scope.studentId };
}

/**
 * Page guard for org-wide list/dashboard pages a student-scoped user must not
 * reach (their org-wide KPIs/charts can't be safely scoped). Redirects them to
 * their own scoped Portal instead of leaking org-wide data. No-op for everyone
 * else.
 */
export async function redirectIfStudentScoped(context: AuthContext, to = "/student"): Promise<void> {
  const scope = await resolveStudentScope(context);
  if (scope.isStudentScoped) redirect(to);
}
