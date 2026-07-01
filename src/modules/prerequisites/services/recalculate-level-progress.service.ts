import { getDb } from "@/server/db";
import { upsertStudentLevelProgress } from "@/modules/prerequisites/repositories/student-level-progress.repository";
import { evaluateLevelProgression, computeWeightedLevelGrade } from "@/modules/prerequisites/engines/level-progression.engine";
import { evaluateCourseCompletion } from "@/modules/prerequisites/engines/course-completion.engine";
import { PROGRESSION_OUTCOME } from "@/modules/prerequisites/types";

export async function recalculateStudentLevelProgress(
  enrollmentId: string,
  courseLevelId: string,
  organizationId: string
): Promise<void> {
  const db = await getDb();

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
  let pendingSubjects = 0;
  let anyInProgress = false;

  for (const ls of levelSubjects) {
    const p = progressMap.get(ls.id);
    const status = p?.status ?? "NOT_STARTED";

    if (status === "PASSED") {
      earnedCredits += ls.credits ?? 0;
    } else if (status === "FAILED") {
      if (ls.isRequired) failedRequired++;
    } else if (status === "IN_PROGRESS") {
      anyInProgress = true;
      pendingSubjects++;
    } else {
      pendingSubjects++;
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
  let completedAt: Date | null = null;

  const totalSubjects = levelSubjects.length;
  const passedCount = subjectProgress.filter((p) => p.status === "PASSED").length;

  if (totalSubjects === 0 || subjectProgress.length === 0) {
    levelStatus = "NOT_STARTED";
  } else if (passedCount === totalSubjects) {
    levelStatus = "PASSED";
    progressReason = "Todas as disciplinas aprovadas";
    completedAt = new Date();
  } else if (failedRequired > 0 && !anyInProgress) {
    levelStatus = "FAILED";
    progressReason = `${failedRequired} disciplina(s) obrigatória(s) reprovada(s)`;
    completedAt = new Date();
  } else {
    levelStatus = "IN_PROGRESS";
  }

  // Check if level is eligible for progression
  if (levelStatus === "PASSED" || levelStatus === "IN_PROGRESS" || levelStatus === "FAILED") {
    const progressionResult = await evaluateLevelProgression(enrollmentId, courseLevelId, organizationId);
    if (progressionResult.outcome === PROGRESSION_OUTCOME.PROMOTED && levelStatus === "PASSED") {
      levelStatus = "PROMOTED";
    } else if (progressionResult.outcome === PROGRESSION_OUTCOME.PROMOTED_WITH_PENDING_SUBJECTS) {
      levelStatus = "PROMOTED_WITH_PENDING_SUBJECTS";
      progressReason = progressionResult.reason;
    } else if (progressionResult.outcome === PROGRESSION_OUTCOME.ELIGIBLE_TO_PROGRESS && levelStatus === "PASSED") {
      levelStatus = "ELIGIBLE_TO_PROGRESS";
    }
  }

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
  });

  // Cascade to course progress
  await evaluateCourseCompletion(enrollmentId, organizationId);
}
