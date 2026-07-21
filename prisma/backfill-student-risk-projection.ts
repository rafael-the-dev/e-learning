import "dotenv/config";
import { getDb } from "../src/server/db";
import {
  reconcileStudentRiskProjectionsForOrg,
  countStudentsForOrg,
} from "../src/modules/students/services/student-risk-projection.service";

// =============================================================================
// M11.4 — STUDENT RISK PROJECTION BACKFILL / RECONCILIATION RUNNER
//
// Operator-trusted CLI. Shares the exact recompute path used everywhere else
// (reconcileStudentRiskProjectionsForOrg → recalculateStudentRiskProjection → the
// H6 engine), so there is a single source of truth for the classification.
//
// Idempotent and safe to run repeatedly: a student whose classification is
// unchanged is a no-op. Run this ONCE per org after deploying the migration and
// BEFORE releasing the dashboard flip (M11.3), so no dashboard shows a false
// "zero at risk". Re-run (or schedule) with --stale after a rules-version bump.
//
// Usage:
//   pnpm db:backfill-student-risk-projection                 # dry run, all orgs (report only)
//   pnpm db:backfill-student-risk-projection -- --apply      # recompute + persist every student
//   pnpm db:backfill-student-risk-projection -- --org=<id>   # single organization
//   pnpm db:backfill-student-risk-projection -- --apply --stale   # only rows on an old rules version
//   pnpm db:backfill-student-risk-projection -- --apply --batch=1000
// =============================================================================

function parseArgs(argv: string[]) {
  return {
    apply: argv.includes("--apply"),
    staleOnly: argv.includes("--stale"),
    organizationId: argv.find((a) => a.startsWith("--org="))?.slice("--org=".length) ?? null,
    batchSize: argv.find((a) => a.startsWith("--batch="))
      ? Number(argv.find((a) => a.startsWith("--batch="))!.slice("--batch=".length))
      : undefined,
  };
}

async function main() {
  const { apply, staleOnly, organizationId, batchSize } = parseArgs(process.argv.slice(2));
  const db = await getDb();

  const orgs = organizationId
    ? [{ id: organizationId, name: organizationId }]
    : await db.organization.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } });

  console.log(
    `\n=== Student risk projection backfill — ${apply ? "APPLY" : "DRY RUN (report only)"}` +
      `${staleOnly ? " [stale-version only]" : ""} across ${orgs.length} organization(s) ===\n`
  );

  const grand = { processed: 0, changed: 0, failed: 0 };

  for (const org of orgs) {
    if (!apply) {
      const students = await countStudentsForOrg(org.id);
      if (students === 0) continue;
      grand.processed += students;
      console.log(`— ${org.name} (${org.id})`);
      console.log(`    students to recompute .... ${students}`);
      console.log("");
      continue;
    }

    const result = await reconcileStudentRiskProjectionsForOrg(org.id, { staleOnly, batchSize });
    if (result.processed === 0) continue;

    grand.processed += result.processed;
    grand.changed += result.changed;
    grand.failed += result.failed;

    console.log(`— ${org.name} (${org.id})`);
    console.log(`    processed ................ ${result.processed}`);
    console.log(`    changed (written) ........ ${result.changed}`);
    console.log(`    failed ................... ${result.failed}`);
    for (const f of result.failures.slice(0, 5)) {
      console.log(`      ✗ student ${f.studentId} — ${f.error}`);
    }
    console.log("");
  }

  console.log("=== TOTAL ===");
  console.log(`  processed : ${grand.processed}`);
  if (apply) {
    console.log(`  changed   : ${grand.changed}`);
    console.log(`  failed    : ${grand.failed}`);
    console.log(
      grand.failed === 0
        ? `\n✅ Backfill complete. Dashboards can safely read the projection for these orgs.`
        : `\n⚠️  ${grand.failed} student(s) failed to recompute — review the errors above and re-run.`
    );
  } else {
    console.log(`\nℹ️  Dry run only. Re-run with --apply to recompute and persist.`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
