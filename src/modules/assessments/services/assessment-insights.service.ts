import { getDb } from "@/server/db";

export interface AssessmentInsightItem {
  id: string;
  message: string;
  severity: "info" | "warning" | "critical";
  linkHref?: string;
  linkLabel?: string;
}

export async function getAssessmentInsights(
  organizationId: string
): Promise<AssessmentInsightItem[]> {
  const db = await getDb();
  const insights: AssessmentInsightItem[] = [];

  const now = new Date();
  const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const [
    overdueOpen,
    openNoTeacher,
    scheduledNoTeacher,
    pendingRetakes,
    readyToPublish,
    gradedThisMonth,
    publishedThisMonth,
  ] = await Promise.all([
    // OPEN assessments past their assessmentDate
    db.assessment.count({
      where: { organizationId, deletedAt: null, status: "OPEN", assessmentDate: { lt: now } },
    }),
    // OPEN assessments without teacher
    db.assessment.count({
      where: { organizationId, deletedAt: null, status: "OPEN", teacherId: null },
    }),
    // SCHEDULED in next 7 days without teacher
    db.assessment.count({
      where: {
        organizationId,
        deletedAt: null,
        status: "SCHEDULED",
        assessmentDate: { gte: now, lte: sevenDaysFromNow },
        teacherId: null,
      },
    }),
    db.assessmentRetake.count({
      where: { organizationId, status: "REQUESTED" },
    }),
    db.assessment.count({
      where: {
        organizationId,
        deletedAt: null,
        status: "GRADED",
        publication: { publicationStatus: "READY" },
      },
    }),
    // GRADED this month
    db.assessment.count({
      where: {
        organizationId,
        deletedAt: null,
        status: "GRADED",
        updatedAt: { gte: firstOfMonth },
      },
    }),
    // Published this month
    db.assessmentPublication.count({
      where: {
        organizationId,
        publicationStatus: "PUBLISHED",
        publishedAt: { gte: firstOfMonth },
      },
    }),
  ]);

  // Count OPEN+overdue with 0 graded results separately for CRITICAL vs WARNING split
  const overdueWithNoGrades = await db.assessment.count({
    where: {
      organizationId,
      deletedAt: null,
      status: "OPEN",
      assessmentDate: { lt: now },
      results: { none: { status: "GRADED", deletedAt: null } },
    },
  });

  const overdueWithPartialGrades = overdueOpen - overdueWithNoGrades;

  if (overdueWithNoGrades > 0) {
    insights.push({
      id: "overdue-no-grades",
      message: `${overdueWithNoGrades} avaliação(ões) em atraso sem nenhuma nota lançada.`,
      severity: "critical",
      linkHref: "/assessments?status=OPEN",
      linkLabel: "Ver avaliações",
    });
  }

  if (overdueWithPartialGrades > 0) {
    insights.push({
      id: "overdue-partial",
      message: `${overdueWithPartialGrades} avaliação(ões) em atraso com classificação incompleta.`,
      severity: "warning",
      linkHref: "/assessments?status=OPEN",
      linkLabel: "Ver avaliações",
    });
  }

  if (openNoTeacher > 0) {
    insights.push({
      id: "open-no-teacher",
      message: `${openNoTeacher} avaliação(ões) em curso sem professor atribuído.`,
      severity: "warning",
      linkHref: "/assessments?status=OPEN",
      linkLabel: "Ver avaliações",
    });
  }

  if (scheduledNoTeacher > 0) {
    insights.push({
      id: "scheduled-no-teacher",
      message: `${scheduledNoTeacher} avaliação(ões) agendada(s) nos próximos 7 dias sem professor.`,
      severity: "warning",
      linkHref: "/assessments?status=SCHEDULED",
      linkLabel: "Ver agendadas",
    });
  }

  if (pendingRetakes > 0) {
    insights.push({
      id: "pending-retakes",
      message: `${pendingRetakes} pedido(s) de repetição aguardam aprovação.`,
      severity: "warning",
    });
  }

  if (readyToPublish > 0) {
    insights.push({
      id: "ready-to-publish",
      message: `${readyToPublish} avaliação(ões) classificada(s) prontas para publicação.`,
      severity: "warning",
      linkHref: "/assessments?status=GRADED",
      linkLabel: "Ver classificadas",
    });
  }

  if (gradedThisMonth > 0) {
    insights.push({
      id: "graded-month",
      message: `${gradedThisMonth} avaliação(ões) classificada(s) este mês.`,
      severity: "info",
    });
  }

  if (publishedThisMonth > 0) {
    insights.push({
      id: "published-month",
      message: `${publishedThisMonth} resultado(s) publicado(s) este mês.`,
      severity: "info",
    });
  }

  if (insights.length === 0) {
    insights.push({
      id: "all-good",
      message: "Todas as avaliações estão dentro dos parâmetros normais.",
      severity: "info",
    });
  }

  return insights;
}
