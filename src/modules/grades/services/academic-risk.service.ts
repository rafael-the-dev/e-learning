import { getDb } from "@/server/db";
import { getStudentRiskDimensionAtRiskCounts } from "@/modules/students/repositories/student-risk-projection.repository";
import {
  resolveRiskProjectionReadiness,
  availableRiskMetric,
  unavailableRiskMetric,
  type RiskMetric,
} from "@/modules/students/services/risk-projection-readiness.service";

export interface AcademicRiskStats {
  // F-M8: canonical academic-risk count — UNAVAILABLE (never a legacy FAILED-subject count,
  // never a 0 that reads as "none at risk") when the projection is not ready.
  atRiskStudentCount: RiskMetric<number>;
  pendingGradingCount: number;
  pendingSubmissionCount: number;
  failedThisMonth: number;
}

export async function getAcademicRiskStats(organizationId: string): Promise<AcademicRiskStats> {
  const db = await getDb();

  const firstOfMonth = new Date();
  firstOfMonth.setDate(1);
  firstOfMonth.setHours(0, 0, 0, 0);

  // F-M8: the at-risk classification comes ONLY from the canonical projection (academic
  // dimension = the SAME decision Student 360 shows). No legacy fallback. The operational
  // assessment counts (pending grading / submission / failed this month) stay as-is.
  const readiness = await resolveRiskProjectionReadiness({ organizationId });

  const [pending, submitted, failedThisMonth] = await Promise.all([
    db.studentAssessmentResult.count({ where: { organizationId, status: "DRAFT" } }),
    db.studentAssessmentResult.count({ where: { organizationId, status: "SUBMITTED" } }),
    db.studentSubjectProgress.count({
      where: {
        organizationId,
        status: "FAILED",
        updatedAt: { gte: firstOfMonth },
      },
    }),
  ]);

  const atRiskStudentCount: RiskMetric<number> = readiness.ready
    ? availableRiskMetric(
        (await getStudentRiskDimensionAtRiskCounts(organizationId, { financeAuthorized: true })).academic,
        readiness.verifiedAt
      )
    : unavailableRiskMetric(readiness);

  return {
    atRiskStudentCount,
    pendingGradingCount: pending,
    pendingSubmissionCount: submitted,
    failedThisMonth,
  };
}
