import { SYSTEM_ROLES } from "@/server/auth/permissions";
import { findGuardianLinks, findGuardianLink } from "@/modules/guardian-portal/repositories/guardian-portal.repository";
import type { GuardianLinkRow } from "@/modules/guardian-portal/repositories/guardian-portal.repository";
import type { AuthContext } from "@/server/auth/context";

// =============================================================================
// GUARDIAN SCOPE — central, app-wide data-access scoping for the GUARDIAN role.
//
// A GUARDIAN user (who is not also ORG_ADMIN/SUPER_ADMIN) only ever sees the
// students linked to their own account via GuardianStudent. Unlike teacher/
// student scope (one profile), a guardian may have MANY linked students, so the
// scope resolves to a SET of links. A studentId is ALWAYS validated against
// those links server-side — never accepted from a URL/query param without
// validation. This module is the single source of truth for "is this request
// guardian-scoped, and which students may it touch".
//
// Mirrors src/server/auth/{teacher,student}-scope.ts. See docs/guardian-portal.md.
// =============================================================================

export interface GuardianScope {
  /** True when the caller is a GUARDIAN who must be restricted to their linked students. */
  isGuardianScoped: boolean;
  userId: string;
  organizationId: string;
  /** All ACTIVE links for this guardian. Empty when scoped but no students are linked. */
  links: GuardianLinkRow[];
}

const ADMIN_ROLES: string[] = [SYSTEM_ROLES.ORG_ADMIN, SYSTEM_ROLES.SUPER_ADMIN];

/**
 * Pure role test (no DB) — usable from the nav server component and tests.
 * ORG_ADMIN/SUPER_ADMIN are never guardian-scoped even if they also hold the
 * GUARDIAN role (they're trusted with org-wide data and may preview the
 * Portal). Anyone else holding GUARDIAN is.
 */
export function isGuardianScopedRoles(roles: string[] | undefined | null): boolean {
  const list = roles ?? [];
  if (list.some((r) => ADMIN_ROLES.includes(r))) return false;
  return list.includes(SYSTEM_ROLES.GUARDIAN);
}

/**
 * Resolves whether the current request is guardian-scoped and, if so, the set
 * of ACTIVE links — looked up from GuardianStudent by (org, guardianUserId),
 * never from client input. `links` is empty when the user is guardian-scoped
 * but has no linked students; the portal renders a blocked state in that case.
 */
export async function resolveGuardianScope(context: AuthContext): Promise<GuardianScope> {
  const base = { userId: context.userId, organizationId: context.organizationId };

  if (!isGuardianScopedRoles(context.roles)) {
    return { isGuardianScoped: false, links: [], ...base };
  }

  const links = await findGuardianLinks(context.organizationId, context.userId);
  return { isGuardianScoped: true, links, ...base };
}

/**
 * Validates a candidate studentId against the guardian's ACTIVE links. Returns
 * the matching link or null. A null result MUST be treated as "no access"
 * (forged/foreign studentId, cross-student, or cross-tenant) — never fall back
 * to org-wide data. The guardianUserId is taken from the authenticated context,
 * never from the request.
 */
export async function validateGuardianStudentAccess(
  context: AuthContext,
  studentId: string
): Promise<GuardianLinkRow | null> {
  return findGuardianLink(context.organizationId, context.userId, studentId);
}
