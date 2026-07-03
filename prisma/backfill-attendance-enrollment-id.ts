import "dotenv/config";
import { getDb } from "../src/server/db";
import {
  getAttendanceEnrollmentBackfillReport,
  scanAttendanceEnrollmentBackfill,
} from "../src/modules/attendance/services/attendance-enrollment-backfill-report.service";

// =============================================================================
// ATTENDANCE ENGINE — PHASE 2 enrollmentId BACKFILL RUNNER
//
// Operator-trusted CLI. It shares the exact resolution + guarded-update logic
// used by BackfillAttendanceRecordEnrollmentIdCommand (via the scan service), so
// there is a single source of truth.
//
// Behaviour-neutral: only fills AttendanceRecord.enrollmentId. Does NOT write
// attendancePercentage, touch summaries, or activate INCOMPLETE.
//
// Usage:
//   pnpm db:backfill-attendance-enrollment-id                 # dry run, all orgs (report only)
//   pnpm db:backfill-attendance-enrollment-id -- --apply      # actually fill unambiguous rows
//   pnpm db:backfill-attendance-enrollment-id -- --org=<id>   # single organization
//   pnpm db:backfill-attendance-enrollment-id -- --batch=1000 # batch size
//
// Safe to run repeatedly (idempotent). Ambiguous / unresolved rows are reported,
// never guessed. Enforce NOT NULL only once every org reports 0 nullable rows.
// =============================================================================

function parseArgs(argv: string[]) {
  const apply = argv.includes("--apply");
  const orgArg = argv.find((a) => a.startsWith("--org="));
  const batchArg = argv.find((a) => a.startsWith("--batch="));
  return {
    apply,
    organizationId: orgArg ? orgArg.slice("--org=".length) : null,
    batchSize: batchArg ? Number(batchArg.slice("--batch=".length)) : undefined,
  };
}

async function main() {
  const { apply, organizationId, batchSize } = parseArgs(process.argv.slice(2));
  const db = await getDb();

  const orgs = organizationId
    ? [{ id: organizationId, name: organizationId }]
    : await db.organization.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } });

  console.log(
    `\n=== Attendance enrollmentId backfill — ${apply ? "APPLY" : "DRY RUN (report only)"} ` +
      `across ${orgs.length} organization(s) ===\n`
  );

  const grand = { nullable: 0, resolvable: 0, updated: 0, ambiguous: 0, unresolved: 0 };

  for (const org of orgs) {
    const result = apply
      ? await scanAttendanceEnrollmentBackfill(org.id, { apply: true, batchSize })
      : { ...(await getAttendanceEnrollmentBackfillReport(org.id, { batchSize })), updatedRecords: 0 };

    if (result.totalAttendanceRecords === 0) continue;

    grand.nullable += result.nullableEnrollmentRecords;
    grand.resolvable += result.resolvableRecords;
    grand.updated += result.updatedRecords;
    grand.ambiguous += result.ambiguousRecords;
    grand.unresolved += result.unresolvedRecords;

    console.log(`— ${org.name} (${org.id})`);
    console.log(`    total records ............ ${result.totalAttendanceRecords}`);
    console.log(`    already filled ........... ${result.filledEnrollmentRecords}`);
    console.log(`    needing backfill ......... ${result.nullableEnrollmentRecords}`);
    console.log(`    resolvable ............... ${result.resolvableRecords}`);
    if (apply) console.log(`    updated .................. ${result.updatedRecords}`);
    console.log(`    ambiguous ................ ${result.ambiguousRecords}`);
    console.log(`    unresolved ............... ${result.unresolvedRecords}`);
    if (result.sampleAmbiguousRows.length > 0) {
      console.log(`    sample ambiguous:`);
      for (const s of result.sampleAmbiguousRows.slice(0, 5)) {
        console.log(`      record ${s.recordId} student ${s.studentId} — ${s.reason} [${(s.candidateIds ?? []).join(", ")}]`);
      }
    }
    if (result.sampleUnresolvedRows.length > 0) {
      console.log(`    sample unresolved:`);
      for (const s of result.sampleUnresolvedRows.slice(0, 5)) {
        console.log(`      record ${s.recordId} student ${s.studentId} — ${s.reason}`);
      }
    }
    console.log("");
  }

  console.log("=== TOTAL ===");
  console.log(`  needing backfill : ${grand.nullable}`);
  console.log(`  resolvable       : ${grand.resolvable}`);
  if (apply) console.log(`  updated          : ${grand.updated}`);
  console.log(`  ambiguous        : ${grand.ambiguous}`);
  console.log(`  unresolved       : ${grand.unresolved}`);

  const remaining = apply ? grand.nullable - grand.updated : grand.nullable;
  if (remaining === 0 && grand.ambiguous === 0 && grand.unresolved === 0) {
    console.log(`\n✅ Zero nullable rows remain. Safe to enforce NOT NULL (see docs/attendance-engine.md).`);
  } else {
    console.log(
      `\n⚠️  ${apply ? remaining : grand.nullable} row(s) still nullable ` +
        `(${grand.ambiguous} ambiguous, ${grand.unresolved} unresolved). ` +
        `Resolve these before enforcing NOT NULL.`
    );
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
