import "dotenv/config";
import { getDb } from "../src/server/db";

// =============================================================================
// ONE-OFF BACKFILL: Role.code
// Run once after the add_role_code_and_status migration, before applying the
// add_role_code_unique_constraint migration.
// Run with: pnpm db:backfill-role-codes
// =============================================================================

const COMBINING_DIACRITICS = new RegExp("[\\u0300-\\u036f]", "g");

function slugifyToCode(name: string): string {
  return name
    .normalize("NFD")
    .replace(COMBINING_DIACRITICS, "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

async function main() {
  const db = await getDb();

  console.log("Backfilling system role codes...");
  const systemRoles = await db.role.findMany({
    where: { organizationId: null, isSystem: true },
  });
  for (const role of systemRoles) {
    await db.role.update({ where: { id: role.id }, data: { code: role.name } });
    console.log(`  ✓ ${role.name} -> code=${role.name}`);
  }

  console.log("Backfilling custom role codes...");
  const customRoles = await db.role.findMany({
    where: { organizationId: { not: null }, isSystem: false },
  });
  const usedCodesByOrg = new Map<string, Set<string>>();
  for (const role of customRoles) {
    const orgId = role.organizationId as string;
    const used = usedCodesByOrg.get(orgId) ?? new Set<string>();
    let base = slugifyToCode(role.name);
    if (!base) base = "ROLE";
    let code = base;
    let suffix = 2;
    while (used.has(code)) {
      code = `${base}_${suffix}`;
      suffix += 1;
    }
    used.add(code);
    usedCodesByOrg.set(orgId, used);
    await db.role.update({ where: { id: role.id }, data: { code } });
    console.log(`  ✓ "${role.name}" (org ${orgId}) -> code=${code}`);
  }

  console.log(
    `Backfill complete: ${systemRoles.length} system roles, ${customRoles.length} custom roles.`
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
