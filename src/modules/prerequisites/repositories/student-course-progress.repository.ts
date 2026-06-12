"use server";

import { getDb } from "@/server/db";
import type { StudentCourseProgress } from "@/modules/prerequisites/types";

export async function findCourseProgressByEnrollment(
  enrollmentId: string,
  organizationId: string
): Promise<StudentCourseProgress | null> {
  const db = await getDb();
  const row = await db.studentCourseProgress.findFirst({
    where: { enrollmentId, organizationId },
    include: { course: { select: { name: true } } },
  });
  return row ? mapRow(row) : null;
}

export async function upsertStudentCourseProgress(data: {
  organizationId: string;
  enrollmentId: string;
  studentId: string;
  courseId: string;
  finalGrade: number | null;
  earnedCredits: number;
  status: string;
  progressReason: string | null;
  completedAt: Date | null;
}): Promise<StudentCourseProgress> {
  const db = await getDb();
  const now = new Date();
  const row = await db.studentCourseProgress.upsert({
    where: { enrollmentId: data.enrollmentId },
    create: {
      organizationId: data.organizationId,
      enrollmentId: data.enrollmentId,
      studentId: data.studentId,
      courseId: data.courseId,
      finalGrade: data.finalGrade,
      earnedCredits: data.earnedCredits,
      status: data.status,
      progressReason: data.progressReason,
      completedAt: data.completedAt,
      calculatedAt: now,
    },
    update: {
      finalGrade: data.finalGrade,
      earnedCredits: data.earnedCredits,
      status: data.status,
      progressReason: data.progressReason,
      completedAt: data.completedAt,
      calculatedAt: now,
    },
    include: { course: { select: { name: true } } },
  });
  return mapRow(row);
}

function mapRow(row: {
  id: string; organizationId: string; enrollmentId: string; studentId: string;
  courseId: string; finalGrade: unknown; earnedCredits: number | null;
  status: string; progressReason: string | null; completedAt: Date | null;
  calculatedAt: Date | null; createdAt: Date; updatedAt: Date;
  course?: { name: string } | null;
}): StudentCourseProgress {
  return {
    id: row.id,
    organizationId: row.organizationId,
    enrollmentId: row.enrollmentId,
    studentId: row.studentId,
    courseId: row.courseId,
    finalGrade: row.finalGrade != null ? parseFloat(String(row.finalGrade)) : null,
    earnedCredits: row.earnedCredits,
    status: row.status,
    progressReason: row.progressReason,
    completedAt: row.completedAt,
    calculatedAt: row.calculatedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    courseName: row.course?.name ?? null,
  };
}
