import { getDb } from "@/server/db";
import { buildSkipTake, buildPaginationMeta } from "@/shared/lib/pagination";
import type { PaginatedResult, PaginationParams } from "@/shared/types/common";
import type { RoleAssignedUser } from "@/modules/roles/types";

// =============================================================================
// ROLE ASSIGNMENT REPOSITORY
// Read-side queries over UserRole, scoped to organizationId. Mutations
// (assign/remove) live in the users module's commands, which own the
// User <-> Role relationship and its business rules (e.g. last-admin guard).
// =============================================================================

export async function findUsersByRole(
  roleId: string,
  organizationId: string,
  params: PaginationParams
): Promise<PaginatedResult<RoleAssignedUser>> {
  const db = await getDb();
  const { skip, take } = buildSkipTake(params);

  const where = { roleId, organizationId };
  const [rows, total] = await Promise.all([
    db.userRole.findMany({
      where,
      select: {
        userId: true,
        assignedAt: true,
        user: { select: { name: true, email: true, isActive: true } },
      },
      skip,
      take,
      orderBy: { assignedAt: "desc" },
    }),
    db.userRole.count({ where }),
  ]);

  const data: RoleAssignedUser[] = rows.map((row) => ({
    userId: row.userId,
    name: row.user.name,
    email: row.user.email,
    isActive: row.user.isActive,
    assignedAt: row.assignedAt,
  }));

  return buildPaginationMeta(data, total, params);
}

export async function countDistinctUsersWithAnyRole(organizationId: string): Promise<number> {
  const db = await getDb();
  const rows = await db.userRole.groupBy({
    by: ["userId"],
    where: { organizationId },
  });
  return rows.length;
}
