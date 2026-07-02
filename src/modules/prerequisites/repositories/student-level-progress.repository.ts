"use server";

import { getDb, type PrismaClientOrTx } from "@/server/db";
import type { StudentLevelProgress } from "@/modules/prerequisites/types";

export async function findLevelProgressByEnrollment(
  enrollmentId: string,
  organizationId: string,
  client?: PrismaClientOrTx
): Promise<StudentLevelProgress[]> {
  const db = client ?? await getDb();
  const rows = await db.studentLevelProgress.findMany({
    where: { enrollmentId, organizationId },
    include: {
      courseLevel: { select: { name: true, order: true } },
    },
    orderBy: { courseLevel: { order: "asc" } },
  });
  return rows.map(mapRow);
}

export async function findLevelProgress(
  enrollmentId: string,
  courseLevelId: string,
  organizationId: string
): Promise<StudentLevelProgress | null> {
  const db = await getDb();
  const row = await db.studentLevelProgress.findFirst({
    where: { enrollmentId, courseLevelId, organizationId },
    include: { courseLevel: { select: { name: true, order: true } } },
  });
  return row ? mapRow(row) : null;
}

export async function upsertStudentLevelProgress(data: {
  organizationId: string;
  enrollmentId: string;
  studentId: string;
  courseId: string;
  courseLevelId: string;
  finalGrade: number | null;
  earnedCredits: number;
  status: string;
  progressReason: string | null;
  completedAt: Date | null;
}, client?: PrismaClientOrTx): Promise<StudentLevelProgress> {
  const db = client ?? await getDb();
  const now = new Date();
  const row = await db.studentLevelProgress.upsert({
    where: { enrollmentId_courseLevelId: { enrollmentId: data.enrollmentId, courseLevelId: data.courseLevelId } },
    create: {
      organizationId: data.organizationId,
      enrollmentId: data.enrollmentId,
      studentId: data.studentId,
      courseId: data.courseId,
      courseLevelId: data.courseLevelId,
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
    include: { courseLevel: { select: { name: true, order: true } } },
  });
  return mapRow(row);
}

function mapRow(row: {
  id: string; organizationId: string; enrollmentId: string; studentId: string;
  courseId: string; courseLevelId: string; finalGrade: unknown; earnedCredits: number | null;
  status: string; progressReason: string | null; completedAt: Date | null;
  calculatedAt: Date | null; createdAt: Date; updatedAt: Date;
  courseLevel?: { name: string; order: number } | null;
}): StudentLevelProgress {
  return {
    id: row.id,
    organizationId: row.organizationId,
    enrollmentId: row.enrollmentId,
    studentId: row.studentId,
    courseId: row.courseId,
    courseLevelId: row.courseLevelId,
    finalGrade: row.finalGrade != null ? parseFloat(String(row.finalGrade)) : null,
    earnedCredits: row.earnedCredits,
    status: row.status,
    progressReason: row.progressReason,
    completedAt: row.completedAt,
    calculatedAt: row.calculatedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    courseLevelName: row.courseLevel?.name ?? null,
    courseLevelOrder: row.courseLevel?.order ?? null,
  };
}
