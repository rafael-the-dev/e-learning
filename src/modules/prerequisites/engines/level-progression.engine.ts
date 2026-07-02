import { getDb, type PrismaClientOrTx } from "@/server/db";
import { findPolicyByTransition } from "@/modules/prerequisites/repositories/level-progression-policy.repository";
import type { LevelProgressionEvaluationResult, LevelProgressionPolicy } from "@/modules/prerequisites/types";
import { PROGRESSION_OUTCOME } from "@/modules/prerequisites/types";

// ─── Pure decision helper ─────────────────────────────────────────────────────
// The progression decision is pure: given the level's subjects, the student's
// subject progress, whether a next level exists, and the transition policy, it
// yields an outcome. It performs NO IO so it can be unit-tested directly. The
// exported async `evaluateLevelProgression` below loads the data and delegates.

export interface LevelSubjectInput {
  id: string;
  isRequired: boolean;
  credits: number | null;
  workloadHours: number | null;
}

export interface SubjectProgressInput {
  levelSubjectId: string;
  status: string;
  finalGrade: number | string | null;
}

// Weighted level grade over PASSED subjects. Weight is the subject's credits
// when > 0, otherwise its workloadHours. Subjects with no usable weight (both
// null/0) or no recorded grade are excluded from the grade — but the caller
// still counts them for status (pass/fail/pending). Returns null when no
// subject carries weight. Shared by the engine (minimumLevelAverage) and the
// recalculation service (stored StudentLevelProgress.finalGrade) so both stay
// in sync. Result is the raw mean; callers round for storage as needed.
export function computeWeightedLevelGrade(
  levelSubjects: Pick<LevelSubjectInput, "id" | "credits" | "workloadHours">[],
  subjectProgress: SubjectProgressInput[]
): number | null {
  const progressMap = new Map(subjectProgress.map((p) => [p.levelSubjectId, p]));
  let weightedSum = 0;
  let weightTotal = 0;

  for (const ls of levelSubjects) {
    const progress = progressMap.get(ls.id);
    if (progress?.status !== "PASSED" || progress.finalGrade == null) continue;

    const weight = (ls.credits ?? 0) > 0 ? (ls.credits as number) : ls.workloadHours ?? 0;
    if (weight <= 0) continue; // zero-weight subject excluded from grade

    weightedSum += parseFloat(String(progress.finalGrade)) * weight;
    weightTotal += weight;
  }

  return weightTotal > 0 ? weightedSum / weightTotal : null;
}

/** Subset of LevelProgressionPolicy the decision actually depends on. */
export type ProgressionPolicyInput = Pick<
  LevelProgressionPolicy,
  | "progressionMode"
  | "minimumLevelAverage"
  | "maxFailedRequiredSubjects"
  | "maxPendingSubjects"
  | "requiredCredits"
  | "requireManualApproval"
>;

export interface LevelProgressionDecisionInput {
  fromLevelId: string;
  /** Next level's id, or null when this is the final level of the course. */
  toLevelId: string | null;
  levelSubjects: LevelSubjectInput[];
  subjectProgress: SubjectProgressInput[];
  policy: ProgressionPolicyInput | null;
}

export function decideLevelProgression(
  input: LevelProgressionDecisionInput
): LevelProgressionEvaluationResult {
  const { fromLevelId, toLevelId, levelSubjects, subjectProgress, policy } = input;
  const progressMap = new Map(subjectProgress.map((p) => [p.levelSubjectId, p]));

  // Calculate stats. Status counting (pass/fail/pending) and earned credits are
  // independent of the grade weighting — a subject excluded from the grade for
  // lacking weight is still counted here for status.
  let failedRequiredCount = 0;
  let pendingCount = 0;
  let earnedCredits = 0;

  for (const ls of levelSubjects) {
    const progress = progressMap.get(ls.id);
    const status = progress?.status ?? "NOT_STARTED";

    if (status === "PASSED") {
      earnedCredits += ls.credits ?? 0;
    } else if (status === "FAILED") {
      // Only required failures block progression; optional failures are ignored.
      if (ls.isRequired) failedRequiredCount++;
    } else {
      // NOT_STARTED / IN_PROGRESS / RECOVERY_REQUIRED are pending, NOT failed.
      // A pending required subject must never be double-counted as a failure,
      // otherwise CONDITIONAL mode confuses "pending" with "reproved".
      pendingCount++;
    }
  }

  // Weighted level average (credits, else workloadHours) over passed subjects —
  // used to enforce minimumLevelAverage in CONDITIONAL mode.
  const levelAverage = computeWeightedLevelGrade(levelSubjects, subjectProgress);

  if (!toLevelId) {
    // No next level — this is the final level
    const allPassed = levelSubjects.every((ls) => {
      const p = progressMap.get(ls.id);
      return p?.status === "PASSED";
    });
    return {
      outcome: allPassed ? PROGRESSION_OUTCOME.PROMOTED : PROGRESSION_OUTCOME.ELIGIBLE_TO_PROGRESS,
      fromLevelId,
      toLevelId: null,
      reason: "Último nível do curso",
      failedRequiredSubjectsCount: failedRequiredCount,
      pendingSubjectsCount: pendingCount,
      earnedCredits,
      requiredCredits: null,
    };
  }

  const progressionMode = policy?.progressionMode ?? "STRICT";

  // NOTE (financial clearance): policy.requireFinancialClearance is NOT yet
  // enforced here — FinancialEligibilityService is not implemented. This is a
  // known stub, not a silent omission: until the finance module exposes a
  // clearance check, a policy that sets requireFinancialClearance=true will
  // still progress academically. Wire FinancialEligibilityService here and
  // return a BLOCKED/PENDING_PAYMENT outcome when clearance fails.

  if (progressionMode === "STRICT") {
    if (failedRequiredCount > 0 || pendingCount > 0) {
      return {
        outcome: PROGRESSION_OUTCOME.BLOCKED,
        fromLevelId,
        toLevelId,
        reason: `${failedRequiredCount} disciplina(s) obrigatória(s) por concluir`,
        failedRequiredSubjectsCount: failedRequiredCount,
        pendingSubjectsCount: pendingCount,
        earnedCredits,
        requiredCredits: policy?.requiredCredits ?? null,
      };
    }
  } else if (progressionMode === "CONDITIONAL") {
    const maxFailed = policy?.maxFailedRequiredSubjects ?? 0;
    const maxPending = policy?.maxPendingSubjects ?? 0;
    if (failedRequiredCount > maxFailed || pendingCount > maxPending) {
      return {
        outcome: PROGRESSION_OUTCOME.BLOCKED,
        fromLevelId,
        toLevelId,
        reason: `Excede o máximo de disciplinas pendentes (${pendingCount}/${maxPending}) ou reprovadas (${failedRequiredCount}/${maxFailed})`,
        failedRequiredSubjectsCount: failedRequiredCount,
        pendingSubjectsCount: pendingCount,
        earnedCredits,
        requiredCredits: policy?.requiredCredits ?? null,
      };
    }
    // Minimum level average, when configured, must also be satisfied.
    if (policy?.minimumLevelAverage != null && (levelAverage == null || levelAverage < policy.minimumLevelAverage)) {
      return {
        outcome: PROGRESSION_OUTCOME.BLOCKED,
        fromLevelId,
        toLevelId,
        reason: `Média do nível insuficiente: ${levelAverage != null ? levelAverage.toFixed(1) : "—"}/${policy.minimumLevelAverage}`,
        failedRequiredSubjectsCount: failedRequiredCount,
        pendingSubjectsCount: pendingCount,
        earnedCredits,
        requiredCredits: policy?.requiredCredits ?? null,
      };
    }
  } else if (progressionMode === "CREDIT_BASED") {
    const required = policy?.requiredCredits ?? 0;
    if (earnedCredits < required) {
      return {
        outcome: PROGRESSION_OUTCOME.BLOCKED,
        fromLevelId,
        toLevelId,
        reason: `Créditos insuficientes: ${earnedCredits}/${required}`,
        failedRequiredSubjectsCount: failedRequiredCount,
        pendingSubjectsCount: pendingCount,
        earnedCredits,
        requiredCredits: required,
      };
    }
  } else if (progressionMode === "MANUAL_APPROVAL") {
    return {
      outcome: PROGRESSION_OUTCOME.REQUIRES_MANUAL_APPROVAL,
      fromLevelId,
      toLevelId,
      reason: "Requer aprovação do coordenador académico",
      failedRequiredSubjectsCount: failedRequiredCount,
      pendingSubjectsCount: pendingCount,
      earnedCredits,
      requiredCredits: policy?.requiredCredits ?? null,
    };
  }

  // A policy may require manual approval on top of any auto-evaluated mode
  // (STRICT/CONDITIONAL/CREDIT_BASED). When the academic criteria are met but
  // the flag is set, divert to manual approval instead of auto-promoting.
  if (policy?.requireManualApproval) {
    return {
      outcome: PROGRESSION_OUTCOME.REQUIRES_MANUAL_APPROVAL,
      fromLevelId,
      toLevelId,
      reason: "Critérios cumpridos — requer aprovação do coordenador académico",
      failedRequiredSubjectsCount: failedRequiredCount,
      pendingSubjectsCount: pendingCount,
      earnedCredits,
      requiredCredits: policy?.requiredCredits ?? null,
    };
  }

  const hasAllSubjectsPassed = pendingCount === 0 && failedRequiredCount === 0;
  const outcome = hasAllSubjectsPassed
    ? PROGRESSION_OUTCOME.PROMOTED
    : PROGRESSION_OUTCOME.PROMOTED_WITH_PENDING_SUBJECTS;

  return {
    outcome,
    fromLevelId,
    toLevelId,
    reason: hasAllSubjectsPassed
      ? "Todas as disciplinas concluídas"
      : `Promovido com ${pendingCount + failedRequiredCount} disciplina(s) pendente(s)`,
    failedRequiredSubjectsCount: failedRequiredCount,
    pendingSubjectsCount: pendingCount,
    earnedCredits,
    requiredCredits: policy?.requiredCredits ?? null,
  };
}

// ─── IO wrapper ───────────────────────────────────────────────────────────────

export async function evaluateLevelProgression(
  enrollmentId: string,
  courseLevelId: string,
  organizationId: string,
  // When invoked inside the grade cascade transaction, pass the tx client so the
  // reads see the subject-progress rows just written in the same transaction.
  client?: PrismaClientOrTx
): Promise<LevelProgressionEvaluationResult> {
  const db = client ?? await getDb();

  const enrollment = await db.enrollment.findFirst({
    where: { id: enrollmentId, organizationId, deletedAt: null },
    select: { studentId: true, courseId: true, currentLevelId: true, courseLevelId: true },
  });

  if (!enrollment) {
    return {
      outcome: PROGRESSION_OUTCOME.BLOCKED,
      fromLevelId: courseLevelId,
      toLevelId: null,
      reason: "Matrícula não encontrada",
      failedRequiredSubjectsCount: 0,
      pendingSubjectsCount: 0,
      earnedCredits: 0,
      requiredCredits: null,
    };
  }

  // Find next level in course
  const currentLevel = await db.courseLevel.findFirst({
    where: { id: courseLevelId },
    select: { courseId: true, order: true },
  });

  if (!currentLevel) {
    return {
      outcome: PROGRESSION_OUTCOME.BLOCKED,
      fromLevelId: courseLevelId,
      toLevelId: null,
      reason: "Nível não encontrado",
      failedRequiredSubjectsCount: 0,
      pendingSubjectsCount: 0,
      earnedCredits: 0,
      requiredCredits: null,
    };
  }

  const nextLevel = await db.courseLevel.findFirst({
    where: {
      courseId: currentLevel.courseId,
      order: { gt: currentLevel.order },
      status: "ACTIVE",
    },
    orderBy: { order: "asc" },
    select: { id: true, name: true },
  });

  // Load all level subjects for this level
  const levelSubjects = await db.levelSubject.findMany({
    where: { courseLevelId, organizationId, deletedAt: null, status: "ACTIVE" },
    select: {
      id: true,
      isRequired: true,
      credits: true,
      workloadHours: true,
      subject: { select: { name: true } },
    },
  });

  // Load student subject progress for this enrollment + level
  const subjectProgress = await db.studentSubjectProgress.findMany({
    where: {
      enrollmentId,
      organizationId,
      levelSubjectId: { in: levelSubjects.map((ls) => ls.id) },
    },
    select: { levelSubjectId: true, status: true, finalGrade: true },
  });

  const toLevelId = nextLevel?.id ?? null;

  // Find progression policy (only relevant when there is a next level)
  const policy = toLevelId
    ? await findPolicyByTransition(enrollment.courseId, courseLevelId, toLevelId, organizationId, db)
    : null;

  return decideLevelProgression({
    fromLevelId: courseLevelId,
    toLevelId,
    levelSubjects: levelSubjects.map((ls) => ({
      id: ls.id,
      isRequired: ls.isRequired,
      credits: ls.credits,
      workloadHours: ls.workloadHours,
    })),
    subjectProgress: subjectProgress.map((p) => ({
      levelSubjectId: p.levelSubjectId,
      status: p.status,
      finalGrade: p.finalGrade != null ? parseFloat(String(p.finalGrade)) : null,
    })),
    policy,
  });
}

export async function promoteStudentToNextLevel(
  enrollmentId: string,
  toLevelId: string,
  organizationId: string
): Promise<void> {
  const db = await getDb();
  await db.enrollment.updateMany({
    where: { id: enrollmentId, organizationId },
    data: { currentLevelId: toLevelId },
  });
}
