import { getDb } from "@/server/db";
import { upsertStudentLevelProgress } from "@/modules/prerequisites/repositories/student-level-progress.repository";
import { evaluateLevelProgression, computeWeightedLevelGrade } from "@/modules/prerequisites/engines/level-progression.engine";
import { evaluateCourseCompletion } from "@/modules/prerequisites/engines/course-completion.engine";
import { PROGRESSION_OUTCOME } from "@/modules/prerequisites/types";
import type { CascadeContext } from "@/shared/lib/cascade";
import { resolveStableCompletedAt } from "@/shared/lib/completed-at";

// completedAt semantics for StudentLevelProgress.
//   terminal   — statuses that carry a completedAt (PASSED, FAILED, PROMOTED, COMPLETED).
//   completion — the subset that means positive completion (PASSED, PROMOTED, COMPLETED).
//   PROMOTED_WITH_PENDING_SUBJECTS / ELIGIBLE_TO_PROGRESS / RECOVERY_REQUIRED /
//   BLOCKED / IN_PROGRESS / NOT_STARTED are NON-terminal — a level advanced with
//   pending subjects is not academically complete, so it carries no completedAt.
export const LEVEL_TERMINAL_STATUSES: ReadonlySet<string> = new Set([
  "PASSED", "FAILED", "PROMOTED", "COMPLETED",
]);
export const LEVEL_COMPLETION_STATUSES: ReadonlySet<string> = new Set([
  "PASSED", "PROMOTED", "COMPLETED",
]);

export async function recalculateStudentLevelProgress(
  enrollmentId: string,
  courseLevelId: string,
  organizationId: string,
  // Optional cascade context: threads the tx client + event collector so the
  // level and course recalculation commit atomically with the grade mutation.
  ctx?: CascadeContext
): Promise<void> {
  const db = ctx?.client ?? await getDb();

  const enrollment = await db.enrollment.findFirst({
    where: { id: enrollmentId, organizationId, deletedAt: null },
    select: { studentId: true, courseId: true },
  });
  if (!enrollment) return;

  // Aggregate subject progress for this level
  const levelSubjects = await db.levelSubject.findMany({
    where: { courseLevelId, organizationId, deletedAt: null, status: "ACTIVE" },
    select: { id: true, isRequired: true, credits: true, workloadHours: true },
  });

  const subjectProgress = await db.studentSubjectProgress.findMany({
    where: {
      enrollmentId,
      organizationId,
      levelSubjectId: { in: levelSubjects.map((ls) => ls.id) },
    },
    select: { levelSubjectId: true, status: true, finalGrade: true },
  });
  const progressMap = new Map(subjectProgress.map((p) => [p.levelSubjectId, p]));

  let earnedCredits = 0;
  let failedRequired = 0;
  let anyInProgress = false;
  // Required subjects still in the (non-terminal) RECOVERY_REQUIRED state. While
  // any exist the level is UNRESOLVED — it must not finalise as FAILED.
  let recoveryRequiredRequired = 0;

  for (const ls of levelSubjects) {
    const p = progressMap.get(ls.id);
    const status = p?.status ?? "NOT_STARTED";

    if (status === "PASSED") {
      earnedCredits += ls.credits ?? 0;
    } else if (status === "FAILED") {
      if (ls.isRequired) failedRequired++;
    } else if (status === "RECOVERY_REQUIRED") {
      if (ls.isRequired) recoveryRequiredRequired++;
    } else if (status === "IN_PROGRESS") {
      anyInProgress = true;
    }
  }

  // Weighted level grade (credits, else workloadHours) over passed subjects,
  // shared with the progression engine. Rounded to 1 decimal for storage.
  const weightedGrade = computeWeightedLevelGrade(
    levelSubjects,
    subjectProgress.map((p) => ({
      levelSubjectId: p.levelSubjectId,
      status: p.status,
      finalGrade: p.finalGrade != null ? parseFloat(String(p.finalGrade)) : null,
    }))
  );
  const finalGrade = weightedGrade != null ? Math.round(weightedGrade * 10) / 10 : null;

  let levelStatus: string;
  let progressReason: string | null = null;

  const totalSubjects = levelSubjects.length;
  const passedCount = subjectProgress.filter((p) => p.status === "PASSED").length;

  if (totalSubjects === 0 || subjectProgress.length === 0) {
    levelStatus = "NOT_STARTED";
  } else if (passedCount === totalSubjects) {
    levelStatus = "PASSED";
    progressReason = "Todas as disciplinas aprovadas";
  } else if (recoveryRequiredRequired > 0) {
    // Recovery pending on a required subject: the level is unresolved and must
    // NOT finalise as FAILED (or advance) until recovery is completed/exhausted.
    levelStatus = "RECOVERY_REQUIRED";
    progressReason = `${recoveryRequiredRequired} disciplina(s) obrigatória(s) em recuperação`;
  } else if (failedRequired > 0 && !anyInProgress) {
    levelStatus = "FAILED";
    progressReason = `${failedRequired} disciplina(s) obrigatória(s) reprovada(s)`;
  } else {
    levelStatus = "IN_PROGRESS";
  }

  // Check if level is eligible for progression
  if (levelStatus === "PASSED" || levelStatus === "IN_PROGRESS" || levelStatus === "FAILED") {
    const progressionResult = await evaluateLevelProgression(enrollmentId, courseLevelId, organizationId, db);
    if (progressionResult.outcome === PROGRESSION_OUTCOME.PROMOTED && levelStatus === "PASSED") {
      levelStatus = "PROMOTED";
    } else if (progressionResult.outcome === PROGRESSION_OUTCOME.PROMOTED_WITH_PENDING_SUBJECTS) {
      levelStatus = "PROMOTED_WITH_PENDING_SUBJECTS";
      progressReason = progressionResult.reason;
    } else if (progressionResult.outcome === PROGRESSION_OUTCOME.ELIGIBLE_TO_PROGRESS && levelStatus === "PASSED") {
      levelStatus = "ELIGIBLE_TO_PROGRESS";
    }
  }

  // Stable completedAt: resolved from the FINAL level status (after the
  // progression block) against the prior row read in the same tx. Re-running the
  // cascade on an already-completed level must not move the date; a level that
  // advanced carrying pending subjects (PROMOTED_WITH_PENDING_SUBJECTS) is not
  // academically complete and carries no completedAt.
  const existingLevel = await db.studentLevelProgress.findFirst({
    where: { enrollmentId, courseLevelId, organizationId },
    select: { status: true, completedAt: true },
  });
  const completedAt = resolveStableCompletedAt({
    previousStatus: existingLevel?.status ?? null,
    previousCompletedAt: existingLevel?.completedAt ?? null,
    nextStatus: levelStatus,
    terminalStatuses: LEVEL_TERMINAL_STATUSES,
    completionStatuses: LEVEL_COMPLETION_STATUSES,
    now: new Date(),
  });

  await upsertStudentLevelProgress({
    organizationId,
    enrollmentId,
    studentId: enrollment.studentId,
    courseId: enrollment.courseId,
    courseLevelId,
    finalGrade,
    earnedCredits,
    status: levelStatus,
    progressReason,
    completedAt,
  }, db);

  // Cascade to course progress (same tx client + event collector).
  await evaluateCourseCompletion(enrollmentId, organizationId, null, ctx);
}
