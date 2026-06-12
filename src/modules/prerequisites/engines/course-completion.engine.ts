import { getDb } from "@/server/db";
import { findLevelProgressByEnrollment } from "@/modules/prerequisites/repositories/student-level-progress.repository";
import { upsertStudentCourseProgress } from "@/modules/prerequisites/repositories/student-course-progress.repository";
import type { StudentCourseProgress } from "@/modules/prerequisites/types";

export async function evaluateCourseCompletion(
  enrollmentId: string,
  organizationId: string
): Promise<StudentCourseProgress> {
  const db = await getDb();

  const enrollment = await db.enrollment.findFirst({
    where: { id: enrollmentId, organizationId, deletedAt: null },
    select: { studentId: true, courseId: true },
  });

  if (!enrollment) throw new Error("Matrícula não encontrada");

  const courseLevels = await db.courseLevel.findMany({
    where: { courseId: enrollment.courseId, status: "ACTIVE" },
    select: { id: true, order: true },
    orderBy: { order: "asc" },
  });

  const levelProgress = await findLevelProgressByEnrollment(enrollmentId, organizationId);
  const progressMap = new Map(levelProgress.map((p) => [p.courseLevelId, p]));

  let totalGrade = 0;
  let gradedLevels = 0;
  let totalEarnedCredits = 0;
  let allPassed = true;
  let anyFailed = false;
  let anyInProgress = false;

  for (const level of courseLevels) {
    const lp = progressMap.get(level.id);
    if (!lp || lp.status === "NOT_STARTED") {
      allPassed = false;
      anyInProgress = true;
      continue;
    }
    if (lp.finalGrade != null) {
      totalGrade += lp.finalGrade;
      gradedLevels++;
    }
    totalEarnedCredits += lp.earnedCredits ?? 0;
    if (lp.status === "FAILED") {
      anyFailed = true;
      allPassed = false;
    } else if (lp.status !== "PASSED" && lp.status !== "COMPLETED" && lp.status !== "PROMOTED" && lp.status !== "PROMOTED_WITH_PENDING_SUBJECTS") {
      allPassed = false;
      anyInProgress = true;
    }
  }

  const finalGrade = gradedLevels > 0 ? Math.round((totalGrade / gradedLevels) * 10) / 10 : null;

  let status: string;
  let progressReason: string | null = null;
  let completedAt: Date | null = null;

  if (courseLevels.length === 0 || levelProgress.length === 0) {
    status = "NOT_STARTED";
  } else if (allPassed) {
    status = "COMPLETED";
    progressReason = "Todos os níveis concluídos";
    completedAt = new Date();
  } else if (anyFailed && !anyInProgress) {
    status = "FAILED";
    progressReason = "Reprovação em disciplinas obrigatórias";
  } else {
    status = "IN_PROGRESS";
  }

  return upsertStudentCourseProgress({
    organizationId,
    enrollmentId,
    studentId: enrollment.studentId,
    courseId: enrollment.courseId,
    finalGrade,
    earnedCredits: totalEarnedCredits,
    status,
    progressReason,
    completedAt,
  });
}
