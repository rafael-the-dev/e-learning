import { getDb } from "@/server/db";

export interface CourseInsightItem {
  id: string;
  message: string;
  severity: "info" | "warning" | "critical";
  linkHref?: string;
  linkLabel?: string;
}

export async function getCourseInsights(
  organizationId: string
): Promise<CourseInsightItem[]> {
  const db = await getDb();
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const [
    noLevelsCount,
    noSubjectsCount,
    noClassGroupCount,
    noEnrollmentsCount,
    staleDraftCount,
    createdThisMonth,
    activeEnrollmentsCount,
  ] = await Promise.all([
    // ACTIVE courses with 0 levels — completely empty curriculum
    db.course.count({
      where: {
        organizationId,
        deletedAt: null,
        status: "ACTIVE",
        levels: { none: {} },
      },
    }),
    // ACTIVE courses where no levelSubject is ACTIVE
    // (course.levelSubjects is a direct relation in schema)
    db.course.count({
      where: {
        organizationId,
        deletedAt: null,
        status: "ACTIVE",
        levelSubjects: { none: { status: "ACTIVE", deletedAt: null } },
      },
    }),
    // ACTIVE courses with no active class groups
    db.course.count({
      where: {
        organizationId,
        deletedAt: null,
        status: "ACTIVE",
        classGroups: { none: { status: "ACTIVE", deletedAt: null } },
      },
    }),
    // ACTIVE courses running (has active class groups) but no active enrollments
    db.course.count({
      where: {
        organizationId,
        deletedAt: null,
        status: "ACTIVE",
        classGroups: { some: { status: "ACTIVE", deletedAt: null } },
        enrollments: { none: { status: "ACTIVE", deletedAt: null } },
      },
    }),
    // DRAFT courses created more than 30 days ago
    db.course.count({
      where: {
        organizationId,
        deletedAt: null,
        status: "DRAFT",
        createdAt: { lt: thirtyDaysAgo },
      },
    }),
    db.course.count({
      where: {
        organizationId,
        deletedAt: null,
        createdAt: { gte: startOfMonth },
      },
    }),
    db.enrollment.count({
      where: {
        organizationId,
        deletedAt: null,
        status: "ACTIVE",
        course: { status: "ACTIVE", deletedAt: null },
      },
    }),
  ]);

  const insights: CourseInsightItem[] = [];

  if (noLevelsCount > 0) {
    insights.push({
      id: "no-levels",
      severity: "critical",
      message: `${noLevelsCount} curso(s) ativo(s) sem nenhum nível definido — currículo vazio.`,
      linkHref: "/courses?status=ACTIVE",
      linkLabel: "Ver cursos ativos",
    });
  }

  if (noSubjectsCount > 0) {
    insights.push({
      id: "no-subjects",
      severity: "critical",
      message: `${noSubjectsCount} curso(s) ativo(s) sem disciplinas ativas nos níveis.`,
      linkHref: "/courses?status=ACTIVE",
      linkLabel: "Ver cursos ativos",
    });
  }

  if (noClassGroupCount > 0) {
    insights.push({
      id: "no-class-groups",
      severity: "warning",
      message: `${noClassGroupCount} curso(s) ativo(s) sem turma ativa associada — currículo não utilizado.`,
      linkHref: "/courses?status=ACTIVE",
      linkLabel: "Ver cursos ativos",
    });
  }

  if (noEnrollmentsCount > 0) {
    insights.push({
      id: "no-enrollments",
      severity: "warning",
      message: `${noEnrollmentsCount} curso(s) com turmas ativas mas sem matrículas — nenhum aluno inscrito.`,
      linkHref: "/enrollments",
      linkLabel: "Ver matrículas",
    });
  }

  if (staleDraftCount > 0) {
    insights.push({
      id: "stale-drafts",
      severity: "warning",
      message: `${staleDraftCount} rascunho(s) com mais de 30 dias sem publicar.`,
      linkHref: "/courses?status=DRAFT",
      linkLabel: "Ver rascunhos",
    });
  }

  if (createdThisMonth > 0) {
    insights.push({
      id: "created-this-month",
      severity: "info",
      message: `${createdThisMonth} novo(s) curso(s) criado(s) este mês.`,
    });
  }

  if (activeEnrollmentsCount > 0) {
    insights.push({
      id: "active-enrollments",
      severity: "info",
      message: `${activeEnrollmentsCount} matrícula(s) ativa(s) nos cursos da organização.`,
      linkHref: "/enrollments",
      linkLabel: "Ver matrículas",
    });
  }

  return insights;
}
