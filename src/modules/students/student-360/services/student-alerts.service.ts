import type { StudentAlert, StudentAlertsInput } from "@/modules/students/student-360/types";

export function computeStudentAlerts(input: StudentAlertsInput): StudentAlert[] {
  const alerts: StudentAlert[] = [];

  // Critical
  if (input.blockedLevelCount > 0) {
    alerts.push({
      id: "blocked-progress",
      severity: "CRITICAL",
      message: "Progressão de nível bloqueada.",
      recommendedAction: "Verificar requisitos pendentes e elegibilidade de progressão.",
      href: "?tab=progress",
    });
  }
  if (input.overdueInvoiceCount > 0) {
    alerts.push({
      id: "overdue-balance",
      severity: "CRITICAL",
      message: `${input.overdueInvoiceCount} fatura(s) vencida(s).`,
      recommendedAction: "Contactar o aluno para regularizar o pagamento.",
      href: "?tab=finance",
    });
  }
  if (input.belowRequiredAttendanceSubjects.length > 0) {
    alerts.push({
      id: "below-attendance",
      severity: "CRITICAL",
      message: `Assiduidade abaixo do mínimo em ${input.belowRequiredAttendanceSubjects.length} disciplina(s).`,
      recommendedAction: "Verificar assiduidade e justificações de ausência.",
      href: "?tab=attendance",
    });
  }
  if (input.failedSubjectCount > 0) {
    alerts.push({
      id: "failed-subject",
      severity: "CRITICAL",
      message: `${input.failedSubjectCount} disciplina(s) reprovada(s).`,
      recommendedAction: "Agendar apoio académico ou avaliação de recuperação.",
      href: "?tab=grades",
    });
  }

  // High
  if (input.recoveryRequiredCount > 0) {
    alerts.push({
      id: "recovery-required",
      severity: "HIGH",
      message: "Recuperação necessária num nível.",
      recommendedAction: "Verificar plano de recuperação académica.",
      href: "?tab=progress",
    });
  }
  if (input.pendingRefundCount > 0) {
    alerts.push({
      id: "pending-refund",
      severity: "HIGH",
      message: `${input.pendingRefundCount} reembolso(s) pendente(s).`,
      recommendedAction: "Rever e processar o(s) pedido(s) de reembolso.",
      href: "?tab=finance",
    });
  }
  if (input.pendingJustificationCount > 0) {
    alerts.push({
      id: "pending-justification",
      severity: "HIGH",
      message: `${input.pendingJustificationCount} justificação(ões) de ausência pendente(s).`,
      recommendedAction: "Avaliar as justificações de ausência pendentes.",
      href: "?tab=attendance",
    });
  }
  if (input.documentCount === 0) {
    alerts.push({
      id: "missing-documents",
      severity: "HIGH",
      message: "Nenhum documento carregado.",
      recommendedAction: "Solicitar documentos obrigatórios ao aluno.",
      href: "?tab=documents",
    });
  }

  // Medium
  if (input.incompleteAssessmentCount > 0) {
    alerts.push({
      id: "incomplete-assessments",
      severity: "MEDIUM",
      message: `${input.incompleteAssessmentCount} avaliação(ões) incompleta(s).`,
      recommendedAction: "Concluir o registo de avaliações pendentes.",
      href: "?tab=grades",
    });
  }
  if (input.hasAnyEnrollment && !input.hasActiveEnrollment) {
    alerts.push({
      id: "inactive-enrollment",
      severity: "MEDIUM",
      message: "Sem matrícula ativa.",
      recommendedAction: "Verificar o estado das matrículas do aluno.",
      href: "?tab=enrollments",
    });
  }

  return alerts;
}
