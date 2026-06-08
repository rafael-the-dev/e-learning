import { getDb } from "@/server/db";
import type { SubjectLesson } from "@/modules/lessons/types";

const subjectLessonSelect = {
  id: true,
  organizationId: true,
  subjectId: true,
  lessonId: true,
  order: true,
  isRequired: true,
  minWatchPercentage: true,
  unlockAfterLessonId: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
  lesson: {
    select: {
      id: true,
      title: true,
      slug: true,
      lessonType: true,
      durationMinutes: true,
      status: true,
      videoProvider: true,
    },
  },
} as const;

type SubjectLessonRow = {
  id: string;
  organizationId: string;
  subjectId: string;
  lessonId: string;
  order: number;
  isRequired: boolean;
  minWatchPercentage: number;
  unlockAfterLessonId: string | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
  lesson: {
    id: string;
    title: string;
    slug: string;
    lessonType: string;
    durationMinutes: number | null;
    status: string;
    videoProvider: string;
  };
};

function mapToSubjectLesson(row: SubjectLessonRow): SubjectLesson {
  return {
    id: row.id,
    organizationId: row.organizationId,
    subjectId: row.subjectId,
    lessonId: row.lessonId,
    order: row.order,
    isRequired: row.isRequired,
    minWatchPercentage: row.minWatchPercentage,
    unlockAfterLessonId: row.unlockAfterLessonId,
    status: row.status,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    deletedAt: row.deletedAt,
    lesson: row.lesson,
  };
}

export async function findSubjectLessonsBySubject(
  subjectId: string,
  organizationId: string
): Promise<SubjectLesson[]> {
  const db = await getDb();
  const rows = await db.subjectLesson.findMany({
    where: { subjectId, organizationId, deletedAt: null },
    select: subjectLessonSelect,
    orderBy: { order: "asc" },
  });
  return rows.map(mapToSubjectLesson);
}

export async function findSubjectLessonByIdInOrganization(
  id: string,
  organizationId: string
): Promise<SubjectLesson | null> {
  const db = await getDb();
  const row = await db.subjectLesson.findFirst({
    where: { id, organizationId, deletedAt: null },
    select: subjectLessonSelect,
  });
  return row ? mapToSubjectLesson(row) : null;
}

export async function findSubjectLessonByPair(
  subjectId: string,
  lessonId: string,
  excludeId?: string
): Promise<SubjectLesson | null> {
  const db = await getDb();
  const row = await db.subjectLesson.findFirst({
    where: {
      subjectId,
      lessonId,
      deletedAt: null,
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
    select: subjectLessonSelect,
  });
  return row ? mapToSubjectLesson(row) : null;
}

export async function findDuplicateOrder(
  subjectId: string,
  order: number,
  excludeId?: string
): Promise<SubjectLesson | null> {
  const db = await getDb();
  const row = await db.subjectLesson.findFirst({
    where: {
      subjectId,
      order,
      deletedAt: null,
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
    select: subjectLessonSelect,
  });
  return row ? mapToSubjectLesson(row) : null;
}

export async function getNextOrderForSubject(subjectId: string): Promise<number> {
  const db = await getDb();
  const last = await db.subjectLesson.findFirst({
    where: { subjectId, deletedAt: null },
    orderBy: { order: "desc" },
    select: { order: true },
  });
  return (last?.order ?? -1) + 1;
}

export async function createSubjectLesson(data: {
  organizationId: string;
  subjectId: string;
  lessonId: string;
  order: number;
  isRequired: boolean;
  minWatchPercentage: number;
  unlockAfterLessonId?: string | null;
}): Promise<SubjectLesson> {
  const db = await getDb();
  const row = await db.subjectLesson.create({
    data: {
      organizationId: data.organizationId,
      subjectId: data.subjectId,
      lessonId: data.lessonId,
      order: data.order,
      isRequired: data.isRequired,
      minWatchPercentage: data.minWatchPercentage,
      unlockAfterLessonId: data.unlockAfterLessonId ?? null,
      status: "ACTIVE",
    },
    select: subjectLessonSelect,
  });
  return mapToSubjectLesson(row);
}

export async function updateSubjectLesson(
  id: string,
  organizationId: string,
  data: Partial<{
    isRequired: boolean;
    minWatchPercentage: number;
    unlockAfterLessonId: string | null;
    status: string;
  }>
): Promise<SubjectLesson> {
  const db = await getDb();
  const row = await db.subjectLesson.update({
    where: { id, organizationId },
    data,
    select: subjectLessonSelect,
  });
  return mapToSubjectLesson(row);
}

export async function softDeleteSubjectLesson(id: string, organizationId: string): Promise<void> {
  const db = await getDb();
  await db.subjectLesson.update({
    where: { id, organizationId },
    data: { deletedAt: new Date() },
  });
}

export async function reorderSubjectLessons(
  subjectId: string,
  organizationId: string,
  orderedIds: string[]
): Promise<void> {
  const db = await getDb();
  await Promise.all(
    orderedIds.map((id, index) =>
      db.subjectLesson.updateMany({
        where: { id, subjectId, organizationId, deletedAt: null },
        data: { order: index },
      })
    )
  );
}

export async function findSubjectsByLesson(
  lessonId: string,
  organizationId: string
): Promise<{ subjectId: string; subjectName: string }[]> {
  const db = await getDb();
  const rows = await db.subjectLesson.findMany({
    where: { lessonId, organizationId, deletedAt: null },
    select: {
      subjectId: true,
      subject: { select: { name: true } },
    },
  });
  return rows.map((r) => ({ subjectId: r.subjectId, subjectName: r.subject.name }));
}
