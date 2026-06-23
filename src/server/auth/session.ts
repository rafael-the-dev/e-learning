import { auth } from "@/server/auth";
import { AuthorizationError } from "@/shared/lib/command";
import { getDb } from "@/server/db";
import type { ServiceContext } from "@/shared/types/common";
import { headers } from "next/headers";

// Re-export new context API so callers can import from either path
export {
  getCurrentUser,
  getActiveOrganization,
  requireAuth,
  requireOrganization,
  requirePermission,
  requirePermissionOrRedirect,
  requireRole,
  requireRoleOrRedirect,
  setActiveOrg,
  ACTIVE_ORG_COOKIE,
  type AuthUser,
  type ActiveOrg,
  type AuthContext,
} from "./context";

// =============================================================================
// LEGACY SESSION HELPERS
// These remain for backward compatibility with existing callers.
// New code should import from @/server/auth/context instead.
// =============================================================================

export async function getSession() {
  const session = await auth();
  if (!session?.user?.id) {
    throw new AuthorizationError("You must be logged in");
  }
  return session;
}

/**
 * @deprecated Pass organizationId only for SUPER_ADMIN admin-panel actions
 * where the admin is explicitly targeting a specific org. For org-scoped
 * routes, use requireOrganization() from @/server/auth/context instead.
 */
export async function requireServiceContext(
  organizationId: string
): Promise<ServiceContext> {
  const session = await getSession();
  const headerList = await headers();

  return {
    userId: session.user!.id!,
    organizationId,
    ipAddress: headerList.get("x-forwarded-for") ?? undefined,
    userAgent: headerList.get("user-agent") ?? undefined,
  };
}

/** Resolves context for ORG_ADMIN operations. Uses cookie-aware active org. */
export async function requireOrgContext(): Promise<ServiceContext> {
  const { requireOrganization } = await import("./context");
  return requireOrganization();
}

/** Returns session user + active org for layout rendering. */
export async function getOrgSession(): Promise<{
  user: { id: string; name?: string | null; email?: string | null };
  org: { id: string; name: string; slug: string };
}> {
  const { getCurrentUser, getActiveOrganization } = await import("./context");
  const [user, org] = await Promise.all([getCurrentUser(), getActiveOrganization()]);
  return { user, org };
}

/** For SUPER_ADMIN cross-org operations. organizationId is "SYSTEM". */
export async function requireAdminContext(): Promise<ServiceContext> {
  const session = await getSession();
  const headerList = await headers();

  return {
    userId: session.user!.id!,
    organizationId: "SYSTEM",
    ipAddress: headerList.get("x-forwarded-for") ?? undefined,
    userAgent: headerList.get("user-agent") ?? undefined,
  };
}
