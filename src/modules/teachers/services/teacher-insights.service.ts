import { getDb } from "@/server/db";

export interface TeacherInsightItem {
  id: string;
  message: string;
  severity: "info" | "warning" | "critical";
  linkHref?: string;
  linkLabel?: string;
}

export async function getTeacherInsights(
  organizationId: string
): Promise<TeacherInsightItem[]> {
  const db = await getDb();
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const [
    noSubjectsCount,
    noActiveClassGroupCount,
    overdueCount,
    pendingGradingCount,
    suspendedWithActiveGroups,
    addedThisMonth,
    gradedThisMonth,
    activeGroupsByTeacher,
  ] = await Promise.all([
    // ACTIVE teachers with no subject assignments
    db.teacher.count({
      where: {
        organizationId,
        deletedAt: null,
        status: "ACTIVE",
        teacherSubjects: { none: {} },
      },
    }),
    // ACTIVE teachers with no ACTIVE class groups (strictly ACTIVE status)
    db.teacher.count({
      where: {
        organizationId,
        deletedAt: null,
        status: "ACTIVE",
        teacherSubjects: { some: {} },
        classGroups: { none: { status: "ACTIVE", deletedAt: null } },
      },
    }),
    // ACTIVE teachers with overdue OPEN assessments
    db.teacher.count({
      where: {
        organizationId,
        deletedAt: null,
        status: "ACTIVE",
        assessments: {
          some: { status: "OPEN", assessmentDate: { lt: now }, deletedAt: null },
        },
      },
    }),
    // ACTIVE teachers with ungraded OPEN assessments
    db.teacher.count({
      where: {
        organizationId,
        deletedAt: null,
        status: "ACTIVE",
        assessments: {
          some: {
            status: "OPEN",
            deletedAt: null,
            results: { some: { status: { in: ["PENDING", "SUBMITTED"] }, deletedAt: null } },
          },
        },
      },
    }),
    // SUSPENDED teachers still assigned to ACTIVE class groups — operationally dangerous
    db.teacher.count({
      where: {
        organizationId,
        deletedAt: null,
        status: "SUSPENDED",
        classGroups: { some: { status: "ACTIVE", deletedAt: null } },
      },
    }),
    db.teacher.count({
      where: { organizationId, deletedAt: null, createdAt: { gte: startOfMonth } },
    }),
    db.assessment.count({
      where: {
        organizationId,
        deletedAt: null,
        status: "GRADED",
        assessmentDate: { gte: startOfMonth },
        teacherId: { not: null },
      },
    }),
    // Count ACTIVE class groups per teacher to detect overload (≥5)
    db.classGroup.groupBy({
      by: ["teacherId"],
      where: {
        organizationId,
        deletedAt: null,
        status: "ACTIVE",
        teacherId: { not: null },
      },
      _count: { _all: true },
    }),
  ]);

  const overloadedCount = activeGroupsByTeacher.filter((g) => g._count._all >= 5).length;

  const insights: TeacherInsightItem[] = [];

  if (suspendedWithActiveGroups > 0) {
    insights.push({
      id: "suspended-with-active-groups",
      severity: "critical",
      message: `${suspendedWithActiveGroups} professor(es) suspenso(s) ainda atribuído(s) a turmas ativas — risco operacional.`,
      linkHref: "/teachers?status=SUSPENDED",
      linkLabel: "Ver suspensos",
    });
  }

  if (overdueCount > 0) {
    insights.push({
      id: "overdue-assessments",
      severity: "critical",
      message: `${overdueCount} professor(es) com avaliações em atraso por classificar.`,
      linkHref: "/assessments?status=OPEN",
      linkLabel: "Ver avaliações",
    });
  }

  if (noSubjectsCount > 0) {
    insights.push({
      id: "no-subjects",
      severity: "warning",
      message: `${noSubjectsCount} professor(es) ativo(s) sem nenhuma disciplina atribuída.`,
      linkHref: "/teachers",
      linkLabel: "Ver professores",
    });
  }

  if (pendingGradingCount > 0) {
    insights.push({
      id: "pending-grading",
      severity: "warning",
      message: `${pendingGradingCount} professor(es) com avaliações abertas e resultados por lançar.`,
      linkHref: "/assessments?status=OPEN",
      linkLabel: "Ver avaliações",
    });
  }

  if (noActiveClassGroupCount > 0) {
    insights.push({
      id: "no-active-class-group",
      severity: "warning",
      message: `${noActiveClassGroupCount} professor(es) com disciplinas mas sem turma ativa atribuída.`,
    });
  }

  if (overloadedCount > 0) {
    insights.push({
      id: "overloaded",
      severity: "warning",
      message: `${overloadedCount} professor(es) com 5 ou mais turmas ativas — carga de trabalho elevada.`,
    });
  }

  if (addedThisMonth > 0) {
    insights.push({
      id: "added-this-month",
      severity: "info",
      message: `${addedThisMonth} novo(s) professor(es) registado(s) este mês.`,
    });
  }

  if (gradedThisMonth > 0) {
    insights.push({
      id: "graded-this-month",
      severity: "info",
      message: `${gradedThisMonth} avaliação(ões) classificada(s) este mês.`,
    });
  }

  return insights;
}
