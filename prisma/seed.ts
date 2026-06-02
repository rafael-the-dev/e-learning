import "dotenv/config";
import { getDb } from "../src/server/db";
import { PERMISSIONS, ROLE_PERMISSIONS, SYSTEM_ROLES } from "../src/server/auth/permissions";

// =============================================================================
// DATABASE SEED
// Run with: pnpm db:seed
// Seeds: Permissions catalog, System Roles, Default Role-Permission assignments
// =============================================================================

async function main() {
  const db = await getDb();

  console.log("Seeding permissions...");

  for (const key of Object.keys(PERMISSIONS)) {
    const value = PERMISSIONS[key as keyof typeof PERMISSIONS];
    const [module, action] = value.split(".");
    await db.permission.upsert({
      where: { module_action: { module, action } },
      update: { description: key },
      create: { module, action, description: key },
    });
  }

  console.log(`✓ ${Object.keys(PERMISSIONS).length} permissions seeded`);
  console.log("Seeding system roles...");

  for (const roleName of Object.values(SYSTEM_ROLES)) {
    const existing = await db.role.findFirst({
      where: { organizationId: null, name: roleName },
    });
    const role = existing
      ? await db.role.update({ where: { id: existing.id }, data: { isSystem: true } })
      : await db.role.create({
          data: { name: roleName, isSystem: true, description: `System role: ${roleName}` },
        });

    const permissionsForRole = ROLE_PERMISSIONS[roleName];
    for (const permValue of permissionsForRole) {
      const [module, action] = permValue.split(".");
      const permission = await db.permission.findUnique({
        where: { module_action: { module, action } },
      });
      if (!permission) continue;
      await db.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: role.id, permissionId: permission.id } },
        update: {},
        create: { roleId: role.id, permissionId: permission.id },
      });
    }
    console.log(`✓ Role "${roleName}" seeded with ${permissionsForRole.length} permissions`);
  }

  console.log("Seed complete.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
