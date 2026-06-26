import type { TeacherAlert, TeacherAlertsInput } from "@/modules/teachers/teacher-360/types";

export function computeTeacherAlerts(input: TeacherAlertsInput): TeacherAlert[] {
  const alerts: TeacherAlert[] = [];

  // Critical
  if (input.maxDaysOverdue > 14) {
    alerts.push({
      id: "overdue-critical",
      severity: "CRITICAL",
      title: "Avaliações atrasadas há mais de 14 dias",
      description: `Existem avaliações em atraso há ${input.maxDaysOverdue} dia(s).`,
      actionUrl: "?tab=assessments",
    });
  }
  if (input.activeClassGroupCount > 0 && input.completedSessionsLast30d === 0) {
    alerts.push({
      id: "no-sessions",
      severity: "CRITICAL",
      title: "Sem aulas registadas",
      description: "0 aulas/sessões registadas nos últimos 30 dias com turmas ativas.",
      actionUrl: "?tab=attendance",
    });
  }
  if (input.activeClassGroupCount >= 9) {
    alerts.push({
      id: "critical-workload",
      severity: "CRITICAL",
      title: "Carga crítica de turmas",
      description: `${input.activeClassGroupCount} turma(s) ativa(s) atribuída(s).`,
      actionUrl: "?tab=classGroups",
    });
  }

  // High
  if (input.pendingGradingResultsCount > 20) {
    alerts.push({
      id: "high-pending-grading",
      severity: "HIGH",
      title: "Muitos resultados por classificar",
      description: `${input.pendingGradingResultsCount} resultado(s) por classificar.`,
      actionUrl: "?tab=assessments",
    });
  }
  if (input.overdueOpenAssessmentCount > 0 && input.maxDaysOverdue <= 14) {
    alerts.push({
      id: "overdue-high",
      severity: "HIGH",
      title: "Avaliações fora do prazo",
      description: `${input.overdueOpenAssessmentCount} avaliação(ões) em atraso.`,
      actionUrl: "?tab=assessments",
    });
  }
  if (input.activeClassGroupCount >= 7 && input.activeClassGroupCount < 9) {
    alerts.push({
      id: "high-workload",
      severity: "HIGH",
      title: "Carga superior ao recomendado",
      description: `${input.activeClassGroupCount} turma(s) ativa(s) atribuída(s).`,
      actionUrl: "?tab=classGroups",
    });
  }

  // Medium
  if (input.isActiveTeacher && input.subjectCount === 0) {
    alerts.push({
      id: "no-subjects",
      severity: "MEDIUM",
      title: "Sem disciplinas atribuídas",
      description: "O professor não tem disciplinas atribuídas.",
      actionUrl: "?tab=subjects",
    });
  }
  if (input.isActiveTeacher && input.subjectCount > 0 && input.activeClassGroupCount === 0) {
    alerts.push({
      id: "no-active-groups",
      severity: "MEDIUM",
      title: "Sem turmas ativas",
      description: "O professor não tem turmas ativas atribuídas.",
      actionUrl: "?tab=classGroups",
    });
  }
  if (input.readyNotPublishedCount > 0) {
    alerts.push({
      id: "ready-not-published",
      severity: "MEDIUM",
      title: "Resultados prontos sem publicar",
      description: `${input.readyNotPublishedCount} avaliação(ões) com resultados prontos para publicar.`,
      actionUrl: "?tab=assessments",
    });
  }

  // Low
  if (input.upcomingAssessmentCount > 0) {
    alerts.push({
      id: "upcoming-assessments",
      severity: "LOW",
      title: "Avaliações agendadas para esta semana",
      description: `${input.upcomingAssessmentCount} avaliação(ões) agendada(s) para os próximos 7 dias.`,
      actionUrl: "?tab=assessments",
    });
  }

  return alerts;
}
