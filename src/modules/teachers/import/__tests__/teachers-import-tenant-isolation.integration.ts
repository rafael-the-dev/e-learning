/**
 * Teachers Import — Tenant Isolation Integration Test Script
 * =============================================================
 * Proves that the import validate -> execute pipeline, and the staged
 * ImportJob data it relies on, cannot cross organization boundaries.
 * Runs the real Commands and repositories (no mocks) against a live
 * SQL Server database. Mirrors students-import-tenant-isolation.integration.ts.
 *
 * Prerequisites
 * -------------
 * 1. Set DATABASE_URL to a live SQL Server connection string.
 * 2. Run `pnpm db:seed` at least once (system roles + permission catalog,
 *    including teachers.import, must already exist).
 *
 * Run
 * ---
 *   npx tsx src/modules/teachers/import/__tests__/teachers-import-tenant-isolation.integration.ts
 *
 * Scenarios
 * ---------
 *  1. Full validate -> execute pipeline for Org A creates a teacher scoped
 *     to Org A, with audit entries scoped to Org A.
 *  2. Org B's admin cannot execute Org A's import job; no teacher leaks
 *     into Org B as a side effect.
 *  3. Org B cannot read Org A's import job via findImportJobById; Org A can.
 *  4. The in-DB documentNumber duplicate check is scoped per organization —
 *     a documentNumber already used in Org B does not block the same
 *     documentNumber for Org A.
 *  5. Org A's import audit trail is not visible when queried under Org B's
 *     organizationId.
 */

import "dotenv/config";
import type { PrismaClient } from "@prisma/client";
import { getDb } from "@/server/db";
import { ValidateTeachersImportCommand } from "@/modules/teachers/import/commands/validate-teachers-import.command";
import { ExecuteTeachersImportCommand } from "@/modules/teachers/import/commands/execute-teachers-import.command";
import { findImportJobById, getImportJobDetail } from "@/modules/import-jobs/repositories/import-job.repository";
import { SYSTEM_ROLES } from "@/server/auth/permissions";
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

const CSV_HEADER =
  "firstName,lastName,gender,birthDate,phone,email,documentType,documentNumber,address,specialization,hireDate,status";

function buildCsvBuffer(row: {
  firstName: string;
  lastName: string;
  email?: string;
  documentNumber: string;
}): Buffer {
  const line = [
    row.firstName,
    row.lastName,
    "FEMALE",
    "1985-01-15",
    "",
    row.email ?? "",
    "BI",
    row.documentNumber,
    "Maputo",
    "Condução",
    "2020-01-01",
    "ACTIVE",
  ].join(",");
  return Buffer.from(`${CSV_HEADER}\n${line}`, "utf-8");
}

// =============================================================================
// Fixture setup / teardown
// =============================================================================

interface Fixture {
  runId: string;
  orgA: { id: string };
  orgB: { id: string };
  ctxA: ServiceContext;
  ctxB: ServiceContext;
  emailDomain: string;
}

async function setup(db: PrismaClient): Promise<Fixture> {
  const runId = Date.now().toString(36);
  const emailDomain = `teachers-import-tenant-iso-${runId}.test`;

  const orgAdminRole = await db.role.findFirstOrThrow({
    where: { organizationId: null, isSystem: true, name: SYSTEM_ROLES.ORG_ADMIN },
  });

  const orgA = await db.organization.create({
    data: { name: `Teachers Import Tenant Iso A ${runId}`, slug: `teachers-import-tenant-iso-a-${runId}` },
  });
  const orgB = await db.organization.create({
    data: { name: `Teachers Import Tenant Iso B ${runId}`, slug: `teachers-import-tenant-iso-b-${runId}` },
  });

  const adminA = await db.user.create({
    data: { name: "Teachers Import Admin A", email: `admin-a@${emailDomain}`, isActive: true },
  });
  const adminB = await db.user.create({
    data: { name: "Teachers Import Admin B", email: `admin-b@${emailDomain}`, isActive: true },
  });

  await db.userOrganization.createMany({
    data: [
      { userId: adminA.id, organizationId: orgA.id, isOwner: true },
      { userId: adminB.id, organizationId: orgB.id, isOwner: true },
    ],
  });
  await db.userRole.createMany({
    data: [
      { userId: adminA.id, roleId: orgAdminRole.id, organizationId: orgA.id },
      { userId: adminB.id, roleId: orgAdminRole.id, organizationId: orgB.id },
    ],
  });

  return {
    runId,
    orgA,
    orgB,
    emailDomain,
    ctxA: { userId: adminA.id, organizationId: orgA.id },
    ctxB: { userId: adminB.id, organizationId: orgB.id },
  };
}

async function teardown(db: PrismaClient, f: Fixture): Promise<void> {
  const orgIds = [f.orgA.id, f.orgB.id];

  await db.auditLog.deleteMany({ where: { organizationId: { in: orgIds } } });
  await db.importJob.deleteMany({ where: { organizationId: { in: orgIds } } });
  await db.teacher.deleteMany({ where: { organizationId: { in: orgIds } } });
  await db.userRole.deleteMany({ where: { organizationId: { in: orgIds } } });
  await db.userOrganization.deleteMany({ where: { organizationId: { in: orgIds } } });

  const users = await db.user.findMany({
    where: { email: { endsWith: `@${f.emailDomain}` } },
    select: { id: true },
  });
  await db.user.deleteMany({ where: { id: { in: users.map((u) => u.id) } } });
  await db.organization.deleteMany({ where: { id: { in: orgIds } } });

  console.log(`\nTeardown complete: removed all fixture data for run ${f.runId}.`);
}

// =============================================================================
// Scenarios
// =============================================================================

async function scenario1(f: Fixture): Promise<{ jobId: string }> {
  console.log(
    "\n── 1. Full validate -> execute pipeline creates a teacher scoped to Org A ──"
  );
  const docNumber = `TENANTISO1-${f.runId}`;
  const buffer = buildCsvBuffer({
    firstName: "Professor",
    lastName: "TesteA",
    email: `professor-a@${f.emailDomain}`,
    documentNumber: docNumber,
  });

  const validation = await new ValidateTeachersImportCommand(
    { fileName: "professores.csv", fileSize: buffer.byteLength, buffer },
    f.ctxA
  ).run();
  assert(validation.validRows === 1, "row validates as VALID for Org A");

  const report = await new ExecuteTeachersImportCommand({ jobId: validation.jobId }, f.ctxA).run();
  assert(report.importedCount === 1, "1 teacher imported for Org A");

  const db = await getDb();
  const created = await db.teacher.findFirst({
    where: { organizationId: f.orgA.id, idNumber: docNumber },
  });
  assert(created !== null, "the created teacher is scoped to Org A's organizationId");
  assert(created?.status === "ACTIVE", "the created teacher defaults to status ACTIVE");

  const auditLogs = await db.auditLog.findMany({
    where: { organizationId: f.orgA.id, entity: "ImportJob", entityId: validation.jobId },
  });
  assert(
    auditLogs.some((l) => l.action === "import.job.created"),
    "import.job.created was audited under Org A"
  );
  assert(
    auditLogs.some((l) => l.action === "import.job.validated"),
    "import.job.validated was audited under Org A"
  );
  assert(
    auditLogs.some((l) => l.action === "import.job.processing"),
    "import.job.processing was audited under Org A"
  );
  assert(
    auditLogs.some((l) => l.action === "import.job.completed"),
    "import.job.completed was audited under Org A"
  );

  return { jobId: validation.jobId };
}

async function scenario2(f: Fixture): Promise<void> {
  console.log(
    "\n── 2. Org B cannot execute Org A's import job; no teacher leaks into Org B ──"
  );
  const docNumber = `TENANTISO2-${f.runId}`;
  const buffer = buildCsvBuffer({
    firstName: "Professor",
    lastName: "TesteA2",
    documentNumber: docNumber,
  });
  const validation = await new ValidateTeachersImportCommand(
    { fileName: "professores.csv", fileSize: buffer.byteLength, buffer },
    f.ctxA
  ).run();

  await assertRejects(
    new ExecuteTeachersImportCommand({ jobId: validation.jobId }, f.ctxB).run(),
    "Org B's admin cannot execute Org A's import job"
  );

  const db = await getDb();
  const leaked = await db.teacher.findFirst({
    where: { organizationId: f.orgB.id, idNumber: docNumber },
  });
  assert(leaked === null, "no teacher was created in Org B as a side effect");

  // Org A can still execute its own job afterwards — the rejected cross-tenant
  // attempt must not have mutated the job's status.
  const report = await new ExecuteTeachersImportCommand({ jobId: validation.jobId }, f.ctxA).run();
  assert(report.importedCount === 1, "Org A can still execute its own job after the rejected attempt");
}

async function scenario3(f: Fixture): Promise<void> {
  console.log("\n── 3. Org B cannot read Org A's import job; Org A can ──");
  const docNumber = `TENANTISO3-${f.runId}`;
  const buffer = buildCsvBuffer({
    firstName: "Professor",
    lastName: "TesteA3",
    documentNumber: docNumber,
  });
  const validation = await new ValidateTeachersImportCommand(
    { fileName: "professores.csv", fileSize: buffer.byteLength, buffer },
    f.ctxA
  ).run();

  const crossTenantRead = await findImportJobById(validation.jobId, f.orgB.id);
  assert(crossTenantRead === null, "Org B's organizationId cannot read Org A's import job");

  const sameTenantRead = await findImportJobById(validation.jobId, f.orgA.id);
  assert(sameTenantRead !== null, "Org A can read its own import job");

  const crossTenantDetail = await getImportJobDetail(validation.jobId, f.orgB.id);
  assert(crossTenantDetail === null, "Org B's organizationId cannot read Org A's import job via getImportJobDetail");

  const sameTenantDetail = await getImportJobDetail(validation.jobId, f.orgA.id);
  assert(sameTenantDetail !== null, "Org A can read its own import job via getImportJobDetail");
}

async function scenario4(f: Fixture, db: PrismaClient): Promise<void> {
  console.log(
    "\n── 4. documentNumber duplicate-in-DB check is scoped per organization ──"
  );
  const sharedDocNumber = `TENANTISO4-${f.runId}`;

  // Pre-seed a real teacher in Org B with this documentNumber.
  await db.teacher.create({
    data: {
      organizationId: f.orgB.id,
      firstName: "Existente",
      lastName: "EmOrgB",
      idNumber: sharedDocNumber,
      status: "ACTIVE",
    },
  });

  // The same documentNumber must validate cleanly for Org A.
  const buffer = buildCsvBuffer({
    firstName: "Professor",
    lastName: "TesteA4",
    documentNumber: sharedDocNumber,
  });
  const validation = await new ValidateTeachersImportCommand(
    { fileName: "professores.csv", fileSize: buffer.byteLength, buffer },
    f.ctxA
  ).run();
  assert(
    validation.validRows === 1 && validation.errorRows === 0,
    "a documentNumber already used in Org B does not block the same documentNumber for Org A"
  );
}

async function scenario5(f: Fixture, db: PrismaClient, orgAJobId: string): Promise<void> {
  console.log("\n── 5. Org A's import audit trail is not visible under Org B's scope ──");
  const crossTenantAudit = await db.auditLog.findFirst({
    where: { organizationId: f.orgB.id, entity: "ImportJob", entityId: orgAJobId },
  });
  assert(crossTenantAudit === null, "Org A's import audit entries do not appear under Org B's organizationId");
}

// =============================================================================
// Entry point
// =============================================================================

async function main(): Promise<void> {
  const db = await getDb();
  let fixture: Fixture | undefined;

  try {
    fixture = await setup(db);

    const { jobId } = await scenario1(fixture);
    await scenario2(fixture);
    await scenario3(fixture);
    await scenario4(fixture, db);
    await scenario5(fixture, db, jobId);

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
