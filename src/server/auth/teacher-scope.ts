import { redirect } from "next/navigation";
import { AuthorizationError } from "@/shared/lib/command";
import { SYSTEM_ROLES } from "@/server/auth/permissions";
import { getTeacherByUserId } from "@/modules/teachers/services/teacher.service";
import type { AuthContext } from "@/server/auth/context";

// =============================================================================
// TEACHER SCOPE — central, app-wide data-access scoping for the TEACHER role.
//
// A TEACHER user (who is not also ORG_ADMIN/SUPER_ADMIN) only ever sees data
// tied to their own linked Teacher profile. teacherId is ALWAYS resolved
// server-side from currentUser.id → Teacher.userId — never accepted from a URL
// or query param. This module is the single source of truth for "is this
// request teacher-scoped, and to which teacherId" so individual modules don't
// re-derive it.
//
// See docs/teacher-access-scope.md.
// =============================================================================

/**
 * The access scope passed into list services/repositories. A discriminated
 * union so a repository can branch on `type` without guessing whether a bare
 * `teacherId` was intentionally omitted vs. forgotten.
 */
export type DataAccessScope =
  | { type: "organization"; organizationId: string }
  | { type: "teacher"; organizationId: string; teacherId: string };

export interface TeacherScope {
  /** True when the caller is a TEACHER who must be restricted to their own data. */
  isTeacherScoped: boolean;
  /** Resolved Teacher.id — undefined when teacher-scoped but no Teacher profile is linked. */
  teacherId?: string;
  userId: string;
  organizationId: string;
}

const ADMIN_ROLES: string[] = [SYSTEM_ROLES.ORG_ADMIN, SYSTEM_ROLES.SUPER_ADMIN];

/**
 * Pure role test (no DB) — usable from the nav server component and tests.
 * ORG_ADMIN/SUPER_ADMIN are never teacher-scoped even if they also hold the
 * TEACHER role (they're trusted with org-wide data). SECRETARY/STUDENT are
 * not teacher-scoped. Anyone else holding TEACHER is.
 */
export function isTeacherScopedRoles(roles: string[]): boolean {
  if (roles.some((r) => ADMIN_ROLES.includes(r))) return false;
  return roles.includes(SYSTEM_ROLES.TEACHER);
}

/**
 * Resolves whether the current request is teacher-scoped and, if so, the
 * teacherId — looked up from Teacher.userId, never from client input.
 * `teacherId` is undefined when the user is teacher-scoped but their account
 * isn't linked to a Teacher profile; callers decide how to handle that
 * (block vs. redirect) via the helpers below.
 */
export async function resolveTeacherScope(context: AuthContext): Promise<TeacherScope> {
  const base = { userId: context.userId, organizationId: context.organizationId };

  if (!isTeacherScopedRoles(context.roles)) {
    return { isTeacherScoped: false, ...base };
  }

  const teacher = await getTeacherByUserId(context.organizationId, context.userId);
  return { isTeacherScoped: true, teacherId: teacher?.id, ...base };
}

/**
 * Resolves the {@link DataAccessScope} to hand to a list service/repository.
 * Throws AuthorizationError when teacher-scoped but no Teacher profile is
 * linked — a list page can't safely render anything in that state, so it
 * surfaces as a 403 rather than silently returning org-wide data.
 */
export async function resolveDataAccessScope(context: AuthContext): Promise<DataAccessScope> {
  const scope = await resolveTeacherScope(context);

  if (!scope.isTeacherScoped) {
    return { type: "organization", organizationId: context.organizationId };
  }
  if (!scope.teacherId) {
    throw new AuthorizationError("Esta conta de professor não está vinculada a um perfil de professor.");
  }
  return { type: "teacher", organizationId: context.organizationId, teacherId: scope.teacherId };
}

/**
 * Page guard for org-wide list/dashboard pages a teacher-scoped user must not
 * reach (their org-wide KPIs/charts can't be safely scoped). Redirects them to
 * their own scoped Portal instead of leaking org-wide data. No-op for everyone
 * else.
 */
export async function redirectIfTeacherScoped(context: AuthContext, to = "/teacher"): Promise<void> {
  const scope = await resolveTeacherScope(context);
  if (scope.isTeacherScoped) redirect(to);
}
