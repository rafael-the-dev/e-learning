import { getDb } from "@/server/db";
import { buildSkipTake, buildPaginationMeta } from "@/shared/lib/pagination";
import type { PaginatedResult, PaginationParams } from "@/shared/types/common";
import type { Course, CourseWithCounts } from "@/modules/courses/types";

// =============================================================================
// COURSES REPOSITORY
// All queries are scoped to organizationId. Never query cross-tenant.
// =============================================================================

export interface ListCoursesParams extends PaginationParams {
  search?: string;
  status?: string;
  category?: string;
}

const courseSelect = {
  id: true,
  organizationId: true,
  name: true,
  code: true,
  description: true,
  category: true,
  totalHours: true,
  price: true,
  status: true,
  createdAt: true,
  updatedAt: true,
} as const;

function mapToCourse(row: {
  id: string;
  organizationId: string;
  name: string;
  code: string | null;
  description: string | null;
  category: string | null;
  totalHours: number | null;
  price: { toString(): string } | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}): Course {
  return {
    ...row,
    price: row.price ? row.price.toString() : null,
  };
}

export async function findCoursesByOrganization(
  organizationId: string,
  params: ListCoursesParams
): Promise<PaginatedResult<Course>> {
  const db = await getDb();
  const { skip, take } = buildSkipTake(params);

  const where = {
    organizationId,
    deletedAt: null,
    ...(params.search && {
      OR: [
        { name: { contains: params.search } },
        { code: { contains: params.search } },
        { description: { contains: params.search } },
      ],
    }),
    ...(params.status && { status: params.status }),
    ...(params.category && { category: params.category }),
  };

  const [rows, total] = await Promise.all([
    db.course.findMany({
      where,
      select: courseSelect,
      skip,
      take,
      orderBy: { createdAt: "desc" },
    }),
    db.course.count({ where }),
  ]);

  return buildPaginationMeta(rows.map(mapToCourse), total, params);
}

export async function findCourseByIdInOrganization(
  id: string,
  organizationId: string
): Promise<Course | null> {
  const db = await getDb();
  const row = await db.course.findFirst({
    where: { id, organizationId, deletedAt: null },
    select: courseSelect,
  });
  return row ? mapToCourse(row) : null;
}

export async function findCourseWithCounts(
  id: string,
  organizationId: string
): Promise<CourseWithCounts | null> {
  const db = await getDb();
  const row = await db.course.findFirst({
    where: { id, organizationId, deletedAt: null },
    select: {
      ...courseSelect,
      _count: { select: { levels: true } },
      levels: {
        where: { status: { not: "ARCHIVED" } },
        select: {
          _count: { select: { subjects: true } },
        },
      },
    },
  });

  if (!row) return null;

  const subjectsCount = row.levels.reduce(
    (sum, l) => sum + l._count.subjects,
    0
  );

  return {
    ...mapToCourse(row),
    levelsCount: row._count.levels,
    subjectsCount,
  };
}

export async function createCourse(data: {
  organizationId: string;
  name: string;
  code?: string | null;
  description?: string | null;
  category?: string | null;
  totalHours?: number | null;
  price?: string | null;
  status?: string;
  createdBy: string;
}): Promise<Course> {
  const db = await getDb();
  const row = await db.course.create({
    data: {
      organizationId: data.organizationId,
      name: data.name,
      code: data.code ?? null,
      description: data.description ?? null,
      category: data.category ?? null,
      totalHours: data.totalHours ?? null,
      price: data.price ? parseFloat(data.price) : null,
      status: data.status ?? "DRAFT",
      isActive: data.status === "ACTIVE",
      createdBy: data.createdBy,
      updatedBy: data.createdBy,
    },
    select: courseSelect,
  });
  return mapToCourse(row);
}

export async function updateCourse(
  id: string,
  organizationId: string,
  data: {
    name?: string;
    code?: string | null;
    description?: string | null;
    category?: string | null;
    totalHours?: number | null;
    price?: string | null;
    status?: string;
    updatedBy: string;
  }
): Promise<Course> {
  const db = await getDb();
  const updateData: Record<string, unknown> = {
    updatedBy: data.updatedBy,
  };
  if (data.name !== undefined) updateData.name = data.name;
  if (data.code !== undefined) updateData.code = data.code;
  if (data.description !== undefined) updateData.description = data.description;
  if (data.category !== undefined) updateData.category = data.category;
  if (data.totalHours !== undefined) updateData.totalHours = data.totalHours;
  if (data.price !== undefined)
    updateData.price = data.price ? parseFloat(data.price) : null;
  if (data.status !== undefined) {
    updateData.status = data.status;
    updateData.isActive = data.status === "ACTIVE";
  }

  const row = await db.course.update({
    where: { id, organizationId },
    data: updateData,
    select: courseSelect,
  });
  return mapToCourse(row);
}

export async function archiveCourse(
  id: string,
  organizationId: string,
  updatedBy: string
): Promise<Course> {
  const db = await getDb();
  const row = await db.course.update({
    where: { id, organizationId },
    data: { status: "ARCHIVED", isActive: false, updatedBy },
    select: courseSelect,
  });
  return mapToCourse(row);
}

export async function softDeleteCourse(
  id: string,
  organizationId: string,
  updatedBy: string
): Promise<void> {
  const db = await getDb();
  await db.course.update({
    where: { id, organizationId },
    data: { deletedAt: new Date(), isActive: false, updatedBy },
  });
}

export async function countCoursesByStatus(
  organizationId: string
): Promise<Record<string, number>> {
  const db = await getDb();
  const results = await db.course.groupBy({
    by: ["status"],
    where: { organizationId, deletedAt: null },
    _count: { status: true },
  });
  return Object.fromEntries(results.map((r) => [r.status, r._count.status]));
}

export async function findCourseByCodes(
  organizationId: string,
  code: string,
  excludeId?: string
): Promise<Course | null> {
  const db = await getDb();
  const row = await db.course.findFirst({
    where: {
      organizationId,
      code,
      deletedAt: null,
      ...(excludeId && { NOT: { id: excludeId } }),
    },
    select: courseSelect,
  });
  return row ? mapToCourse(row) : null;
}

export async function countEnrollmentsForCourse(courseId: string): Promise<number> {
  const db = await getDb();
  return db.enrollment.count({ where: { courseId } });
}

export async function findCourseByName(
  organizationId: string,
  name: string,
  excludeId?: string
): Promise<Course | null> {
  const db = await getDb();
  const row = await db.course.findFirst({
    where: {
      organizationId,
      name,
      deletedAt: null,
      ...(excludeId && { NOT: { id: excludeId } }),
    },
    select: courseSelect,
  });
  return row ? mapToCourse(row) : null;
}
