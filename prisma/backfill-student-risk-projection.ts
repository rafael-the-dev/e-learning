import "dotenv/config";
import { getDb } from "../src/server/db";
import {
  reconcileStudentRiskProjectionsForOrg,
  countStudentsForOrg,
  type ReconcileMode,
} from "../src/modules/students/services/student-risk-projection.service";

// =============================================================================
// M11.4 / F-H3 — STUDENT RISK PROJECTION BACKFILL / RECONCILIATION RUNNER
//
// Operator-trusted CLI. Shares the exact recompute path used everywhere else
// (reconcileStudentRiskProjectionsForOrg → recalculateStudentRiskProjection → the
// H6 engine), so there is a single source of truth for the classification.
//
// Idempotent and safe to run repeatedly. Run with --all once per org after the
// migration and BEFORE releasing the dashboard flip, so no dashboard shows a false
// "zero at risk". The scheduled daily job (reconcile-risk-projections) does the same
// --all sweep automatically; this CLI is for the initial backfill and targeted repairs.
//
// Modes (mutually exclusive; --all is the default):
//   --all            recompute EVERY eligible student; the ONLY mode that updates the
//                    coverage rollout state (READY/INCOMPLETE).
//   --missing        recompute only eligible students with NO projection row (targeted).
//   --version-stale  recompute only students whose row is on an OLDER rules version
//                    (after a STUDENT_RISK_SOURCE_VERSION bump). NOT factual-drift detection.
//                    (kept as `--stale` alias for back-compat.)
//
// Usage:
//   pnpm db:backfill-student-risk-projection                       # dry run, all orgs (report only)
//   pnpm db:backfill-student-risk-projection -- --apply            # --all recompute + persist
//   pnpm db:backfill-student-risk-projection -- --apply --missing  # only students lacking a row
//   pnpm db:backfill-student-risk-projection -- --apply --version-stale
//   pnpm db:backfill-student-risk-projection -- --apply --org=<id> --batch=1000
// =============================================================================

function parseMode(argv: string[]): ReconcileMode {
  if (argv.includes("--missing")) return "missing";
  if (argv.includes("--version-stale") || argv.includes("--stale")) return "version-stale";
  return "all";
}

function parseArgs(argv: string[]) {
  return {
    apply: argv.includes("--apply"),
    mode: parseMode(argv),
    organizationId: argv.find((a) => a.startsWith("--org="))?.slice("--org=".length) ?? null,
    batchSize: argv.find((a) => a.startsWith("--batch="))
      ? Number(argv.find((a) => a.startsWith("--batch="))!.slice("--batch=".length))
      : undefined,
  };
}

async function main() {
  const { apply, mode, organizationId, batchSize } = parseArgs(process.argv.slice(2));
  const db = await getDb();

  const orgs = organizationId
    ? [{ id: organizationId, name: organizationId }]
    : await db.organization.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } });

  console.log(
    `\n=== Student risk projection backfill — ${apply ? "APPLY" : "DRY RUN (report only)"}` +
      ` [mode: ${mode}] across ${orgs.length} organization(s) ===\n`
  );

  const grand = { processed: 0, changed: 0, failed: 0 };

  for (const org of orgs) {
    if (!apply) {
      // Dry run reports the eligible-student count (the --all scope); targeted modes only
      // ever process a subset of it.
      const students = await countStudentsForOrg(org.id);
      if (students === 0) continue;
      grand.processed += students;
      console.log(`— ${org.name} (${org.id})`);
      console.log(`    eligible students ........ ${students}${mode === "all" ? "" : ` (${mode} processes a subset)`}`);
      console.log("");
      continue;
    }

    const result = await reconcileStudentRiskProjectionsForOrg(org.id, { mode, batchSize });
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
        ? `\n✅ Reconcile complete (mode: ${mode}).${mode === "all" ? " Coverage rollout state updated per org." : ""}`
        : `\n⚠️  ${grand.failed} student(s) failed to recompute — review the errors above and re-run.`
    );
  } else {
    console.log(`\nℹ️  Dry run only. Re-run with --apply to recompute and persist.`);
  }

  // Non-zero exit on partial failure so a CI/cron wrapper can detect it.
  process.exitCode = grand.failed > 0 ? 1 : 0;
}

main()
  .then(() => process.exit(process.exitCode ?? 0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
