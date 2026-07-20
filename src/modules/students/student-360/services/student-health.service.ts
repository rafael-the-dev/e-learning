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

  // Finance — 25% (null when the viewer lacks finance permission: the axis is
  // excluded from the score and its weight redistributed across the rest).
  let finance: number | null = null;
  if (input.finance) {
    let financeScore = 100;
    if (input.finance.outstandingBalance > 0) {
      financeScore -= 25;
      reasons.push({
        category: "finance",
        message: "Saldo em dívida",
        impact: 25 * WEIGHTS.finance,
      });
    }
    if (input.finance.hasOverdueInvoice) {
      financeScore -= 35;
      reasons.push({
        category: "finance",
        message: "Fatura(s) vencida(s)",
        impact: 35 * WEIGHTS.finance,
      });
    }
    finance = clamp(financeScore);
  }

  // Attendance — 20% (null when the student has no scheduled sessions: excluded from
  // the score and its weight redistributed, rather than assumed a perfect 100).
  let attendance: number | null = null;
  if (input.attendancePercentage != null) {
    let attendanceScore = input.attendancePercentage;
    if (input.hasBelowRequiredAttendance) {
      const before = attendanceScore;
      attendanceScore = Math.min(attendanceScore, 50);
      if (attendanceScore < before) {
        reasons.push({
          category: "attendance",
          message: "Assiduidade abaixo do mínimo exigido",
          impact: (before - attendanceScore) * WEIGHTS.attendance,
        });
      }
    }
    attendance = clamp(attendanceScore);
  }

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

  // Weighted composite over the categories actually present. When finance is excluded,
  // its weight is redistributed (renormalized) so the score stays on a 0–100 scale —
  // a student healthy in all authorized categories still scores ~100.
  const activeCategories: Array<[number, number]> = [
    [academic, WEIGHTS.academic],
    [enrollment, WEIGHTS.enrollment],
    [activity, WEIGHTS.activity],
  ];
  if (finance != null) activeCategories.push([finance, WEIGHTS.finance]);
  if (attendance != null) activeCategories.push([attendance, WEIGHTS.attendance]);
  const totalWeight = activeCategories.reduce((sum, [, weight]) => sum + weight, 0);
  const score = Math.round(
    activeCategories.reduce((sum, [value, weight]) => sum + value * weight, 0) / totalWeight
  );

  const label: HealthScoreLabel =
    score >= 90 ? "EXCELLENT" : score >= 75 ? "HEALTHY" : score >= 50 ? "NEEDS_ATTENTION" : "CRITICAL";

  const topReasons = [...reasons].sort((a, b) => b.impact - a.impact).slice(0, 3);

  const worstCategory = (Object.entries(breakdown) as Array<[keyof HealthScoreBreakdown, number | null]>)
    .filter((entry): entry is [keyof HealthScoreBreakdown, number] => entry[1] != null)
    .sort((a, b) => a[1] - b[1])[0]?.[0];

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
