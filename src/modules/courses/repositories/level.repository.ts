import { getDb } from "@/server/db";
import type { CourseLevel } from "@/modules/courses/types";

// =============================================================================
// COURSE LEVELS REPOSITORY
// CourseLevel has no direct organizationId — scope via course.organizationId.
// All ownership verification happens in commands before these functions are called.
// =============================================================================

const levelSelect = {
  id: true,
  courseId: true,
  name: true,
  code: true,
  description: true,
  order: true,
  totalHours: true,
  status: true,
  createdAt: true,
  updatedAt: true,
} as const;

function mapToLevel(
  row: {
    id: string;
    courseId: string;
    name: string;
    code: string | null;
    description: string | null;
    order: number;
    totalHours: number | null;
    status: string;
    createdAt: Date;
    updatedAt: Date;
  },
  extras?: { subjectsCount?: number; courseName?: string }
): CourseLevel {
  return { ...row, ...extras };
}

export async function findLevelsByCourse(
  courseId: string,
  organizationId: string
): Promise<CourseLevel[]> {
  const db = await getDb();
  const rows = await db.courseLevel.findMany({
    where: {
      courseId,
      course: { organizationId, deletedAt: null },
    },
    select: {
      ...levelSelect,
      _count: { select: { levelSubjects: true } },
    },
    orderBy: { order: "asc" },
  });

  return rows.map((r) =>
    mapToLevel(r, { subjectsCount: r._count.levelSubjects })
  );
}

export async function findLevelByIdInOrganization(
  id: string,
  organizationId: string
): Promise<CourseLevel | null> {
  const db = await getDb();
  const row = await db.courseLevel.findFirst({
    where: {
      id,
      course: { organizationId, deletedAt: null },
    },
    select: levelSelect,
  });
  return row ? mapToLevel(row) : null;
}

export async function createCourseLevel(data: {
  courseId: string;
  name: string;
  code?: string | null;
  description?: string | null;
  order?: number;
  totalHours?: number | null;
}): Promise<CourseLevel> {
  const db = await getDb();

  // Auto-increment order if not provided
  let order = data.order;
  if (order === undefined || order === null) {
    const last = await db.courseLevel.findFirst({
      where: { courseId: data.courseId },
      orderBy: { order: "desc" },
      select: { order: true },
    });
    order = last ? last.order + 1 : 0;
  }

  const row = await db.courseLevel.create({
    data: {
      courseId: data.courseId,
      name: data.name,
      code: data.code ?? null,
      description: data.description ?? null,
      order,
      totalHours: data.totalHours ?? null,
      status: "ACTIVE",
      isActive: true,
    },
    select: levelSelect,
  });
  return mapToLevel(row);
}

export async function updateCourseLevel(
  id: string,
  data: {
    name?: string;
    code?: string | null;
    description?: string | null;
    order?: number;
    totalHours?: number | null;
    status?: string;
  }
): Promise<CourseLevel> {
  const db = await getDb();

  const updateData: Record<string, unknown> = {};
  if (data.name !== undefined) updateData.name = data.name;
  if (data.code !== undefined) updateData.code = data.code;
  if (data.description !== undefined) updateData.description = data.description;
  if (data.order !== undefined) updateData.order = data.order;
  if (data.totalHours !== undefined) updateData.totalHours = data.totalHours;
  if (data.status !== undefined) {
    updateData.status = data.status;
    updateData.isActive = data.status === "ACTIVE";
  }

  const row = await db.courseLevel.update({
    where: { id },
    data: updateData,
    select: levelSelect,
  });
  return mapToLevel(row);
}

export async function archiveCourseLevel(id: string): Promise<CourseLevel> {
  const db = await getDb();
  const row = await db.courseLevel.update({
    where: { id },
    data: { status: "ARCHIVED", isActive: false },
    select: levelSelect,
  });
  return mapToLevel(row);
}

export async function deleteCourseLevel(id: string): Promise<void> {
  const db = await getDb();
  await db.courseLevel.delete({ where: { id } });
}

export async function countActiveSubjectsInLevel(levelId: string): Promise<number> {
  const db = await getDb();
  return db.levelSubject.count({
    where: { courseLevelId: levelId, deletedAt: null, status: { not: "ARCHIVED" } },
  });
}

export async function existsLevelNameInCourse(
  courseId: string,
  name: string,
  excludeId?: string
): Promise<boolean> {
  const db = await getDb();
  const row = await db.courseLevel.findFirst({
    where: {
      courseId,
      name: { equals: name },
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
    select: { id: true },
  });
  return row !== null;
}

export async function reorderCourseLevels(
  levelIds: string[]
): Promise<void> {
  const db = await getDb();
  await db.$transaction(
    levelIds.map((id, index) =>
      db.courseLevel.update({ where: { id }, data: { order: index } })
    )
  );
}
