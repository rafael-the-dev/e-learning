import { getDb } from "@/server/db";
import type { StudentLessonProgress } from "@/modules/lessons/types";

const progressSelect = {
  id: true,
  organizationId: true,
  studentId: true,
  enrollmentId: true,
  subjectId: true,
  lessonId: true,
  subjectLessonId: true,
  watchedSeconds: true,
  progressPercentage: true,
  status: true,
  completedAt: true,
  lastAccessedAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

type ProgressRow = {
  id: string;
  organizationId: string;
  studentId: string;
  enrollmentId: string;
  subjectId: string;
  lessonId: string;
  subjectLessonId: string | null;
  watchedSeconds: number;
  progressPercentage: { toNumber(): number };
  status: string;
  completedAt: Date | null;
  lastAccessedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

function mapToProgress(row: ProgressRow): StudentLessonProgress {
  return {
    id: row.id,
    organizationId: row.organizationId,
    studentId: row.studentId,
    enrollmentId: row.enrollmentId,
    subjectId: row.subjectId,
    lessonId: row.lessonId,
    subjectLessonId: row.subjectLessonId,
    watchedSeconds: row.watchedSeconds,
    progressPercentage: row.progressPercentage.toNumber(),
    status: row.status,
    completedAt: row.completedAt,
    lastAccessedAt: row.lastAccessedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function findProgressByStudentAndEnrollment(
  studentId: string,
  enrollmentId: string,
  organizationId: string
): Promise<StudentLessonProgress[]> {
  const db = await getDb();
  const rows = await db.studentLessonProgress.findMany({
    where: { studentId, enrollmentId, organizationId },
    select: progressSelect,
  });
  return rows.map(mapToProgress);
}

export async function findProgressByStudentLesson(
  studentId: string,
  enrollmentId: string,
  lessonId: string
): Promise<StudentLessonProgress | null> {
  const db = await getDb();
  const row = await db.studentLessonProgress.findUnique({
    where: { studentId_enrollmentId_lessonId: { studentId, enrollmentId, lessonId } },
    select: progressSelect,
  });
  return row ? mapToProgress(row) : null;
}

export async function upsertLessonProgress(data: {
  organizationId: string;
  studentId: string;
  enrollmentId: string;
  subjectId: string;
  lessonId: string;
  subjectLessonId?: string | null;
  watchedSeconds: number;
  progressPercentage: number;
  status: string;
  completedAt?: Date | null;
  lastAccessedAt?: Date | null;
}): Promise<StudentLessonProgress> {
  const db = await getDb();
  const row = await db.studentLessonProgress.upsert({
    where: {
      studentId_enrollmentId_lessonId: {
        studentId: data.studentId,
        enrollmentId: data.enrollmentId,
        lessonId: data.lessonId,
      },
    },
    create: {
      organizationId: data.organizationId,
      studentId: data.studentId,
      enrollmentId: data.enrollmentId,
      subjectId: data.subjectId,
      lessonId: data.lessonId,
      subjectLessonId: data.subjectLessonId ?? null,
      watchedSeconds: data.watchedSeconds,
      progressPercentage: data.progressPercentage,
      status: data.status,
      completedAt: data.completedAt ?? null,
      lastAccessedAt: data.lastAccessedAt ?? new Date(),
    },
    update: {
      watchedSeconds: data.watchedSeconds,
      progressPercentage: data.progressPercentage,
      status: data.status,
      completedAt: data.completedAt ?? null,
      lastAccessedAt: data.lastAccessedAt ?? new Date(),
    },
    select: progressSelect,
  });
  return mapToProgress(row);
}
