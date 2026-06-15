import { randomUUID } from "crypto";
import { getDb } from "@/server/db";
import { ALL_CHECKS } from "@/modules/finance/integrity/services/integrity-checks.service";
import { upsertOpenIssue } from "@/modules/finance/integrity/repositories/integrity-issue.repository";
import type {
  FinancialIntegrityJobResult,
  OrgIntegrityReport,
  CategoryCheckResult,
  DetectedIssue,
} from "@/modules/finance/integrity/types";
import { IntegrityIssueCategory } from "@/shared/types/common";

// =============================================================================
// OPTIONS
// =============================================================================

export interface RunFinancialIntegrityJobOptions {
  /** Restrict run to a single organization (dev / manual trigger). */
  organizationId?: string;
  /**
   * Which check categories to run. Defaults to ALL_CHECKS.
   * Useful for targeted re-runs after a known fix.
   */
  categories?: IntegrityIssueCategory[];
}

// =============================================================================
// JOB ENTRY POINT
// =============================================================================

export async function runDailyFinancialIntegrityJob(
  options?: RunFinancialIntegrityJobOptions
): Promise<FinancialIntegrityJobResult> {
  const jobRunId = randomUUID();
  const startedAt = new Date();

  const db = await getDb();

  const orgs = await db.organization.findMany({
    where: {
      ...(options?.organizationId ? { id: options.organizationId } : {}),
      status: { notIn: ["CANCELLED"] },
      deletedAt: null,
    },
    select: { id: true },
  });

  const checksToRun = options?.categories
    ? ALL_CHECKS.filter((c) => options.categories!.includes(c.category))
    : ALL_CHECKS;

  const orgReports: OrgIntegrityReport[] = [];
  const errors: Array<{ organizationId: string; error: string }> = [];
  let totalNew = 0;
  let totalReconfirmed = 0;
  let totalIssues = 0;
  let totalCritical = 0;
  let totalHigh = 0;
  let totalMedium = 0;
  let totalLow = 0;
  let processed = 0;
  let skipped = 0;

  for (const org of orgs) {
    const orgStart = Date.now();
    const orgId = org.id;
    const categoryResults: CategoryCheckResult[] = [];
    let orgError: string | undefined;
    let orgIssues = 0;
    let orgCritical = 0;
    let orgHigh = 0;
    let orgMedium = 0;
    let orgLow = 0;

    try {
      for (const { category, run } of checksToRun) {
        const checkStart = Date.now();
        let issues: DetectedIssue[] = [];
        let checkError: string | undefined;
        let newCount = 0;
        let reconfirmedCount = 0;

        try {
          issues = await run(db, orgId);

          for (const issue of issues) {
            const { isNew } = await upsertOpenIssue(orgId, issue, jobRunId);
            if (isNew) {
              newCount++;
              totalNew++;
            } else {
              reconfirmedCount++;
              totalReconfirmed++;
            }

            // Tally severities
            switch (issue.severity) {
              case "CRITICAL": orgCritical++; totalCritical++; break;
              case "HIGH":     orgHigh++;     totalHigh++;     break;
              case "MEDIUM":   orgMedium++;   totalMedium++;   break;
              case "LOW":      orgLow++;      totalLow++;      break;
            }
          }
        } catch (err) {
          checkError = (err as Error).message;
        }

        const issuesFound = issues.length;
        orgIssues += issuesFound;
        totalIssues += issuesFound;

        categoryResults.push({
          category,
          issuesFound,
          newIssues: newCount,
          reconfirmedIssues: reconfirmedCount,
          durationMs: Date.now() - checkStart,
          error: checkError,
        });
      }

      processed++;
    } catch (err) {
      orgError = (err as Error).message;
      errors.push({ organizationId: orgId, error: orgError });
      skipped++;
    }

    orgReports.push({
      organizationId: orgId,
      totalIssues: orgIssues,
      criticalCount: orgCritical,
      highCount: orgHigh,
      mediumCount: orgMedium,
      lowCount: orgLow,
      categories: categoryResults,
      durationMs: Date.now() - orgStart,
      error: orgError,
    });
  }

  const completedAt = new Date();

  // Persist audit record for every run
  try {
    await db.auditLog.create({
      data: {
        organizationId: null,
        actorId: null,
        entity: "FinancialIntegrityJob",
        entityId: jobRunId,
        action:
          errors.length > 0
            ? "financial_integrity_job.completed_with_errors"
            : "financial_integrity_job.completed",
        newValues: JSON.stringify({
          jobRunId,
          startedAt: startedAt.toISOString(),
          completedAt: completedAt.toISOString(),
          organizationsProcessed: processed,
          organizationsSkipped: skipped,
          totalIssuesDetected: totalIssues,
          totalNewIssues: totalNew,
          totalReconfirmedIssues: totalReconfirmed,
          criticalCount: totalCritical,
          highCount: totalHigh,
          mediumCount: totalMedium,
          lowCount: totalLow,
          errorCount: errors.length,
        }),
      },
    });
  } catch {
    // Audit log failure must never abort or alter the job result.
  }

  return {
    jobRunId,
    startedAt,
    completedAt,
    organizationsProcessed: processed,
    organizationsSkipped: skipped,
    totalIssuesDetected: totalIssues,
    totalNewIssues: totalNew,
    totalReconfirmedIssues: totalReconfirmed,
    criticalCount: totalCritical,
    highCount: totalHigh,
    mediumCount: totalMedium,
    lowCount: totalLow,
    orgs: orgReports,
    errors,
  };
}
