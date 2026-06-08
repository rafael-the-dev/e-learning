import { getDb } from "@/server/db";
import { buildSkipTake, buildPaginationMeta } from "@/shared/lib/pagination";
import type { PaginatedResult, PaginationParams } from "@/shared/types/common";
import type { Lesson } from "@/modules/lessons/types";

// =============================================================================
// LESSON REPOSITORY
// All queries scoped to organizationId. Never query cross-tenant.
// =============================================================================

export interface ListLessonsParams extends PaginationParams {
  search?: string;
  status?: string;
  lessonType?: string;
}

const lessonSelect = {
  id: true,
  organizationId: true,
  title: true,
  slug: true,
  description: true,
  summary: true,
  objectives: true,
  durationMinutes: true,
  lessonType: true,
  videoProvider: true,
  videoUrl: true,
  externalVideoId: true,
  thumbnailUrl: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
  _count: {
    select: {
      attachments: { where: { deletedAt: null } },
      subjectLessons: { where: { deletedAt: null } },
    },
  },
} as const;

type LessonRow = {
  id: string;
  organizationId: string;
  title: string;
  slug: string;
  description: string | null;
  summary: string | null;
  objectives: string | null;
  durationMinutes: number | null;
  lessonType: string;
  videoProvider: string;
  videoUrl: string | null;
  externalVideoId: string | null;
  thumbnailUrl: string | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
  _count: { attachments: number; subjectLessons: number };
};

function mapToLesson(row: LessonRow): Lesson {
  return {
    id: row.id,
    organizationId: row.organizationId,
    title: row.title,
    slug: row.slug,
    description: row.description,
    summary: row.summary,
    objectives: row.objectives,
    durationMinutes: row.durationMinutes,
    lessonType: row.lessonType,
    videoProvider: row.videoProvider,
    videoUrl: row.videoUrl,
    externalVideoId: row.externalVideoId,
    thumbnailUrl: row.thumbnailUrl,
    status: row.status,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    deletedAt: row.deletedAt,
    attachmentsCount: row._count.attachments,
    subjectsCount: row._count.subjectLessons,
  };
}

export async function findLessonsByOrganization(
  organizationId: string,
  params: ListLessonsParams
): Promise<PaginatedResult<Lesson>> {
  const db = await getDb();
  const { skip, take } = buildSkipTake(params);

  const where = {
    organizationId,
    deletedAt: null,
    ...(params.status && { status: params.status }),
    ...(params.lessonType && { lessonType: params.lessonType }),
    ...(params.search && {
      title: { contains: params.search },
    }),
  };

  const [rows, total] = await Promise.all([
    db.lesson.findMany({
      where,
      select: lessonSelect,
      skip,
      take,
      orderBy: { createdAt: "desc" },
    }),
    db.lesson.count({ where }),
  ]);

  return buildPaginationMeta(rows.map(mapToLesson), total, params);
}

export async function findLessonByIdInOrganization(
  id: string,
  organizationId: string
): Promise<Lesson | null> {
  const db = await getDb();
  const row = await db.lesson.findFirst({
    where: { id, organizationId, deletedAt: null },
    select: lessonSelect,
  });
  return row ? mapToLesson(row) : null;
}

export async function findLessonBySlugInOrganization(
  slug: string,
  organizationId: string
): Promise<Lesson | null> {
  const db = await getDb();
  const row = await db.lesson.findFirst({
    where: { slug, organizationId, deletedAt: null },
    select: lessonSelect,
  });
  return row ? mapToLesson(row) : null;
}

export async function findAllPublishedLessons(organizationId: string): Promise<Lesson[]> {
  const db = await getDb();
  const rows = await db.lesson.findMany({
    where: { organizationId, deletedAt: null, status: "PUBLISHED" },
    select: lessonSelect,
    orderBy: { title: "asc" },
  });
  return rows.map(mapToLesson);
}

export async function createLesson(data: {
  organizationId: string;
  title: string;
  slug: string;
  description?: string | null;
  summary?: string | null;
  objectives?: string | null;
  durationMinutes?: number | null;
  lessonType: string;
  videoProvider: string;
  videoUrl?: string | null;
  externalVideoId?: string | null;
  thumbnailUrl?: string | null;
  status: string;
}): Promise<Lesson> {
  const db = await getDb();
  const row = await db.lesson.create({
    data: {
      organizationId: data.organizationId,
      title: data.title,
      slug: data.slug,
      description: data.description ?? null,
      summary: data.summary ?? null,
      objectives: data.objectives ?? null,
      durationMinutes: data.durationMinutes ?? null,
      lessonType: data.lessonType,
      videoProvider: data.videoProvider,
      videoUrl: data.videoUrl ?? null,
      externalVideoId: data.externalVideoId ?? null,
      thumbnailUrl: data.thumbnailUrl ?? null,
      status: data.status,
    },
    select: lessonSelect,
  });
  return mapToLesson(row);
}

export async function updateLesson(
  id: string,
  organizationId: string,
  data: Partial<{
    title: string;
    slug: string;
    description: string | null;
    summary: string | null;
    objectives: string | null;
    durationMinutes: number | null;
    lessonType: string;
    videoProvider: string;
    videoUrl: string | null;
    externalVideoId: string | null;
    thumbnailUrl: string | null;
    status: string;
  }>
): Promise<Lesson> {
  const db = await getDb();
  const row = await db.lesson.update({
    where: { id, organizationId },
    data,
    select: lessonSelect,
  });
  return mapToLesson(row);
}

export async function softDeleteLesson(id: string, organizationId: string): Promise<void> {
  const db = await getDb();
  await db.lesson.update({
    where: { id, organizationId },
    data: { deletedAt: new Date() },
  });
}

export async function countLessonsByOrganization(organizationId: string): Promise<number> {
  const db = await getDb();
  return db.lesson.count({ where: { organizationId, deletedAt: null } });
}

export async function countPublishedLessons(organizationId: string): Promise<number> {
  const db = await getDb();
  return db.lesson.count({ where: { organizationId, deletedAt: null, status: "PUBLISHED" } });
}
