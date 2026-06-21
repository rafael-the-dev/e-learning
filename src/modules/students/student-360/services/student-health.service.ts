import type {
  HealthScoreBreakdown,
  HealthScoreInput,
  HealthScoreReason,
  StudentHealthScore,
  HealthScoreLabel,
} from "@/modules/students/student-360/types";

const WEIGHTS = {
  academic: 0.3,
  finance: 0.25,
  attendance: 0.2,
  enrollment: 0.15,
  activity: 0.1,
} as const;

function clamp(value: number, min = 0, max = 100): number {
  return Math.min(max, Math.max(min, value));
}

export function calculateHealthScore(input: HealthScoreInput): StudentHealthScore {
  const reasons: HealthScoreReason[] = [];

  // Academic — 30%
  let academic = 100;
  const failedSubjectCount = input.subjectStatuses.filter((s) => s === "FAILED").length;
  if (failedSubjectCount > 0) {
    const deduction = Math.min(40, failedSubjectCount * 10);
    academic -= deduction;
    reasons.push({
      category: "academic",
      message: `${failedSubjectCount} disciplina(s) reprovada(s)`,
      impact: deduction * WEIGHTS.academic,
    });
  }
  if (input.levelStatuses.includes("RECOVERY_REQUIRED")) {
    academic -= 20;
    reasons.push({
      category: "academic",
      message: "Recuperação necessária num nível",
      impact: 20 * WEIGHTS.academic,
    });
  }
  if (input.levelStatuses.includes("BLOCKED")) {
    academic -= 40;
    reasons.push({
      category: "academic",
      message: "Progressão de nível bloqueada",
      impact: 40 * WEIGHTS.academic,
    });
  }
  academic = clamp(academic);

  // Finance — 25%
  let finance = 100;
  if (input.outstandingBalance > 0) {
    finance -= 25;
    reasons.push({
      category: "finance",
      message: "Saldo em dívida",
      impact: 25 * WEIGHTS.finance,
    });
  }
  if (input.hasOverdueInvoice) {
    finance -= 35;
    reasons.push({
      category: "finance",
      message: "Fatura(s) vencida(s)",
      impact: 35 * WEIGHTS.finance,
    });
  }
  finance = clamp(finance);

  // Attendance — 20%
  let attendance =
    input.attendancePercentages.length > 0
      ? input.attendancePercentages.reduce((sum, p) => sum + p, 0) / input.attendancePercentages.length
      : 100;
  if (input.hasBelowRequiredAttendance) {
    const before = attendance;
    attendance = Math.min(attendance, 50);
    if (attendance < before) {
      reasons.push({
        category: "attendance",
        message: "Assiduidade abaixo do mínimo exigido",
        impact: (before - attendance) * WEIGHTS.attendance,
      });
    }
  }
  attendance = clamp(attendance);

  // Enrollment status — 15%
  let enrollment: number;
  if (input.enrollmentStatuses.includes("ACTIVE")) {
    enrollment = 100;
  } else if (input.enrollmentStatuses.includes("COMPLETED")) {
    enrollment = 60;
    reasons.push({ category: "enrollment", message: "Sem matrícula ativa (concluída)", impact: 40 * WEIGHTS.enrollment });
  } else if (input.enrollmentStatuses.some((s) => s === "SUSPENDED" || s === "PENDING_PAYMENT")) {
    enrollment = 30;
    reasons.push({ category: "enrollment", message: "Matrícula suspensa ou aguarda pagamento", impact: 70 * WEIGHTS.enrollment });
  } else {
    enrollment = 0;
    reasons.push({ category: "enrollment", message: "Sem matrícula ativa", impact: 100 * WEIGHTS.enrollment });
  }
  enrollment = clamp(enrollment);

  // Activity / engagement — 10%
  const now = input.now ?? new Date();
  let activity: number;
  if (!input.lastActivityAt) {
    activity = 20;
    reasons.push({ category: "activity", message: "Sem atividade registada", impact: 80 * WEIGHTS.activity });
  } else {
    const diffDays = (now.getTime() - input.lastActivityAt.getTime()) / (1000 * 60 * 60 * 24);
    if (diffDays <= 30) {
      activity = 100;
    } else if (diffDays <= 90) {
      activity = 60;
      reasons.push({ category: "activity", message: "Sem atividade nos últimos 30 dias", impact: 40 * WEIGHTS.activity });
    } else {
      activity = 20;
      reasons.push({ category: "activity", message: "Sem atividade há mais de 90 dias", impact: 80 * WEIGHTS.activity });
    }
  }
  activity = clamp(activity);

  const breakdown: HealthScoreBreakdown = { academic, finance, attendance, enrollment, activity };

  const score = Math.round(
    academic * WEIGHTS.academic +
      finance * WEIGHTS.finance +
      attendance * WEIGHTS.attendance +
      enrollment * WEIGHTS.enrollment +
      activity * WEIGHTS.activity
  );

  const label: HealthScoreLabel =
    score >= 90 ? "EXCELLENT" : score >= 75 ? "HEALTHY" : score >= 50 ? "NEEDS_ATTENTION" : "CRITICAL";

  const topReasons = [...reasons].sort((a, b) => b.impact - a.impact).slice(0, 3);

  const worstCategory = (Object.entries(breakdown) as [keyof HealthScoreBreakdown, number][]).sort(
    (a, b) => a[1] - b[1]
  )[0]?.[0];

  const recommendedAction =
    score >= 90
      ? "Nenhuma ação necessária."
      : worstCategory === "academic"
        ? "Agendar apoio académico e verificar elegibilidade de progressão."
        : worstCategory === "finance"
          ? "Contactar o aluno para regularizar a situação financeira."
          : worstCategory === "attendance"
            ? "Verificar assiduidade e justificações de ausência pendentes."
            : worstCategory === "enrollment"
              ? "Verificar o estado da matrícula e regularizar a inscrição."
              : "Contactar o aluno — sem atividade recente registada.";

  return { score, label, breakdown, topReasons, recommendedAction };
}
