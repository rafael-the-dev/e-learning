import { getDb } from "@/server/db";
import { buildSkipTake, buildPaginationMeta } from "@/shared/lib/pagination";
import type { PaginatedResult, PaginationParams } from "@/shared/types/common";
import type { OrgUser, AssignableRole } from "@/modules/users/types";

// =============================================================================
// USERS REPOSITORY
// All queries are scoped to an organizationId. Never query cross-tenant.
// =============================================================================

export interface ListUsersParams extends PaginationParams {
  search?: string;
  role?: string;
  status?: string; // "ACTIVE" | "DISABLED"
}

function mapToOrgUser(row: {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  isActive: boolean;
  lastLoginAt: Date | null;
  createdAt: Date;
  userOrganizations: Array<{ joinedAt: Date; isOwner: boolean }>;
  userRoles: Array<{ role: { id: string; name: string } }>;
}): OrgUser {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    phone: row.phone,
    isActive: row.isActive,
    lastLoginAt: row.lastLoginAt,
    createdAt: row.createdAt,
    joinedAt: row.userOrganizations[0]?.joinedAt ?? row.createdAt,
    isOwner: row.userOrganizations[0]?.isOwner ?? false,
    roles: row.userRoles.map((ur) => ur.role),
  };
}

export async function findUsersByOrganization(
  organizationId: string,
  params: ListUsersParams
): Promise<PaginatedResult<OrgUser>> {
  const db = await getDb();
  const { skip, take } = buildSkipTake(params);

  const where = {
    deletedAt: null,
    userOrganizations: { some: { organizationId } },
    ...(params.search && {
      OR: [
        { name: { contains: params.search } },
        { email: { contains: params.search } },
      ],
    }),
    ...(params.status === "ACTIVE" && { isActive: true }),
    ...(params.status === "DISABLED" && { isActive: false }),
    ...(params.role && {
      userRoles: {
        some: { organizationId, role: { name: params.role } },
      },
    }),
  };

  const select = {
    id: true,
    name: true,
    email: true,
    phone: true,
    isActive: true,
    lastLoginAt: true,
    createdAt: true,
    userOrganizations: {
      where: { organizationId },
      select: { joinedAt: true, isOwner: true },
    },
    userRoles: {
      where: { organizationId },
      select: { role: { select: { id: true, name: true } } },
    },
  };

  const [rows, total] = await Promise.all([
    db.user.findMany({ where, select, skip, take, orderBy: { name: "asc" } }),
    db.user.count({ where }),
  ]);

  return buildPaginationMeta(rows.map(mapToOrgUser), total, params);
}

export async function findUserInOrganization(
  userId: string,
  organizationId: string
): Promise<OrgUser | null> {
  const db = await getDb();
  const row = await db.user.findFirst({
    where: {
      id: userId,
      deletedAt: null,
      userOrganizations: { some: { organizationId } },
    },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      isActive: true,
      lastLoginAt: true,
      createdAt: true,
      userOrganizations: {
        where: { organizationId },
        select: { joinedAt: true, isOwner: true },
      },
      userRoles: {
        where: { organizationId },
        select: { role: { select: { id: true, name: true } } },
      },
    },
  });
  return row ? mapToOrgUser(row) : null;
}

export async function findUserByEmail(email: string) {
  const db = await getDb();
  return db.user.findUnique({ where: { email } });
}

export async function createOrgUser(data: {
  name: string;
  email: string;
  phone?: string;
  passwordHash: string;
}) {
  const db = await getDb();
  return db.user.create({
    data: {
      name: data.name,
      email: data.email,
      phone: data.phone ?? null,
      passwordHash: data.passwordHash,
      isActive: true,
    },
  });
}

export async function createUserOrganizationLink(data: {
  userId: string;
  organizationId: string;
  isOwner?: boolean;
}) {
  const db = await getDb();
  return db.userOrganization.create({
    data: {
      userId: data.userId,
      organizationId: data.organizationId,
      isOwner: data.isOwner ?? false,
    },
  });
}

export async function createUserRoleLink(data: {
  userId: string;
  roleId: string;
  organizationId: string;
  assignedBy: string;
}) {
  const db = await getDb();
  return db.userRole.create({
    data: {
      userId: data.userId,
      roleId: data.roleId,
      organizationId: data.organizationId,
      assignedBy: data.assignedBy,
    },
  });
}

export async function updateOrgUser(
  userId: string,
  data: { name?: string; phone?: string | null }
) {
  const db = await getDb();
  return db.user.update({ where: { id: userId }, data });
}

export async function setUserActiveStatus(userId: string, isActive: boolean) {
  const db = await getDb();
  return db.user.update({ where: { id: userId }, data: { isActive } });
}

export async function deleteUserRolesInOrg(
  userId: string,
  organizationId: string
) {
  const db = await getDb();
  await db.userRole.deleteMany({ where: { userId, organizationId } });
}

export async function deleteUserOrganizationLink(
  userId: string,
  organizationId: string
) {
  const db = await getDb();
  await db.userOrganization.deleteMany({ where: { userId, organizationId } });
}

export async function countOrgAdmins(organizationId: string): Promise<number> {
  const db = await getDb();
  return db.userRole.count({
    where: {
      organizationId,
      role: { name: "ORG_ADMIN", isSystem: true },
      user: { isActive: true },
    },
  });
}

/** Returns roles assignable by ORG_ADMIN — system roles (except SUPER_ADMIN) + org-custom roles. */
export async function findAssignableRoles(
  organizationId: string
): Promise<AssignableRole[]> {
  const db = await getDb();
  const roles = await db.role.findMany({
    where: {
      OR: [
        { isSystem: true, name: { not: "SUPER_ADMIN" } },
        { organizationId, isSystem: false, status: "ACTIVE" },
      ],
    },
    select: { id: true, name: true, isSystem: true },
    orderBy: { name: "asc" },
  });
  return roles;
}

export async function findRoleById(roleId: string) {
  const db = await getDb();
  return db.role.findUnique({ where: { id: roleId } });
}
