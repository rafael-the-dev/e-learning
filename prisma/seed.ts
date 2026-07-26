import "dotenv/config";
import bcrypt from "bcryptjs";
import { getDb } from "../src/server/db";
import { PERMISSIONS, ROLE_PERMISSIONS, SYSTEM_ROLES } from "../src/server/auth/permissions";
import { parsePermissionCode, buildPermissionCode } from "../src/server/auth/permission-codec";
import { ensureDefaultNotificationConfig } from "../src/modules/notifications/services/notification-defaults.service";
import type { PrismaClient } from "@prisma/client";

// =============================================================================
// DATABASE SEED
// Run with: pnpm db:seed
// Seeds: Permissions catalog, System Roles, Default Role-Permission assignments
// =============================================================================

// Removes Permission rows left over from the previous buggy parser (it split
// multi-dot codes like "integrity.issues.view" into the wrong module/action,
// e.g. module="integrity", action="issues" — losing ".view"/".resolve"). Those
// rows now resolve to a code outside the PERMISSIONS catalog, so they're safe
// to identify as stale. Their RolePermission links are removed first (FK is
// onDelete: NoAction) before the orphaned Permission row itself is deleted.
async function cleanupStalePermissions(db: PrismaClient): Promise<void> {
  const expectedCodeSet = new Set(Object.values(PERMISSIONS) as string[]);
  const dbPermissions = await db.permission.findMany({
    select: { id: true, module: true, action: true },
  });

  const stale = dbPermissions.filter(
    (p) => !expectedCodeSet.has(buildPermissionCode(p.module, p.action))
  );
  if (stale.length === 0) return;

  for (const permission of stale) {
    await db.rolePermission.deleteMany({ where: { permissionId: permission.id } });
    await db.permission.delete({ where: { id: permission.id } });
    console.log(
      `✓ Removed stale permission "${buildPermissionCode(permission.module, permission.action)}" (pre-existing parser bug)`
    );
  }
}

// Fails loudly if the seeded Permission catalog has drifted from the code
// constants in any way (missing, duplicate, or truncated/collided codes), or
// if ORG_ADMIN didn't receive a permission it's supposed to have by default.
async function validatePermissionsSeeded(db: PrismaClient): Promise<void> {
  const errors: string[] = [];

  const expectedCodes = Object.values(PERMISSIONS) as string[];
  const expectedCodeSet = new Set(expectedCodes);
  if (expectedCodeSet.size !== expectedCodes.length) {
    errors.push("Duplicate permission code found in the PERMISSIONS catalog itself.");
  }

  const dbPermissions = await db.permission.findMany({
    select: { module: true, action: true },
  });

  const dbCodes = new Set<string>();
  for (const { module, action } of dbPermissions) {
    const code = buildPermissionCode(module, action);
    if (dbCodes.has(code)) {
      errors.push(`Duplicate permission row in DB resolves to code "${code}".`);
    }
    dbCodes.add(code);
  }

  if (dbCodes.size !== dbPermissions.length) {
    errors.push(
      `Collision detected: ${dbPermissions.length} rows in DB but only ${dbCodes.size} distinct codes.`
    );
  }

  for (const code of expectedCodeSet) {
    if (!dbCodes.has(code)) {
      errors.push(`Missing permission in DB: "${code}".`);
    }
  }

  for (const code of dbCodes) {
    if (!expectedCodeSet.has(code)) {
      errors.push(`Permission in DB not present in the PERMISSIONS catalog: "${code}".`);
    }
  }

  const orgAdminRole = await db.role.findFirst({
    where: { organizationId: null, isSystem: true, name: SYSTEM_ROLES.ORG_ADMIN },
  });
  if (!orgAdminRole) {
    errors.push("ORG_ADMIN system role not found after seeding.");
  } else {
    const orgAdminRolePermissions = await db.rolePermission.findMany({
      where: { roleId: orgAdminRole.id },
      include: { permission: true },
    });
    const orgAdminCodes = new Set(
      orgAdminRolePermissions.map((rp) =>
        buildPermissionCode(rp.permission.module, rp.permission.action)
      )
    );
    for (const code of ROLE_PERMISSIONS.ORG_ADMIN) {
      if (!orgAdminCodes.has(code)) {
        errors.push(`ORG_ADMIN is missing expected permission: "${code}".`);
      }
    }
  }

  if (errors.length > 0) {
    throw new Error(`Permission seed validation failed:\n  - ${errors.join("\n  - ")}`);
  }

  console.log(
    `✓ Validation passed: ${dbCodes.size} permission codes in DB match the catalog exactly`
  );
}

// =============================================================================
// PRODUCTION SEED GUARD (deploy-blocker, not a nice-to-have)
// This seed performs destructive work (cleanupStalePermissions deletes rows). It
// must NEVER run against production unless the operator explicitly opts in via an
// ENV VARIABLE (not a --force flag, which generic scripts can pass inadvertently).
// The guard runs BEFORE any getDb()/transaction/destructive call.
// =============================================================================
function describeTarget(): string {
  const url = process.env.DATABASE_URL ?? "";
  const host = (url.match(/sqlserver:\/\/([^;]+)/) || [])[1] ?? "unknown-host";
  const database = (url.match(/database=([^;]+)/) || [])[1] ?? "unknown-db";
  return `${host} / ${database}`; // host + database only — password is never printed
}

function assertSeedAllowed(): void {
  const env = process.env.NODE_ENV ?? "development";
  const explicitConsent = process.env.ALLOW_PRODUCTION_SEED === "true";
  const target = describeTarget();

  if (env !== "production") {
    console.log(`▶ Seed permitido — ambiente="${env}", alvo=${target}, ação=seed permissions/roles (+ cleanup de permissions obsoletas).`);
    return;
  }

  if (!explicitConsent) {
    console.error(
      [
        "✗ SEED ABORTADO — recusa de segurança antes de qualquer operação destrutiva.",
        `  Ambiente : ${env}`,
        `  Alvo     : ${target}`,
        "  Ação     : cleanupStalePermissions APAGA linhas Permission/RolePermission + upserts de roles.",
        "  Motivo   : NODE_ENV=production sem autorização explícita.",
        "  Para autorizar (com plena consciência): defina ALLOW_PRODUCTION_SEED=true.",
      ].join("\n")
    );
    process.exit(1);
  }

  console.warn(
    [
      "⚠ SEED DE PRODUÇÃO AUTORIZADO — a prosseguir com operações destrutivas.",
      `  Ambiente : ${env} (ALLOW_PRODUCTION_SEED=true)`,
      `  Alvo     : ${target}`,
      "  Ação     : cleanupStalePermissions APAGA linhas + upserts de roles/permissions.",
    ].join("\n")
  );
}

async function main() {
  // Fail-closed BEFORE opening any connection or running a destructive statement.
  assertSeedAllowed();

  const db = await getDb();

  console.log("Seeding permissions...");

  for (const key of Object.keys(PERMISSIONS)) {
    const value = PERMISSIONS[key as keyof typeof PERMISSIONS];
    const { module, action } = parsePermissionCode(value);
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
      ? await db.role.update({ where: { id: existing.id }, data: { isSystem: true, code: roleName } })
      : await db.role.create({
          // `code` is REQUIRED here (not left to db:backfill-role-codes): the
          // roles UNIQUE([organizationId], [code]) is a plain constraint, so on a
          // clean database every system role (organizationId=null) with a null code
          // would collide on the 2nd insert (SQL Server treats NULLs as equal). Set
          // code = role name (the same value backfill-role-codes assigns) so the seed
          // is self-sufficient on a fresh database. See docs / migration gotchas.
          data: { name: roleName, code: roleName, isSystem: true, description: `System role: ${roleName}` },
        });

    const permissionsForRole = ROLE_PERMISSIONS[roleName];
    for (const permValue of permissionsForRole) {
      const { module, action } = parsePermissionCode(permValue);
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

  await cleanupStalePermissions(db);
  await validatePermissionsSeeded(db);

  console.log("Seeding super admin user...");

  const passwordHash = await bcrypt.hash("123456", 12);

  const superAdmin = await db.user.upsert({
    where: { email: "rafaeljossefativanejunior@gmail.com" },
    update: {},
    create: {
      email: "rafaeljossefativanejunior@gmail.com",
      name: "Rafael Fativane",
      passwordHash,
      isActive: true,
    },
  });

  const superAdminRole = await db.role.findFirst({
    where: { name: SYSTEM_ROLES.SUPER_ADMIN, isSystem: true },
  });

  if (superAdminRole) {
    await db.userRole.upsert({
      where: {
        userId_roleId_organizationId: {
          userId: superAdmin.id,
          roleId: superAdminRole.id,
          organizationId: "PLATFORM",
        },
      },
      update: {},
      create: {
        userId: superAdmin.id,
        roleId: superAdminRole.id,
        organizationId: "PLATFORM",
      },
    });
    console.log(`✓ Super admin user seeded: ${superAdmin.email}`);
  }

  console.log("Seeding default notification rules/templates...");
  const organizations = await db.organization.findMany({ select: { id: true } });
  for (const org of organizations) {
    await ensureDefaultNotificationConfig(org.id);
  }
  console.log(`✓ Default notification config ensured for ${organizations.length} organization(s)`);

  console.log("Seed complete.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
