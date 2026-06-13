import { getDb } from "@/server/db";

export interface GradeInsightItem {
  id: string;
  message: string;
  severity: "info" | "warning" | "critical";
  linkHref?: string;
  linkLabel?: string;
}

export async function getGradeInsights(organizationId: string): Promise<GradeInsightItem[]> {
  const db = await getDb();

  const [draftCount, submittedCount, failedSubjectCount, highFailureSubjects, recentGradedCount] =
    await Promise.all([
      db.studentAssessmentResult.count({ where: { organizationId, status: "DRAFT" } }),
      db.studentAssessmentResult.count({ where: { organizationId, status: "SUBMITTED" } }),
      db.studentSubjectProgress.count({ where: { organizationId, status: "FAILED" } }),
      // subjects with high failure: group by levelSubjectId and count FAILEDs
      db.studentSubjectProgress.groupBy({
        by: ["levelSubjectId"],
        where: { organizationId, status: { in: ["PASSED", "FAILED"] } },
        _count: { _all: true },
        having: { levelSubjectId: { not: "" } },
      }),
      // grades classified in the last 7 days
      db.studentAssessmentResult.count({
        where: {
          organizationId,
          status: "GRADED",
          gradedAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
        },
      }),
    ]);

  // Compute high-failure subjects (>= 50% failure rate)
  const levelSubjectIds = highFailureSubjects.map((g) => g.levelSubjectId);
  const failedGroups = levelSubjectIds.length > 0
    ? await db.studentSubjectProgress.groupBy({
        by: ["levelSubjectId"],
        where: { organizationId, status: "FAILED", levelSubjectId: { in: levelSubjectIds } },
        _count: { _all: true },
      })
    : [];

  const failedMap = new Map(failedGroups.map((g) => [g.levelSubjectId, g._count._all]));
  const highFailureCount = highFailureSubjects.filter((g) => {
    const failed = failedMap.get(g.levelSubjectId) ?? 0;
    return g._count._all > 0 && failed / g._count._all >= 0.5;
  }).length;

  const insights: GradeInsightItem[] = [];

  if (draftCount > 0) {
    insights.push({
      id: "draft",
      message: `${draftCount.toLocaleString("pt-PT")} nota(s) em rascunho por classificar`,
      severity: draftCount > 20 ? "critical" : "warning",
      linkHref: "/grades?status=DRAFT",
      linkLabel: "Ver rascunhos",
    });
  }

  if (submittedCount > 0) {
    insights.push({
      id: "submitted",
      message: `${submittedCount.toLocaleString("pt-PT")} nota(s) submetidas aguardam revisão`,
      severity: "warning",
      linkHref: "/grades?status=SUBMITTED",
      linkLabel: "Rever",
    });
  }

  if (failedSubjectCount > 0) {
    insights.push({
      id: "failed",
      message: `${failedSubjectCount.toLocaleString("pt-PT")} disciplina(s) com resultado reprovado`,
      severity: failedSubjectCount > 10 ? "critical" : "warning",
    });
  }

  if (highFailureCount > 0) {
    insights.push({
      id: "high_failure",
      message: `${highFailureCount} disciplina(s) com taxa de reprovação ≥ 50%`,
      severity: "critical",
    });
  }

  if (recentGradedCount > 0) {
    insights.push({
      id: "recent",
      message: `${recentGradedCount.toLocaleString("pt-PT")} nota(s) classificada(s) nos últimos 7 dias`,
      severity: "info",
    });
  }

  if (insights.length === 0) {
    insights.push({
      id: "ok",
      message: "Sem alertas pendentes. Desempenho académico em dia.",
      severity: "info",
    });
  }

  return insights;
}
