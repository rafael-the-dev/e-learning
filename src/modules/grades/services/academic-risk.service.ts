import { getDb } from "@/server/db";
import { getStudentRiskDimensionAtRiskCounts } from "@/modules/students/repositories/student-risk-projection.repository";
import { getStudentRiskProjectionCoverage } from "@/modules/students/services/student-risk-projection-coverage.service";

export interface AcademicRiskStats {
  atRiskStudentCount: number;
  pendingGradingCount: number;
  pendingSubmissionCount: number;
  failedThisMonth: number;
}

export async function getAcademicRiskStats(organizationId: string): Promise<AcademicRiskStats> {
  const db = await getDb();

  const firstOfMonth = new Date();
  firstOfMonth.setDate(1);
  firstOfMonth.setHours(0, 0, 0, 0);

  // M11.3: the at-risk classification comes from the canonical projection once backfilled
  // (academic dimension = the SAME decision Student 360 shows); legacy FAILED-subject
  // distinct count as the fallback. The operational assessment counts stay as-is.
  const covered = (await getStudentRiskProjectionCoverage({ organizationId })).ready;

  const [atRisk, pending, submitted, failedThisMonth, projectionDimensions] = await Promise.all([
    // distinct students with at least one FAILED subject (fallback only)
    covered
      ? Promise.resolve<Array<{ studentId: string }>>([])
      : db.studentSubjectProgress.groupBy({
          by: ["studentId"],
          where: { organizationId, status: "FAILED" },
          _count: { _all: true },
        }),
    db.studentAssessmentResult.count({ where: { organizationId, status: "DRAFT" } }),
    db.studentAssessmentResult.count({ where: { organizationId, status: "SUBMITTED" } }),
    db.studentSubjectProgress.count({
      where: {
        organizationId,
        status: "FAILED",
        updatedAt: { gte: firstOfMonth },
      },
    }),
    covered
      ? getStudentRiskDimensionAtRiskCounts(organizationId, { financeAuthorized: true })
      : Promise.resolve(null),
  ]);

  return {
    atRiskStudentCount: projectionDimensions ? projectionDimensions.academic : atRisk.length,
    pendingGradingCount: pending,
    pendingSubmissionCount: submitted,
    failedThisMonth,
  };
}
