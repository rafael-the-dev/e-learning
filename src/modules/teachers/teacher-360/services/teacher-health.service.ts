import type {
  HealthScoreBreakdown,
  HealthScoreInput,
  HealthScoreReason,
  TeacherHealthScore,
  HealthScoreLabel,
} from "@/modules/teachers/teacher-360/types";

const WEIGHTS = {
  execution: 0.3,
  delivery: 0.3,
  workload: 0.2,
  quality: 0.2,
} as const;

function clamp(value: number, min = 0, max = 100): number {
  return Math.min(max, Math.max(min, value));
}

export function calculateTeacherHealthScore(input: HealthScoreInput): TeacherHealthScore {
  const reasons: HealthScoreReason[] = [];

  // Execução / assiduidade — 30%
  let execution = 100;
  if (input.activeClassGroupCount > 0 && input.completedSessionsLast30d === 0) {
    execution = 20;
    reasons.push({
      category: "execution",
      message: "Sem aulas registadas nos últimos 30 dias",
      impact: 80 * WEIGHTS.execution,
    });
  } else if (input.completedSessionsLast30d > 0) {
    const ratio = input.completedSessionsWithRecordsLast30d / input.completedSessionsLast30d;
    if (ratio < 0.8) {
      execution = 60;
      reasons.push({
        category: "execution",
        message: "Presenças não lançadas em todas as aulas",
        impact: 40 * WEIGHTS.execution,
      });
    }
  }
  execution = clamp(execution);

  // Entrega académica — 30%
  let delivery = 100;
  if (input.overdueOpenAssessmentCount > 0) {
    const deduction = Math.min(40, input.overdueOpenAssessmentCount * 15);
    delivery -= deduction;
    reasons.push({
      category: "delivery",
      message: `${input.overdueOpenAssessmentCount} avaliação(ões) em atraso`,
      impact: deduction * WEIGHTS.delivery,
    });
  }
  if (input.pendingGradingOpenAssessmentCount > 0) {
    const deduction = Math.min(30, input.pendingGradingOpenAssessmentCount * 10);
    delivery -= deduction;
    reasons.push({
      category: "delivery",
      message: `${input.pendingGradingOpenAssessmentCount} avaliação(ões) por classificar`,
      impact: deduction * WEIGHTS.delivery,
    });
  }
  if (input.readyNotPublishedCount > 0) {
    const deduction = Math.min(20, input.readyNotPublishedCount * 10);
    delivery -= deduction;
    reasons.push({
      category: "delivery",
      message: `${input.readyNotPublishedCount} resultado(s) pronto(s) sem publicar`,
      impact: deduction * WEIGHTS.delivery,
    });
  }
  delivery = clamp(delivery);

  // Carga de trabalho — 20% (thresholds mirror teacher-watchlist.service.ts)
  let workload: number;
  if (input.activeClassGroupCount >= 7) {
    workload = 40;
    reasons.push({
      category: "workload",
      message: "Carga elevada de turmas ativas",
      impact: 60 * WEIGHTS.workload,
    });
  } else if (input.activeClassGroupCount >= 5) {
    workload = 70;
    reasons.push({
      category: "workload",
      message: "Carga moderada-alta de turmas ativas",
      impact: 30 * WEIGHTS.workload,
    });
  } else {
    workload = 100;
  }

  // Qualidade académica — 20%
  let quality: number;
  if (input.passRate == null) {
    quality = 100;
  } else {
    const attendance = input.avgStudentAttendance ?? input.passRate;
    quality = clamp(0.6 * input.passRate + 0.4 * attendance);
    if (quality < 75) {
      reasons.push({
        category: "quality",
        message: "Qualidade académica abaixo do esperado",
        impact: (100 - quality) * WEIGHTS.quality,
      });
    }
  }

  const breakdown: HealthScoreBreakdown = { execution, delivery, workload, quality };

  const score = Math.round(
    execution * WEIGHTS.execution +
      delivery * WEIGHTS.delivery +
      workload * WEIGHTS.workload +
      quality * WEIGHTS.quality
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
      : worstCategory === "execution"
        ? "Verificar aulas/sessões não registadas e lançar presenças em falta."
        : worstCategory === "delivery"
          ? "Classificar e publicar avaliações pendentes."
          : worstCategory === "workload"
            ? "Rever a distribuição de turmas e considerar redistribuir a carga."
            : "Acompanhar o desempenho dos alunos e reforçar o apoio académico.";

  return { score, label, breakdown, topReasons, recommendedAction };
}
