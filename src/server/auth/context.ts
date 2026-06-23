import { cache } from "react";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/server/auth";
import { getDb } from "@/server/db";
import { AuthorizationError } from "@/shared/lib/command";
import { getUserPermissions, createAbility, type Ability } from "./rbac";
import type { Permission, SystemRole } from "./permissions";
import type { ServiceContext } from "@/shared/types/common";

// =============================================================================
// ACTIVE ORGANIZATION CONTEXT
// Single source of truth for authenticated context resolution.
//
// Rule: organizationId is ALWAYS derived server-side from this module.
//       Never accept organizationId directly from client input for tenant queries.
//
// Active org resolution order:
//   1. Cookie `elearning_active_org` (set when user switches org)
//   2. First UserOrganization by joinedAt (auto-selected on first login)
// =============================================================================

export const ACTIVE_ORG_COOKIE = "elearning_active_org";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  avatarUrl?: string | null;
  isActive: boolean;
}

export interface ActiveOrg {
  id: string;
  name: string;
  slug: string;
}

/** ServiceContext enriched with ability and roles — safe to pass to commands. */
export interface AuthContext extends ServiceContext {
  ability: Ability;
  roles: string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Per-request cached resolvers
// React cache() memoizes within a single render tree — identical calls in
// the same request reuse the first result without extra DB round-trips.
// ─────────────────────────────────────────────────────────────────────────────

const _resolveSession = cache(async () => {
  const session = await auth();
  if (!session?.user?.id) throw new AuthorizationError("Não autenticado");
  return session;
});

const _resolveUser = cache(async (userId: string): Promise<AuthUser> => {
  const db = await getDb();
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, name: true, avatarUrl: true, isActive: true },
  });
  if (!user || !user.isActive) {
    throw new AuthorizationError("Utilizador não encontrado ou inativo");
  }
  return user;
});

const _resolveActiveOrg = cache(async (userId: string): Promise<ActiveOrg> => {
  const db = await getDb();
  const cookieStore = await cookies();
  const candidateOrgId = cookieStore.get(ACTIVE_ORG_COOKIE)?.value ?? null;

  let resolvedOrgId: string | null = candidateOrgId;

  // Validate cookie value — must be an org the user actually belongs to
  if (resolvedOrgId) {
    const membership = await db.userOrganization.findUnique({
      where: { userId_organizationId: { userId, organizationId: resolvedOrgId } },
      select: { organizationId: true },
    });
    if (!membership) resolvedOrgId = null;
  }

  // Fall back to the earliest-joined org
  if (!resolvedOrgId) {
    const first = await db.userOrganization.findFirst({
      where: { userId },
      orderBy: { joinedAt: "asc" },
      select: { organizationId: true },
    });
    if (!first) throw new AuthorizationError("Utilizador não pertence a nenhuma organização");
    resolvedOrgId = first.organizationId;
  }

  const org = await db.organization.findUnique({
    where: { id: resolvedOrgId },
    select: { id: true, name: true, slug: true },
  });
  if (!org) throw new AuthorizationError("Organização não encontrada");
  return org;
});

// Keyed by (userId, organizationId) — resolves in one shot if org is already known
const _resolvePermissionsAndRoles = cache(
  async (userId: string, organizationId: string): Promise<{ ability: Ability; roles: string[] }> => {
    const db = await getDb();
    const [permissions, userRoles] = await Promise.all([
      getUserPermissions(userId, organizationId),
      db.userRole.findMany({
        where: { userId, organizationId },
        include: { role: { select: { name: true } } },
      }),
    ]);
    return {
      ability: createAbility(permissions),
      roles: userRoles.map((ur) => ur.role.name),
    };
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns the full User record for the authenticated user.
 * Throws AuthorizationError if the user is not logged in or is inactive.
 */
export async function getCurrentUser(): Promise<AuthUser> {
  const session = await _resolveSession();
  return _resolveUser(session.user!.id!);
}

/**
 * Returns the active org for the authenticated user.
 * Reads from cookie first; falls back to earliest-joined org.
 * Does NOT load permissions — use requireOrganization() for that.
 */
export async function getActiveOrganization(): Promise<ActiveOrg> {
  const session = await _resolveSession();
  return _resolveActiveOrg(session.user!.id!);
}

/**
 * Asserts the request is authenticated.
 * Returns the full user record. Throws AuthorizationError if not.
 */
export async function requireAuth(): Promise<AuthUser> {
  const session = await _resolveSession();
  return _resolveUser(session.user!.id!);
}

/**
 * Asserts authentication + active org membership.
 * Returns AuthContext — a ServiceContext with ability and roles attached.
 * Safe to pass directly to Command constructors.
 */
export async function requireOrganization(): Promise<AuthContext> {
  const session = await _resolveSession();
  const userId = session.user!.id!;
  const headerList = await headers();

  const org = await _resolveActiveOrg(userId);
  const { ability, roles } = await _resolvePermissionsAndRoles(userId, org.id);

  return {
    userId,
    organizationId: org.id,
    ability,
    roles,
    ipAddress: headerList.get("x-forwarded-for") ?? undefined,
    userAgent: headerList.get("user-agent") ?? undefined,
  };
}

/**
 * Asserts the current user has the given permission in their active org.
 * Throws AuthorizationError if the permission is missing.
 */
export async function requirePermission(permission: Permission): Promise<AuthContext> {
  const context = await requireOrganization();
  if (!context.ability.can(permission)) {
    throw new AuthorizationError(`Sem permissão para executar esta ação`);
  }
  return context;
}

/**
 * Asserts the current user holds the given role in their active org.
 * Throws AuthorizationError if the role is missing.
 */
export async function requireRole(role: SystemRole): Promise<AuthContext> {
  const context = await requireOrganization();
  if (!context.roles.includes(role)) {
    throw new AuthorizationError(`Acesso restrito: papel '${role}' necessário`);
  }
  return context;
}

/**
 * Page-level guard: same as requirePermission, but redirects to /forbidden
 * instead of throwing. Use in Server Components (page.tsx/layout.tsx) so a
 * missing permission never surfaces as an unhandled error/500.
 */
export async function requirePermissionOrRedirect(permission: Permission): Promise<AuthContext> {
  try {
    return await requirePermission(permission);
  } catch {
    redirect("/forbidden");
  }
}

/**
 * Page-level guard: same as requireRole, but redirects to /forbidden
 * instead of throwing.
 */
export async function requireRoleOrRedirect(role: SystemRole): Promise<AuthContext> {
  try {
    return await requireRole(role);
  } catch {
    redirect("/forbidden");
  }
}

/**
 * Sets the active organization cookie.
 * Call from a Server Action when the user switches orgs.
 * Validates membership before setting — cannot be forged.
 */
export async function setActiveOrg(organizationId: string): Promise<void> {
  const session = await _resolveSession();
  const db = await getDb();

  const membership = await db.userOrganization.findUnique({
    where: {
      userId_organizationId: { userId: session.user!.id!, organizationId },
    },
    select: { organizationId: true },
  });
  if (!membership) throw new AuthorizationError("Não é membro desta organização");

  const cookieStore = await cookies();
  cookieStore.set(ACTIVE_ORG_COOKIE, organizationId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
}
