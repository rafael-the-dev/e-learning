/**
 * RBAC Tenant Isolation — Integration Test Script
 * ================================================
 * Proves that role/user/permission Commands and read paths cannot cross
 * organization boundaries. Runs the real Commands and Services (no mocks)
 * against a live SQL Server database.
 *
 * Prerequisites
 * -------------
 * 1. Set DATABASE_URL to a live SQL Server connection string.
 * 2. Run `pnpm db:seed` at least once (system roles + permission catalog
 *    must already exist).
 *
 * Run
 * ---
 *   npx tsx src/modules/roles/__tests__/tenant-isolation.integration.ts
 *
 * What it does
 * ------------
 * Creates two throwaway organizations — each with an ORG_ADMIN actor, a
 * regular target user, and one custom role — runs every scenario below
 * acting as Org A's ORG_ADMIN against Org B's data, then deletes
 * everything it created. It never touches pre-existing data.
 *
 * Scenarios
 * ---------
 *  1. AssignUserRoleCommand rejects a custom role from another organization.
 *  2. CreateOrganizationUserCommand rejects a custom role from another organization.
 *  3. UpdateRolePermissionsCommand cannot update a role from another organization.
 *  4. ArchiveOrganizationRoleCommand cannot archive a role from another organization.
 *  5. DuplicateOrganizationRoleCommand cannot duplicate another organization's custom role.
 *  6. RemoveUserRoleCommand cannot remove an assignment from another organization.
 *  7. Role list only returns roles for the active organization + allowed system roles.
 *  8. Role detail rejects a cross-tenant roleId.
 *  9. The permission matrix flow never mutates global Permission records.
 * 10. ORG_ADMIN from Org A cannot manage Org B's roles (full validate+authorize+execute pipeline).
 */

import "dotenv/config";
import type { PrismaClient } from "@prisma/client";
import { getDb } from "@/server/db";
import { AssignUserRoleCommand } from "@/modules/users/commands/assign-user-role.command";
import { RemoveUserRoleCommand } from "@/modules/users/commands/remove-user-role.command";
import { CreateOrganizationUserCommand } from "@/modules/users/commands/create-org-user.command";
import { UpdateRolePermissionsCommand } from "@/modules/roles/commands/update-role-permissions.command";
import { ArchiveOrganizationRoleCommand } from "@/modules/roles/commands/archive-organization-role.command";
import { DuplicateOrganizationRoleCommand } from "@/modules/roles/commands/duplicate-organization-role.command";
import { UpdateOrganizationRoleCommand } from "@/modules/roles/commands/update-organization-role.command";
import {
  getOrganizationRoles,
  getOrganizationRoleDetail,
} from "@/modules/roles/services/organization-role.service";
import { getPermissionMatrix } from "@/modules/roles/services/permission-matrix.service";
import { PERMISSIONS, SYSTEM_ROLES } from "@/server/auth/permissions";
import { parsePermissionCode } from "@/server/auth/permission-codec";
import type { ServiceContext } from "@/shared/types/common";

// =============================================================================
// Helpers
// =============================================================================

function assert(condition: boolean, message: string): void {
  if (!condition) {
    console.error(`  ✗ FAIL: ${message}`);
    process.exitCode = 1;
  } else {
    console.log(`  ✓ PASS: ${message}`);
  }
}

async function assertRejects(promise: Promise<unknown>, message: string): Promise<void> {
  try {
    await promise;
    console.error(`  ✗ FAIL: ${message} (resolved instead of rejecting)`);
    process.exitCode = 1;
  } catch {
    console.log(`  ✓ PASS: ${message}`);
  }
}

// =============================================================================
// Fixture setup / teardown
// =============================================================================

interface Fixture {
  runId: string;
  orgA: { id: string };
  orgB: { id: string };
  orgATarget: { id: string };
  orgBTarget: { id: string };
  roleA: { id: string; name: string };
  roleB: { id: string; name: string };
  ctxA: ServiceContext;
}

async function setup(db: PrismaClient): Promise<Fixture> {
  const runId = Date.now().toString(36);
  const emailDomain = `tenant-iso-${runId}.test`;

  const orgAdminRole = await db.role.findFirstOrThrow({
    where: { organizationId: null, isSystem: true, name: SYSTEM_ROLES.ORG_ADMIN },
  });
  const studentRole = await db.role.findFirstOrThrow({
    where: { organizationId: null, isSystem: true, name: SYSTEM_ROLES.STUDENT },
  });

  const orgA = await db.organization.create({
    data: { name: `Tenant Iso Test A ${runId}`, slug: `tenant-iso-a-${runId}` },
  });
  const orgB = await db.organization.create({
    data: { name: `Tenant Iso Test B ${runId}`, slug: `tenant-iso-b-${runId}` },
  });

  const orgAAdmin = await db.user.create({
    data: { name: "Org A Admin", email: `org-a-admin@${emailDomain}`, isActive: true },
  });
  const orgATarget = await db.user.create({
    data: { name: "Org A Target", email: `org-a-target@${emailDomain}`, isActive: true },
  });
  const orgBTarget = await db.user.create({
    data: { name: "Org B Target", email: `org-b-target@${emailDomain}`, isActive: true },
  });

  await db.userOrganization.createMany({
    data: [
      { userId: orgAAdmin.id, organizationId: orgA.id, isOwner: true },
      { userId: orgATarget.id, organizationId: orgA.id },
      { userId: orgBTarget.id, organizationId: orgB.id },
    ],
  });

  await db.userRole.createMany({
    data: [
      { userId: orgAAdmin.id, roleId: orgAdminRole.id, organizationId: orgA.id },
      { userId: orgATarget.id, roleId: studentRole.id, organizationId: orgA.id },
      { userId: orgBTarget.id, roleId: studentRole.id, organizationId: orgB.id },
    ],
  });

  const roleA = await db.role.create({
    data: {
      organizationId: orgA.id,
      name: "Recepcionista A",
      code: `RECEPCIONISTA_A_${runId}`.toUpperCase(),
      isSystem: false,
      status: "ACTIVE",
    },
  });
  const roleB = await db.role.create({
    data: {
      organizationId: orgB.id,
      name: "Recepcionista B",
      code: `RECEPCIONISTA_B_${runId}`.toUpperCase(),
      isSystem: false,
      status: "ACTIVE",
    },
  });

  const studentsRead = await db.permission.findFirstOrThrow({
    where: parsePermissionCode(PERMISSIONS.STUDENTS_READ),
  });
  const studentsCreate = await db.permission.findFirstOrThrow({
    where: parsePermissionCode(PERMISSIONS.STUDENTS_CREATE),
  });
  await db.rolePermission.createMany({
    data: [
      { roleId: roleA.id, permissionId: studentsRead.id },
      { roleId: roleB.id, permissionId: studentsCreate.id },
    ],
  });

  return {
    runId,
    orgA,
    orgB,
    orgATarget,
    orgBTarget,
    roleA,
    roleB,
    ctxA: { userId: orgAAdmin.id, organizationId: orgA.id },
  };
}

async function teardown(db: PrismaClient, f: Fixture): Promise<void> {
  const orgIds = [f.orgA.id, f.orgB.id];
  const emailDomain = `tenant-iso-${f.runId}.test`;

  // Queried by org/email scope (not a fixed id list) so any data a real
  // cross-tenant leak might have created during the run still gets cleaned up.
  const users = await db.user.findMany({
    where: { email: { endsWith: `@${emailDomain}` } },
    select: { id: true },
  });
  const roles = await db.role.findMany({
    where: { organizationId: { in: orgIds } },
    select: { id: true },
  });
  const userIds = users.map((u) => u.id);
  const roleIds = roles.map((r) => r.id);

  await db.auditLog.deleteMany({ where: { organizationId: { in: orgIds } } });
  await db.rolePermission.deleteMany({ where: { roleId: { in: roleIds } } });
  await db.userRole.deleteMany({ where: { organizationId: { in: orgIds } } });
  await db.userOrganization.deleteMany({ where: { organizationId: { in: orgIds } } });
  await db.role.deleteMany({ where: { id: { in: roleIds } } });
  await db.user.deleteMany({ where: { id: { in: userIds } } });
  await db.organization.deleteMany({ where: { id: { in: orgIds } } });

  console.log(
    `\nTeardown complete: removed ${roleIds.length} role(s), ${userIds.length} user(s), 2 organization(s).`
  );
}

// =============================================================================
// Scenarios
// =============================================================================

async function scenario1(f: Fixture): Promise<void> {
  console.log("\n── 1. AssignUserRoleCommand rejects a custom role from another organization ──");
  await assertRejects(
    new AssignUserRoleCommand({ userId: f.orgATarget.id, roleId: f.roleB.id }, f.ctxA).run(),
    "assigning Org B's custom role to an Org A user is rejected"
  );
}

async function scenario2(f: Fixture, db: PrismaClient): Promise<void> {
  console.log(
    "\n── 2. CreateOrganizationUserCommand rejects a custom role from another organization ──"
  );
  const email = `cross-tenant-create@tenant-iso-${f.runId}.test`;
  await assertRejects(
    new CreateOrganizationUserCommand(
      { name: "Cross Tenant", email, password: "password123", roleId: f.roleB.id },
      f.ctxA
    ).run(),
    "creating an Org A user with Org B's custom role is rejected"
  );
  const leaked = await db.user.findUnique({ where: { email } });
  assert(leaked === null, "no user row was created as a side effect of the rejected command");
}

async function scenario3(f: Fixture): Promise<void> {
  console.log(
    "\n── 3. UpdateRolePermissionsCommand cannot update a role from another organization ──"
  );
  await assertRejects(
    new UpdateRolePermissionsCommand({ roleId: f.roleB.id, permissionIds: [] }, f.ctxA).run(),
    "Org A's admin cannot rewrite Org B role's permissions"
  );
}

async function scenario4(f: Fixture, db: PrismaClient): Promise<void> {
  console.log(
    "\n── 4. ArchiveOrganizationRoleCommand cannot archive a role from another organization ──"
  );
  await assertRejects(
    new ArchiveOrganizationRoleCommand({ roleId: f.roleB.id }, f.ctxA).run(),
    "Org A's admin cannot archive Org B's role"
  );
  const roleBCheck = await db.role.findUniqueOrThrow({ where: { id: f.roleB.id } });
  assert(roleBCheck.status === "ACTIVE", "Org B's role status is untouched (still ACTIVE)");
}

async function scenario5(f: Fixture, db: PrismaClient): Promise<void> {
  console.log(
    "\n── 5. DuplicateOrganizationRoleCommand cannot duplicate another organization's custom role ──"
  );
  const stolenCode = `STOLEN_COPY_${f.runId}`.toUpperCase();
  await assertRejects(
    new DuplicateOrganizationRoleCommand(
      { sourceRoleId: f.roleB.id, name: "Stolen Copy", code: stolenCode },
      f.ctxA
    ).run(),
    "Org A's admin cannot duplicate Org B's role into their own organization"
  );
  const leaked = await db.role.findFirst({ where: { organizationId: f.orgA.id, code: stolenCode } });
  assert(leaked === null, "no role row was created in Org A as a side effect");
}

async function scenario6(f: Fixture): Promise<void> {
  console.log(
    "\n── 6. RemoveUserRoleCommand cannot remove an assignment from another organization ──"
  );
  await assertRejects(
    new RemoveUserRoleCommand({ userId: f.orgBTarget.id }, f.ctxA).run(),
    "Org A's admin cannot remove Org B user's role assignment"
  );
}

async function scenario7(f: Fixture): Promise<void> {
  console.log(
    "\n── 7. Role list only returns roles for the active organization + allowed system roles ──"
  );
  const list = await getOrganizationRoles(f.orgA.id, { page: 1, pageSize: 100 });
  const ids = list.data.map((r) => r.id);
  const names = list.data.map((r) => r.name);

  assert(ids.includes(f.roleA.id), "Org A's own custom role is present in Org A's list");
  assert(!ids.includes(f.roleB.id), "Org B's custom role is absent from Org A's list");
  for (const sys of [
    SYSTEM_ROLES.ORG_ADMIN,
    SYSTEM_ROLES.SECRETARY,
    SYSTEM_ROLES.TEACHER,
    SYSTEM_ROLES.STUDENT,
  ]) {
    assert(names.includes(sys), `system role ${sys} is visible to every organization`);
  }
  assert(!names.includes(SYSTEM_ROLES.SUPER_ADMIN), "SUPER_ADMIN is never listed for an organization");
}

async function scenario8(f: Fixture): Promise<void> {
  console.log("\n── 8. Role detail rejects a cross-tenant roleId ──");
  const detail = await getOrganizationRoleDetail(f.roleB.id, f.orgA.id);
  assert(detail === null, "fetching Org B's role with Org A's organizationId returns null");
}

async function scenario9(f: Fixture, db: PrismaClient): Promise<void> {
  console.log("\n── 9. The permission matrix flow never mutates global Permission records ──");
  const before = await db.permission.findMany({
    select: { id: true, module: true, action: true },
    orderBy: { id: "asc" },
  });

  // A legitimate same-organization permission update, plus a matrix read.
  const studentsUpdate = await db.permission.findFirstOrThrow({
    where: parsePermissionCode(PERMISSIONS.STUDENTS_UPDATE),
  });
  await new UpdateRolePermissionsCommand(
    { roleId: f.roleA.id, permissionIds: [studentsUpdate.id] },
    f.ctxA
  ).run();
  await getPermissionMatrix(f.roleA.id);

  const after = await db.permission.findMany({
    select: { id: true, module: true, action: true },
    orderBy: { id: "asc" },
  });
  assert(before.length === after.length, "the global Permission catalog row count is unchanged");
  assert(
    JSON.stringify(before) === JSON.stringify(after),
    "no Permission row's id/module/action was mutated"
  );
}

async function scenario10(f: Fixture, db: PrismaClient): Promise<void> {
  console.log(
    "\n── 10. ORG_ADMIN from Org A cannot manage Org B's roles (full command pipeline) ──"
  );
  const originalName = f.roleB.name;
  await assertRejects(
    new UpdateOrganizationRoleCommand({ roleId: f.roleB.id, name: "Hijacked Name" }, f.ctxA).run(),
    "Org A's ORG_ADMIN cannot rename Org B's role"
  );
  const roleBCheck = await db.role.findUniqueOrThrow({ where: { id: f.roleB.id } });
  assert(roleBCheck.name === originalName, "Org B's role name is unchanged after the rejected attempt");
}

// =============================================================================
// Entry point
// =============================================================================

async function main(): Promise<void> {
  const db = await getDb();
  let fixture: Fixture | undefined;

  try {
    fixture = await setup(db);

    await scenario1(fixture);
    await scenario2(fixture, db);
    await scenario3(fixture);
    await scenario4(fixture, db);
    await scenario5(fixture, db);
    await scenario6(fixture);
    await scenario7(fixture);
    await scenario8(fixture);
    await scenario9(fixture, db);
    await scenario10(fixture, db);

    const exitCode = process.exitCode ?? 0;
    console.log(
      exitCode === 0
        ? "\n✓ All scenarios passed — no cross-tenant leak detected."
        : "\n✗ One or more scenarios FAILED — review output above."
    );
  } finally {
    if (fixture) await teardown(db, fixture);
    await db.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
