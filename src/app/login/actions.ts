"use server";

import { getSession } from "@/server/auth/session";
import { isSuperAdmin } from "@/server/auth/rbac";
import { requireOrganization } from "@/server/auth/context";
import { SYSTEM_ROLES, PERMISSIONS } from "@/server/auth/permissions";

/**
 * Resolves where to send the user after a successful login.
 *
 * Role check is always server-side — never trust the client for routing.
 * Every branch must point at a page the user can actually open: `/dashboard`
 * is gated to the ORG_ADMIN *role* (not a permission), so sending any other
 * role there bounced them straight to `/forbidden`. Each landing below is
 * matched to what the destination page's own guard requires.
 */
export async function getPostLoginRedirect(): Promise<string> {
  try {
    const session = await getSession();

    // SUPER_ADMIN operates at the PLATFORM level and may have no org
    // membership, so resolve it before requireOrganization() (which would
    // throw for an org-less user).
    if (await isSuperAdmin(session.user!.id!)) return "/organizations";

    const { roles, ability } = await requireOrganization();

    if (roles.includes(SYSTEM_ROLES.ORG_ADMIN)) return "/dashboard";
    // Checked before STUDENTS_READ because TEACHER holds both — the portal is
    // the teacher's intended daily home.
    if (ability.can(PERMISSIONS.TEACHER_PORTAL_VIEW)) return "/teacher";
    // STUDENT lands on their own self-service Portal. Checked before
    // STUDENTS_READ (which they don't hold anyway) for symmetry with TEACHER.
    if (ability.can(PERMISSIONS.STUDENT_PORTAL_VIEW)) return "/student";
    // GUARDIAN lands on the responsible-party Portal. Their role holds neither
    // STUDENTS_READ nor the other portal permissions, so without this branch
    // they'd fall through to /notifications.
    if (ability.can(PERMISSIONS.GUARDIAN_PORTAL_VIEW)) return "/guardian";
    // SECRETARY (and any role with student access) lands on their primary
    // operational page.
    if (ability.can(PERMISSIONS.STUDENTS_READ)) return "/students";
    // Universal safe fallback — every role holds NOTIFICATIONS_VIEW_OWN, so
    // this can never resolve to a page that redirects to /forbidden.
    return "/notifications";
  } catch {
    return "/login";
  }
}
