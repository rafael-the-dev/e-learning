import { getDb } from "@/server/db";
import { findPolicyByTransition } from "@/modules/prerequisites/repositories/level-progression-policy.repository";
import { findLevelProgressByEnrollment, upsertStudentLevelProgress } from "@/modules/prerequisites/repositories/student-level-progress.repository";
import type { LevelProgressionEvaluationResult } from "@/modules/prerequisites/types";
import { PROGRESSION_OUTCOME } from "@/modules/prerequisites/types";

export async function evaluateLevelProgression(
  enrollmentId: string,
  courseLevelId: string,
  organizationId: string
): Promise<LevelProgressionEvaluationResult> {
  const db = await getDb();

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
  const progressMap = new Map(subjectProgress.map((p) => [p.levelSubjectId, p]));

  // Calculate stats
  let failedRequiredCount = 0;
  let pendingCount = 0;
  let earnedCredits = 0;

  for (const ls of levelSubjects) {
    const progress = progressMap.get(ls.id);
    const status = progress?.status ?? "NOT_STARTED";

    if (status === "PASSED") {
      earnedCredits += ls.credits ?? 0;
    } else if (status === "FAILED" && ls.isRequired) {
      failedRequiredCount++;
    } else if (status !== "PASSED" && status !== "FAILED") {
      pendingCount++;
      if (ls.isRequired) failedRequiredCount++;
    }
  }

  const toLevelId = nextLevel?.id ?? null;

  if (!toLevelId) {
    // No next level — this is the final level
    const allPassed = levelSubjects.every((ls) => {
      const p = progressMap.get(ls.id);
      return p?.status === "PASSED";
    });
    return {
      outcome: allPassed ? PROGRESSION_OUTCOME.PROMOTED : PROGRESSION_OUTCOME.ELIGIBLE_TO_PROGRESS,
      fromLevelId: courseLevelId,
      toLevelId: null,
      reason: "Último nível do curso",
      failedRequiredSubjectsCount: failedRequiredCount,
      pendingSubjectsCount: pendingCount,
      earnedCredits,
      requiredCredits: null,
    };
  }

  // Find progression policy
  const policy = await findPolicyByTransition(enrollment.courseId, courseLevelId, toLevelId, organizationId);

  const progressionMode = policy?.progressionMode ?? "STRICT";

  if (progressionMode === "STRICT") {
    if (failedRequiredCount > 0 || pendingCount > 0) {
      return {
        outcome: PROGRESSION_OUTCOME.BLOCKED,
        fromLevelId: courseLevelId,
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
        fromLevelId: courseLevelId,
        toLevelId,
        reason: `Excede o máximo de disciplinas pendentes (${pendingCount}/${maxPending}) ou reprovadas (${failedRequiredCount}/${maxFailed})`,
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
        fromLevelId: courseLevelId,
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
      fromLevelId: courseLevelId,
      toLevelId,
      reason: "Requer aprovação do coordenador académico",
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
    fromLevelId: courseLevelId,
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
