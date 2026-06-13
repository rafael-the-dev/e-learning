import { getDb } from "@/server/db";

export interface ProgressInsightItem {
  id: string;
  message: string;
  severity: "info" | "warning" | "critical";
  linkHref?: string;
  linkLabel?: string;
}

export async function getProgressInsights(
  organizationId: string
): Promise<ProgressInsightItem[]> {
  const db = await getDb();
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const [
    blockedCount,
    failedCount,
    recoveryCount,
    pendingEligibleCount,
    subjectFailedCount,
    completedThisMonth,
    startedThisMonth,
  ] = await Promise.all([
    // Students with BLOCKED level progress — cannot advance
    db.studentLevelProgress.count({
      where: { organizationId, status: "BLOCKED" },
    }),
    // Students with FAILED course progress
    db.studentCourseProgress.count({
      where: { organizationId, status: "FAILED" },
    }),
    // Students requiring recovery — not yet resolved
    db.studentCourseProgress.count({
      where: { organizationId, status: "RECOVERY_REQUIRED" },
    }),
    // Students eligible to progress but no action taken for 7+ days
    db.studentLevelProgress.count({
      where: {
        organizationId,
        status: "ELIGIBLE_TO_PROGRESS",
        updatedAt: { lt: sevenDaysAgo },
      },
    }),
    // Subject-level failures (individual discipline failures)
    db.studentSubjectProgress.count({
      where: { organizationId, status: "FAILED" },
    }),
    // Course completions (PASSED + COMPLETED) this month
    db.studentCourseProgress.count({
      where: {
        organizationId,
        status: { in: ["PASSED", "COMPLETED"] },
        completedAt: { gte: startOfMonth },
      },
    }),
    // New course progressions initiated this month
    db.studentCourseProgress.count({
      where: {
        organizationId,
        createdAt: { gte: startOfMonth },
      },
    }),
  ]);

  const insights: ProgressInsightItem[] = [];

  if (blockedCount > 0) {
    insights.push({
      id: "blocked-students",
      severity: "critical",
      message: `${blockedCount} aluno(s) bloqueado(s) — não conseguem avançar para o próximo nível.`,
      linkHref: "/student-progress?status=BLOCKED",
      linkLabel: "Ver bloqueados",
    });
  }

  if (failedCount > 0) {
    insights.push({
      id: "failed-students",
      severity: "critical",
      message: `${failedCount} aluno(s) com reprovação no curso — requer acompanhamento.`,
      linkHref: "/student-progress?status=FAILED",
      linkLabel: "Ver reprovados",
    });
  }

  if (recoveryCount > 0) {
    insights.push({
      id: "recovery-students",
      severity: "warning",
      message: `${recoveryCount} aluno(s) em situação de recuperação por resolver.`,
      linkHref: "/student-progress?status=RECOVERY_REQUIRED",
      linkLabel: "Ver em recuperação",
    });
  }

  if (pendingEligibleCount > 0) {
    insights.push({
      id: "pending-eligible",
      severity: "warning",
      message: `${pendingEligibleCount} aluno(s) elegíveis para progressão há mais de 7 dias sem ação.`,
      linkHref: "/student-progress?status=ELIGIBLE_TO_PROGRESS",
      linkLabel: "Ver elegíveis",
    });
  }

  if (subjectFailedCount > 0) {
    insights.push({
      id: "subject-failures",
      severity: "warning",
      message: `${subjectFailedCount} reprovação(ões) registada(s) ao nível das disciplinas.`,
      linkHref: "/student-progress",
      linkLabel: "Ver progresso",
    });
  }

  if (completedThisMonth > 0) {
    insights.push({
      id: "completed-this-month",
      severity: "info",
      message: `${completedThisMonth} aluno(s) concluíram o curso este mês.`,
    });
  }

  if (startedThisMonth > 0) {
    insights.push({
      id: "started-this-month",
      severity: "info",
      message: `${startedThisMonth} novo(s) registo(s) de progresso iniciado(s) este mês.`,
    });
  }

  return insights;
}
