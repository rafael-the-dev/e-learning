import { getDb } from "@/server/db";
import type { Permission } from "./permissions";

// =============================================================================
// RBAC ENGINE
// Loads the user's permissions for a given organization from the database
// and exposes a simple `can()` check. Results are intended to be cached
// per request via React cache() or a session-level store.
// =============================================================================

export async function getUserPermissions(
  userId: string,
  organizationId: string
): Promise<Set<string>> {
  const db = await getDb();
  const userRoles = await db.userRole.findMany({
    where: { userId, organizationId },
    include: {
      role: {
        include: {
          rolePermissions: {
            include: { permission: true },
          },
        },
      },
    },
  });

  const permissions = new Set<string>();
  for (const userRole of userRoles) {
    for (const rp of userRole.role.rolePermissions) {
      permissions.add(`${rp.permission.module}.${rp.permission.action}`);
    }
  }
  return permissions;
}

export function createAbility(permissions: Set<string>) {
  return {
    can(permission: Permission): boolean {
      return permissions.has(permission);
    },
    canAll(perms: Permission[]): boolean {
      return perms.every((p) => permissions.has(p));
    },
    canAny(perms: Permission[]): boolean {
      return perms.some((p) => permissions.has(p));
    },
  };
}

export type Ability = ReturnType<typeof createAbility>;

export async function isSuperAdmin(userId: string): Promise<boolean> {
  const db = await getDb();
  const superAdminRole = await db.role.findFirst({
    where: { name: "SUPER_ADMIN", isSystem: true },
  });
  if (!superAdminRole) return false;
  const userRole = await db.userRole.findFirst({
    where: { userId, roleId: superAdminRole.id },
  });
  return userRole !== null;
}
