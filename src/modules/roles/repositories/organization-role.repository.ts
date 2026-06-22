import { getDb } from "@/server/db";
import { buildSkipTake, buildPaginationMeta } from "@/shared/lib/pagination";
import type { PaginatedResult, PaginationParams, RoleStatus } from "@/shared/types/common";
import type { OrganizationRoleDetail, OrganizationRoleListItem } from "@/modules/roles/types";

// =============================================================================
// ORGANIZATION ROLES REPOSITORY
// System roles (organizationId: null, excluding SUPER_ADMIN) are read-only and
// visible to every organization. Custom roles are strictly scoped to their
// organizationId. Never query custom roles cross-tenant.
// =============================================================================

export interface ListOrganizationRolesParams extends PaginationParams {
  search?: string;
  type?: "system" | "custom";
  status?: RoleStatus;
}

function mapToListItem(row: {
  id: string;
  name: string;
  code: string | null;
  description: string | null;
  isSystem: boolean;
  status: string;
  createdAt: Date;
  _count: { rolePermissions: number; userRoles: number };
}): OrganizationRoleListItem {
  return {
    id: row.id,
    name: row.name,
    code: row.code,
    description: row.description,
    isSystem: row.isSystem,
    status: row.status as RoleStatus,
    permissionCount: row._count.rolePermissions,
    userCount: row._count.userRoles,
    createdAt: row.createdAt,
  };
}

export async function findOrganizationRoles(
  organizationId: string,
  params: ListOrganizationRolesParams
): Promise<PaginatedResult<OrganizationRoleListItem>> {
  const db = await getDb();
  const { skip, take } = buildSkipTake(params);

  const scope =
    params.type === "system"
      ? [{ isSystem: true, name: { not: "SUPER_ADMIN" } }]
      : params.type === "custom"
        ? [{ organizationId, isSystem: false }]
        : [{ isSystem: true, name: { not: "SUPER_ADMIN" } }, { organizationId, isSystem: false }];

  const where = {
    OR: scope,
    ...(params.search && {
      AND: [
        {
          OR: [
            { name: { contains: params.search } },
            { code: { contains: params.search } },
          ],
        },
      ],
    }),
    ...(params.status && { status: params.status }),
  };

  const select = {
    id: true,
    name: true,
    code: true,
    description: true,
    isSystem: true,
    status: true,
    createdAt: true,
    _count: {
      select: {
        rolePermissions: true,
        userRoles: { where: { organizationId } },
      },
    },
  };

  const [rows, total] = await Promise.all([
    db.role.findMany({ where, select, skip, take, orderBy: [{ isSystem: "desc" }, { name: "asc" }] }),
    db.role.count({ where }),
  ]);

  return buildPaginationMeta(rows.map(mapToListItem), total, params);
}

export async function findOrganizationRoleById(
  roleId: string,
  organizationId: string
): Promise<OrganizationRoleDetail | null> {
  const db = await getDb();
  const row = await db.role.findFirst({
    where: {
      id: roleId,
      OR: [{ isSystem: true }, { organizationId, isSystem: false }],
    },
    select: {
      id: true,
      organizationId: true,
      name: true,
      code: true,
      description: true,
      isSystem: true,
      status: true,
      createdAt: true,
      updatedAt: true,
      rolePermissions: { select: { permissionId: true } },
    },
  });
  if (!row) return null;
  return {
    id: row.id,
    organizationId: row.organizationId,
    name: row.name,
    code: row.code,
    description: row.description,
    isSystem: row.isSystem,
    status: row.status as RoleStatus,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    permissionIds: row.rolePermissions.map((rp) => rp.permissionId),
  };
}

export interface OrganizationRoleOption {
  id: string;
  name: string;
  code: string | null;
  isSystem: boolean;
  status: RoleStatus;
}

/** Lightweight, unpaginated list for role-picker UIs (duplicate source selector). */
export async function findOrganizationRoleOptions(
  organizationId: string
): Promise<OrganizationRoleOption[]> {
  const db = await getDb();
  const rows = await db.role.findMany({
    where: {
      OR: [{ isSystem: true, name: { not: "SUPER_ADMIN" } }, { organizationId, isSystem: false }],
    },
    select: { id: true, name: true, code: true, isSystem: true, status: true },
    orderBy: [{ isSystem: "desc" }, { name: "asc" }],
  });
  return rows.map((r) => ({ ...r, status: r.status as RoleStatus }));
}

export async function findRoleByCodeInOrg(
  code: string,
  organizationId: string
): Promise<{ id: string } | null> {
  const db = await getDb();
  return db.role.findFirst({
    where: { organizationId, code },
    select: { id: true },
  });
}

export async function createOrganizationRole(data: {
  organizationId: string;
  name: string;
  code: string;
  description?: string | null;
}) {
  const db = await getDb();
  return db.role.create({
    data: {
      organizationId: data.organizationId,
      name: data.name,
      code: data.code,
      description: data.description ?? null,
      isSystem: false,
      status: "ACTIVE",
    },
  });
}

export async function updateOrganizationRole(
  roleId: string,
  data: { name?: string; description?: string | null }
) {
  const db = await getDb();
  return db.role.update({ where: { id: roleId }, data });
}

export async function setOrganizationRoleStatus(roleId: string, status: RoleStatus) {
  const db = await getDb();
  return db.role.update({ where: { id: roleId }, data: { status } });
}

export async function countUsersWithRole(
  roleId: string,
  organizationId: string
): Promise<number> {
  const db = await getDb();
  return db.userRole.count({ where: { roleId, organizationId } });
}

export async function copyRolePermissions(sourceRoleId: string, targetRoleId: string) {
  const db = await getDb();
  const source = await db.rolePermission.findMany({
    where: { roleId: sourceRoleId },
    select: { permissionId: true },
  });
  if (source.length === 0) return 0;
  const result = await db.rolePermission.createMany({
    data: source.map((rp) => ({ roleId: targetRoleId, permissionId: rp.permissionId })),
  });
  return result.count;
}
