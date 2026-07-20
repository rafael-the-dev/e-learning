// =============================================================================
// STUDENT RISK ENGINE + READ MODEL (H6)
//
// The SINGLE canonical answer to "is this student at risk, why, how severe, and
// what should we do?". Student 360, the alerts panel, the overview risk chips and
// the health card all consume THIS — none of them re-derive risk. The rules live
// here once; consumers only read the DTO.
//
// It consumes the already-consolidated read models (academic average/tallies H2,
// attendance H5, and the authorized finance section H1) — it never recomputes a
// grade, an attendance %, or a pass/fail decision.
//
// Permission-aware: when finance is not authorized, `financial` is null (NOT
// "healthy") and the overall level is computed WITHOUT the financial dimension —
// so a viewer can never infer a hidden financial reason from the global level.
//
// Distinct from the Health Score: the health score is a 0–100 composite; the risk
// summary answers concrete, explainable conditions. They are intentionally separate.
// =============================================================================

export type StudentRiskLevel = "UNKNOWN" | "NONE" | "LOW" | "MODERATE" | "HIGH" | "CRITICAL";

export type StudentRiskDimensionKey =
  | "academic"
  | "attendance"
  | "financial"
  | "progression"
  | "documents";

export interface StudentRiskReason {
  id: string;
  dimension: StudentRiskDimensionKey;
  level: StudentRiskLevel;
  message: string;
  recommendedAction: string;
  href?: string;
}

export interface RiskDimension {
  level: StudentRiskLevel;
  reasons: StudentRiskReason[];
}

export interface StudentRiskSummary {
  level: StudentRiskLevel;
  isAtRisk: boolean;
  reasons: StudentRiskReason[];
  academic: RiskDimension | null;
  attendance: RiskDimension | null;
  // null = finance not authorized for the viewer (never inferred into the global level).
  financial: RiskDimension | null;
  progression: RiskDimension | null;
  documents: RiskDimension | null;
  recommendedAction: string | null;
  evaluatedAt: Date;
}

// Signals the engine reasons over — all already decided upstream (statuses/counts),
// never raw thresholds re-compared here. `financial` is null when unauthorized.
export interface StudentRiskInput {
  // progression / enrollment
  blockedLevelCount: number;
  recoveryRequiredCount: number;
  hasActiveEnrollment: boolean;
  hasAnyEnrollment: boolean;
  // academic
  failedSubjectCount: number;
  incompleteAssessmentCount: number;
  // attendance (BELOW_REQUIRED decided per-subject against LevelSubject.minimum — H5)
  belowRequiredAttendanceCount: number;
  pendingJustificationCount: number;
  // documents
  documentCount: number;
  // financial — null = not authorized → dimension null, no financial reasons, excluded
  financial: { overdueInvoiceCount: number; pendingRefundCount: number } | null;
  // data sufficiency — distinguishes NONE ("assessed, no risk") from UNKNOWN ("can't assess")
  hasAcademicData: boolean;
  hasAttendanceData: boolean;
}

const LEVEL_ORDER: Record<StudentRiskLevel, number> = {
  UNKNOWN: -1,
  NONE: 0,
  LOW: 1,
  MODERATE: 2,
  HIGH: 3,
  CRITICAL: 4,
};

function maxLevel(levels: StudentRiskLevel[]): StudentRiskLevel {
  return levels.reduce<StudentRiskLevel>(
    (acc, l) => (LEVEL_ORDER[l] > LEVEL_ORDER[acc] ? l : acc),
    "NONE"
  );
}

function toDimension(reasons: StudentRiskReason[]): RiskDimension {
  return { level: reasons.length > 0 ? maxLevel(reasons.map((r) => r.level)) : "NONE", reasons };
}

/**
 * The canonical risk classification. Pure — no I/O — so it is fully unit-tested and
 * produces the same answer for the same inputs everywhere it runs.
 */
export function buildStudentRiskSummary(input: StudentRiskInput, now: Date = new Date()): StudentRiskSummary {
  const reasons: StudentRiskReason[] = [];

  // ── CRITICAL ────────────────────────────────────────────────────────────────
  if (input.blockedLevelCount > 0) {
    reasons.push({
      id: "blocked-progress",
      dimension: "progression",
      level: "CRITICAL",
      message: "Progressão de nível bloqueada.",
      recommendedAction: "Verificar requisitos pendentes e elegibilidade de progressão.",
      href: "?tab=progress",
    });
  }
  if (input.financial && input.financial.overdueInvoiceCount > 0) {
    reasons.push({
      id: "overdue-balance",
      dimension: "financial",
      level: "CRITICAL",
      message: `${input.financial.overdueInvoiceCount} fatura(s) vencida(s).`,
      recommendedAction: "Contactar o aluno para regularizar o pagamento.",
      href: "?tab=finance",
    });
  }
  if (input.belowRequiredAttendanceCount > 0) {
    reasons.push({
      id: "below-attendance",
      dimension: "attendance",
      level: "CRITICAL",
      message: `Assiduidade abaixo do mínimo em ${input.belowRequiredAttendanceCount} disciplina(s).`,
      recommendedAction: "Verificar assiduidade e justificações de ausência.",
      href: "?tab=attendance",
    });
  }
  if (input.failedSubjectCount > 0) {
    reasons.push({
      id: "failed-subject",
      dimension: "academic",
      level: "CRITICAL",
      message: `${input.failedSubjectCount} disciplina(s) reprovada(s).`,
      recommendedAction: "Agendar apoio académico ou avaliação de recuperação.",
      href: "?tab=grades",
    });
  }

  // ── HIGH ──────────────────────────────────────────────────────────────────────
  if (input.recoveryRequiredCount > 0) {
    reasons.push({
      id: "recovery-required",
      dimension: "progression",
      level: "HIGH",
      message: "Recuperação necessária num nível.",
      recommendedAction: "Verificar plano de recuperação académica.",
      href: "?tab=progress",
    });
  }
  if (input.financial && input.financial.pendingRefundCount > 0) {
    reasons.push({
      id: "pending-refund",
      dimension: "financial",
      level: "HIGH",
      message: `${input.financial.pendingRefundCount} reembolso(s) pendente(s).`,
      recommendedAction: "Rever e processar o(s) pedido(s) de reembolso.",
      href: "?tab=finance",
    });
  }
  if (input.pendingJustificationCount > 0) {
    reasons.push({
      id: "pending-justification",
      dimension: "attendance",
      level: "HIGH",
      message: `${input.pendingJustificationCount} justificação(ões) de ausência pendente(s).`,
      recommendedAction: "Avaliar as justificações de ausência pendentes.",
      href: "?tab=attendance",
    });
  }
  if (input.documentCount === 0) {
    reasons.push({
      id: "missing-documents",
      dimension: "documents",
      level: "HIGH",
      message: "Nenhum documento carregado.",
      recommendedAction: "Solicitar documentos obrigatórios ao aluno.",
      href: "?tab=documents",
    });
  }

  // ── MODERATE ────────────────────────────────────────────────────────────────
  if (input.incompleteAssessmentCount > 0) {
    reasons.push({
      id: "incomplete-assessments",
      dimension: "academic",
      level: "MODERATE",
      message: `${input.incompleteAssessmentCount} avaliação(ões) incompleta(s).`,
      recommendedAction: "Concluir o registo de avaliações pendentes.",
      href: "?tab=grades",
    });
  }
  if (input.hasAnyEnrollment && !input.hasActiveEnrollment) {
    reasons.push({
      id: "inactive-enrollment",
      dimension: "progression",
      level: "MODERATE",
      message: "Sem matrícula ativa.",
      recommendedAction: "Verificar o estado das matrículas do aluno.",
      href: "?tab=enrollments",
    });
  }

  const byDim = (d: StudentRiskDimensionKey) => reasons.filter((r) => r.dimension === d);

  // The overall level uses ONLY the dimensions present. Financial reasons only exist
  // when authorized, so an unauthorized viewer's global level excludes finance entirely
  // (no hidden-risk inference). UNKNOWN when there is nothing to assess.
  let level: StudentRiskLevel;
  if (reasons.length > 0) {
    level = maxLevel(reasons.map((r) => r.level));
  } else if (!input.hasAnyEnrollment && !input.hasAcademicData && !input.hasAttendanceData) {
    level = "UNKNOWN";
  } else {
    level = "NONE";
  }

  const topReason = [...reasons].sort((a, b) => LEVEL_ORDER[b.level] - LEVEL_ORDER[a.level])[0];

  return {
    level,
    isAtRisk: LEVEL_ORDER[level] >= LEVEL_ORDER.LOW,
    reasons,
    academic: toDimension(byDim("academic")),
    attendance: toDimension(byDim("attendance")),
    financial: input.financial ? toDimension(byDim("financial")) : null,
    progression: toDimension(byDim("progression")),
    documents: toDimension(byDim("documents")),
    recommendedAction: topReason?.recommendedAction ?? null,
    evaluatedAt: now,
  };
}
