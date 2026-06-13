import { getDb } from "@/server/db";

export interface ClassGroupInsightItem {
  id: string;
  message: string;
  severity: "info" | "warning" | "critical";
  linkHref?: string;
  linkLabel?: string;
}

export async function getClassGroupInsights(
  organizationId: string
): Promise<ClassGroupInsightItem[]> {
  const db = await getDb();
  const insights: ClassGroupInsightItem[] = [];

  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);
  const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const [formingGroups, activeGroups, completedThisMonth] = await Promise.all([
    db.classGroup.findMany({
      where: { organizationId, deletedAt: null, status: "FORMING" },
      select: {
        id: true,
        name: true,
        createdAt: true,
        currentCount: true,
      },
    }),
    db.classGroup.findMany({
      where: { organizationId, deletedAt: null, status: "ACTIVE" },
      select: {
        id: true,
        name: true,
        currentCount: true,
        capacity: true,
        teacherId: true,
        _count: { select: { classGroupSchedules: true, classroomBookings: true } },
      },
    }),
    db.classGroup.count({
      where: {
        organizationId,
        deletedAt: null,
        status: "COMPLETED",
        updatedAt: { gte: firstOfMonth },
      },
    }),
  ]);

  // Capacity exceeded (critical)
  const overCapacity = activeGroups.filter((g) => g.currentCount > g.capacity);
  if (overCapacity.length > 0) {
    insights.push({
      id: "over-capacity",
      message: `${overCapacity.length} turma(s) ativa(s) excedeu a capacidade máxima.`,
      severity: "critical",
      linkHref: "/class-groups?status=ACTIVE",
      linkLabel: "Ver turmas",
    });
  }

  // No teacher (warning)
  const noTeacher = activeGroups.filter((g) => !g.teacherId);
  if (noTeacher.length > 0) {
    insights.push({
      id: "no-teacher",
      message: `${noTeacher.length} turma(s) ativa(s) sem professor atribuído.`,
      severity: "warning",
      linkHref: "/class-groups?status=ACTIVE",
      linkLabel: "Ver turmas",
    });
  }

  // No schedule (warning)
  const noSchedule = activeGroups.filter((g) => g._count.classGroupSchedules === 0);
  if (noSchedule.length > 0) {
    insights.push({
      id: "no-schedule",
      message: `${noSchedule.length} turma(s) ativa(s) sem horário configurado.`,
      severity: "warning",
    });
  }

  // No classroom booking (warning)
  const noClassroom = activeGroups.filter((g) => g._count.classroomBookings === 0);
  if (noClassroom.length > 0) {
    insights.push({
      id: "no-classroom",
      message: `${noClassroom.length} turma(s) ativa(s) sem sala atribuída.`,
      severity: "warning",
    });
  }

  // Near capacity >= 90% (warning)
  const nearCapacity = activeGroups.filter(
    (g) => g.capacity > 0 && g.currentCount / g.capacity >= 0.9 && g.currentCount <= g.capacity
  );
  if (nearCapacity.length > 0) {
    insights.push({
      id: "near-capacity",
      message: `${nearCapacity.length} turma(s) ativa(s) com ocupação acima de 90%.`,
      severity: "warning",
    });
  }

  // Very low occupancy < 20% (warning)
  const veryLowOcc = activeGroups.filter(
    (g) => g.capacity > 0 && g.currentCount / g.capacity < 0.2
  );
  if (veryLowOcc.length > 0) {
    insights.push({
      id: "low-occupancy",
      message: `${veryLowOcc.length} turma(s) ativa(s) com ocupação inferior a 20%.`,
      severity: "warning",
    });
  }

  // Forming > 60 days with no enrollments (critical)
  const criticalForming = formingGroups.filter(
    (g) => new Date(g.createdAt) < sixtyDaysAgo && g.currentCount === 0
  );
  if (criticalForming.length > 0) {
    insights.push({
      id: "forming-critical",
      message: `${criticalForming.length} turma(s) em formação há mais de 60 dias sem inscrições.`,
      severity: "critical",
      linkHref: "/class-groups?status=FORMING",
      linkLabel: "Ver turmas",
    });
  }

  // Forming > 30 days (warning, excluding already flagged critical)
  const criticalIds = new Set(criticalForming.map((g) => g.id));
  const warningForming = formingGroups.filter(
    (g) => new Date(g.createdAt) < thirtyDaysAgo && !criticalIds.has(g.id)
  );
  if (warningForming.length > 0) {
    insights.push({
      id: "forming-warning",
      message: `${warningForming.length} turma(s) em formação há mais de 30 dias.`,
      severity: "warning",
      linkHref: "/class-groups?status=FORMING",
      linkLabel: "Ver turmas",
    });
  }

  // Completed this month (info)
  if (completedThisMonth > 0) {
    insights.push({
      id: "completed-month",
      message: `${completedThisMonth} turma(s) concluída(s) este mês.`,
      severity: "info",
    });
  }

  if (insights.length === 0) {
    insights.push({
      id: "all-good",
      message: "Todas as turmas estão dentro dos parâmetros normais.",
      severity: "info",
    });
  }

  return insights;
}
