import { getDb } from "@/server/db";

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

  const [atRisk, pending, submitted, failedThisMonth] = await Promise.all([
    // distinct students with at least one FAILED subject
    db.studentSubjectProgress.groupBy({
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
  ]);

  return {
    atRiskStudentCount: atRisk.length,
    pendingGradingCount: pending,
    pendingSubmissionCount: submitted,
    failedThisMonth,
  };
}
