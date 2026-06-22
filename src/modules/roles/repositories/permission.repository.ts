import { getDb } from "@/server/db";
import type { PermissionCatalogItem } from "@/modules/roles/types";

// =============================================================================
// PERMISSIONS REPOSITORY (READ-ONLY)
// Permission is a global, system-controlled catalog (code/seed/migration).
// This repository only ever reads — never create/update/delete a Permission
// row from application code.
// =============================================================================

export async function findAllPermissions(): Promise<PermissionCatalogItem[]> {
  const db = await getDb();
  return db.permission.findMany({
    select: { id: true, module: true, action: true, description: true },
    orderBy: [{ module: "asc" }, { action: "asc" }],
  });
}

export async function countAllPermissions(): Promise<number> {
  const db = await getDb();
  return db.permission.count();
}

export async function findRolePermissionIds(roleId: string): Promise<string[]> {
  const db = await getDb();
  const rows = await db.rolePermission.findMany({
    where: { roleId },
    select: { permissionId: true },
  });
  return rows.map((r) => r.permissionId);
}
