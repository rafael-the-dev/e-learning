import "dotenv/config";
import type { ReconcileMode } from "../src/modules/students/services/student-risk-projection.service";
import {
  startReconcileRun,
  resumeReconcileRun,
  advanceReconcileRunsWithinBudget,
  resolveReconcileBatchSize,
} from "../src/modules/students/services/student-risk-projection-reconcile.service";
import { findReconcileRunById } from "../src/modules/students/repositories/student-risk-projection-reconcile.repository";

// =============================================================================
// M11 / F-H4 — STUDENT RISK PROJECTION RECONCILE RUNNER (resumable, cursor-based)
//
// Uses the run pipeline: a run pages by cursor, checkpoints per batch, and can pause
// on a batch budget and resume. Coverage READY is set only by a completed FULL ("all")
// run's verification. Safe to interrupt (Ctrl-C / timeout) and re-run.
//
// Modes (default --all): --all | --missing | --version-stale
// Args:
//   --organization <id>   start/advance a run for ONE organization
//   --batch-size <n>       clamped to [10, 500] (default 100)
//   --max-batches <n>      pause after N batches (budget); resume with --resume
//   --resume <runId>       continue an existing run instead of starting a new one
//   --status --resume <id> print a run's status/progress and exit (no processing)
//   (no --organization, no --resume) advance ALL orgs within budget (like the cron)
//
// Exit code: 0 = completed or intentionally paused · 1 = failed / invalid args /
// completed-with-errors.
// =============================================================================

function argValue(argv: string[], flag: string): string | null {
  const i = argv.indexOf(flag);
  return i >= 0 && i + 1 < argv.length ? argv[i + 1] : null;
}

function parseMode(argv: string[]): ReconcileMode {
  if (argv.includes("--missing")) return "missing";
  if (argv.includes("--version-stale") || argv.includes("--stale")) return "version-stale";
  return "all";
}

async function main(): Promise<number> {
  const argv = process.argv.slice(2);
  const mode = parseMode(argv);
  const organizationId = argValue(argv, "--organization") ?? argValue(argv, "--org");
  const resumeRunId = argValue(argv, "--resume");
  const statusOnly = argv.includes("--status");
  const batchSizeRaw = argValue(argv, "--batch-size") ?? argValue(argv, "--batch");
  const batchSize = batchSizeRaw != null ? resolveReconcileBatchSize(Number(batchSizeRaw)) : undefined;
  const maxBatchesRaw = argValue(argv, "--max-batches");
  const maxBatches = maxBatchesRaw != null ? Number(maxBatchesRaw) : undefined;

  if (maxBatches != null && (!Number.isFinite(maxBatches) || maxBatches <= 0)) {
    console.error("Invalid --max-batches (must be a positive number).");
    return 1;
  }

  // --status: report a run and exit without processing.
  if (statusOnly) {
    if (!resumeRunId) {
      console.error("--status requires --resume <runId>.");
      return 1;
    }
    const run = await findReconcileRunById(resumeRunId);
    if (!run) {
      console.error(`Run ${resumeRunId} not found.`);
      return 1;
    }
    console.log(JSON.stringify(
      {
        id: run.id, organizationId: run.organizationId, mode: run.mode, status: run.status,
        cursorStudentId: run.cursorStudentId, processed: run.processedCount, succeeded: run.succeededCount,
        skipped: run.skippedCount, failed: run.failedCount, batchSize: run.batchSize,
        startedAt: run.startedAt, lastCheckpointAt: run.lastCheckpointAt, completedAt: run.completedAt,
      },
      null,
      2
    ));
    return 0;
  }

  // Resume an existing run.
  if (resumeRunId) {
    const outcome = await resumeReconcileRun({ runId: resumeRunId, maxBatches });
    if (!outcome) {
      console.error(`Run ${resumeRunId} could not be acquired (held by another worker, or not resumable).`);
      return 1;
    }
    console.log(`Run ${outcome.runId} — ${outcome.status}: processed ${outcome.processed}, succeeded ${outcome.succeeded}, skipped ${outcome.skipped}, failed ${outcome.failed}.`);
    return outcome.status === "COMPLETED" || outcome.status === "PAUSED" ? 0 : 1;
  }

  // Start + advance a run for ONE organization.
  if (organizationId) {
    const run = await startReconcileRun({ organizationId, mode, batchSize });
    const outcome = await resumeReconcileRun({ runId: run.id, maxBatches });
    if (!outcome) {
      console.error(`Started run ${run.id} but could not acquire it.`);
      return 1;
    }
    console.log(`Run ${outcome.runId} [${mode}] org ${organizationId} — ${outcome.status}: processed ${outcome.processed}, succeeded ${outcome.succeeded}, skipped ${outcome.skipped}, failed ${outcome.failed}.`);
    if (outcome.status === "PAUSED") console.log(`  paused on budget — resume with: --resume ${outcome.runId}`);
    return outcome.status === "COMPLETED" || outcome.status === "PAUSED" ? 0 : 1;
  }

  // No org / no resume → advance all orgs within budget (like the cron).
  const result = await advanceReconcileRunsWithinBudget({ maxBatches });
  console.log(
    `Reconcile [${result.status}] — started ${result.runsStarted}, resumed ${result.runsResumed}, ` +
      `orgs completed ${result.organizationsCompleted}, students processed ${result.studentsProcessed}, ` +
      `failed ${result.studentsFailed}, remaining runs ${result.remainingRuns}.`
  );
  return result.status === "failed" || result.studentsFailed > 0 ? 1 : 0;
}

main()
  .then((code) => process.exit(code))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
