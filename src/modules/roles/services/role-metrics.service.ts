import { getDb } from "@/server/db";
import { countAllPermissions } from "@/modules/roles/repositories/permission.repository";
import { countDistinctUsersWithAnyRole } from "@/modules/roles/repositories/role-assignment.repository";
import type { RoleKpis } from "@/modules/roles/types";

// =============================================================================
// ROLE METRICS SERVICE
// "Total Roles" = system roles + the org's ACTIVE custom roles (mutually
// exclusive with "Roles Arquivadas" so the KPIs sum sensibly).
// =============================================================================

export async function getRoleKpis(organizationId: string): Promise<RoleKpis> {
  const db = await getDb();

  const [systemRoles, customActiveRoles, archivedRoles, usersWithRole, totalPermissions] =
    await Promise.all([
      db.role.count({ where: { isSystem: true, name: { not: "SUPER_ADMIN" } } }),
      db.role.count({ where: { organizationId, isSystem: false, status: "ACTIVE" } }),
      db.role.count({ where: { organizationId, isSystem: false, status: "ARCHIVED" } }),
      countDistinctUsersWithAnyRole(organizationId),
      countAllPermissions(),
    ]);

  return {
    totalRoles: systemRoles + customActiveRoles,
    systemRoles,
    customRoles: customActiveRoles,
    usersWithRole,
    totalPermissions,
    archivedRoles,
  };
}
