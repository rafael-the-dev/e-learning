import { getDb } from "@/server/db";
import type {
  CourseCategory,
  CourseCategoryWithCount,
} from "@/modules/courses/types";

// =============================================================================
// COURSE CATEGORY REPOSITORY
// All queries scoped to organizationId. Never query cross-tenant.
// =============================================================================

const categorySelect = {
  id: true,
  organizationId: true,
  name: true,
  description: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  createdBy: true,
  updatedBy: true,
} as const;

function mapToCategory(row: {
  id: string;
  organizationId: string;
  name: string;
  description: string | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string | null;
  updatedBy: string | null;
}): CourseCategory {
  return { ...row };
}

export async function findCategoriesByOrganization(
  organizationId: string
): Promise<CourseCategory[]> {
  const db = await getDb();
  const rows = await db.courseCategory.findMany({
    where: { organizationId, deletedAt: null },
    select: categorySelect,
    orderBy: { name: "asc" },
  });
  return rows.map(mapToCategory);
}

export async function findActiveCategoriesByOrganization(
  organizationId: string
): Promise<CourseCategory[]> {
  const db = await getDb();
  const rows = await db.courseCategory.findMany({
    where: { organizationId, deletedAt: null, status: "ACTIVE" },
    select: categorySelect,
    orderBy: { name: "asc" },
  });
  return rows.map(mapToCategory);
}

export async function findCategoryByIdInOrganization(
  id: string,
  organizationId: string
): Promise<CourseCategory | null> {
  const db = await getDb();
  const row = await db.courseCategory.findFirst({
    where: { id, organizationId, deletedAt: null },
    select: categorySelect,
  });
  return row ? mapToCategory(row) : null;
}

export async function existsCategoryNameInOrganization(
  organizationId: string,
  name: string,
  excludeId?: string
): Promise<boolean> {
  const db = await getDb();
  const row = await db.courseCategory.findFirst({
    where: {
      organizationId,
      name,
      deletedAt: null,
      ...(excludeId && { NOT: { id: excludeId } }),
    },
    select: { id: true },
  });
  return !!row;
}

export async function countCoursesUsingCategory(
  categoryId: string
): Promise<number> {
  const db = await getDb();
  return db.course.count({ where: { categoryId, deletedAt: null } });
}

export async function createCourseCategory(data: {
  organizationId: string;
  name: string;
  description?: string | null;
  status?: string;
  createdBy: string;
}): Promise<CourseCategory> {
  const db = await getDb();
  const row = await db.courseCategory.create({
    data: {
      organizationId: data.organizationId,
      name: data.name,
      description: data.description ?? null,
      status: data.status ?? "ACTIVE",
      createdBy: data.createdBy,
      updatedBy: data.createdBy,
    },
    select: categorySelect,
  });
  return mapToCategory(row);
}

export async function updateCourseCategory(
  id: string,
  data: {
    name?: string;
    description?: string | null;
    status?: string;
    updatedBy: string;
  }
): Promise<CourseCategory> {
  const db = await getDb();
  const updateData: Record<string, unknown> = { updatedBy: data.updatedBy };
  if (data.name !== undefined) updateData.name = data.name;
  if (data.description !== undefined) updateData.description = data.description;
  if (data.status !== undefined) updateData.status = data.status;

  const row = await db.courseCategory.update({
    where: { id },
    data: updateData,
    select: categorySelect,
  });
  return mapToCategory(row);
}

export async function archiveCourseCategory(
  id: string,
  updatedBy: string
): Promise<CourseCategory> {
  const db = await getDb();
  const row = await db.courseCategory.update({
    where: { id },
    data: { status: "ARCHIVED", updatedBy },
    select: categorySelect,
  });
  return mapToCategory(row);
}

export async function softDeleteCourseCategory(
  id: string,
  updatedBy: string
): Promise<void> {
  const db = await getDb();
  await db.courseCategory.update({
    where: { id },
    data: { deletedAt: new Date(), updatedBy },
  });
}

export async function findCategoriesWithCountsByOrganization(
  organizationId: string
): Promise<CourseCategoryWithCount[]> {
  const db = await getDb();
  const rows = await db.courseCategory.findMany({
    where: { organizationId, deletedAt: null },
    select: {
      ...categorySelect,
      _count: { select: { courses: { where: { deletedAt: null } } } },
    },
    orderBy: { name: "asc" },
  });
  return rows.map((r) => ({
    ...mapToCategory(r),
    coursesCount: r._count.courses,
  }));
}
