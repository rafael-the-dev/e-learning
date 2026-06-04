import { getDb } from "@/server/db";
import { buildSkipTake, buildPaginationMeta } from "@/shared/lib/pagination";
import type { PaginatedResult, PaginationParams } from "@/shared/types/common";
import type { ClassGroup, ClassGroupWithSchedules } from "@/modules/class-groups/types";

// =============================================================================
// CLASS GROUP REPOSITORY
// All queries are scoped to organizationId. Never query cross-tenant.
// =============================================================================

export interface ListClassGroupsParams extends PaginationParams {
  search?: string;
  status?: string;
  courseId?: string;
  branchId?: string;
}

const classGroupSelect = {
  id: true,
  organizationId: true,
  branchId: true,
  courseId: true,
  courseLevelId: true,
  teacherId: true,
  name: true,
  code: true,
  capacity: true,
  currentCount: true,
  startDate: true,
  endDate: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
  course: { select: { id: true, name: true } },
  courseLevel: { select: { id: true, name: true } },
  teacher: { select: { id: true, firstName: true, lastName: true } },
  branch: { select: { id: true, name: true } },
  _count: { select: { enrollments: true, schedules: true } },
} as const;

function mapToClassGroup(row: {
  id: string;
  organizationId: string;
  branchId: string | null;
  courseId: string;
  courseLevelId: string | null;
  teacherId: string | null;
  name: string;
  code: string | null;
  capacity: number;
  currentCount: number;
  startDate: Date | null;
  endDate: Date | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
  course: { id: string; name: string };
  courseLevel: { id: string; name: string } | null;
  teacher: { id: string; firstName: string; lastName: string } | null;
  branch: { id: string; name: string } | null;
  _count: { enrollments: number; schedules: number };
}): ClassGroup {
  return {
    id: row.id,
    organizationId: row.organizationId,
    branchId: row.branchId,
    courseId: row.courseId,
    courseLevelId: row.courseLevelId,
    teacherId: row.teacherId,
    name: row.name,
    code: row.code,
    capacity: row.capacity,
    currentCount: row.currentCount,
    startDate: row.startDate,
    endDate: row.endDate,
    status: row.status,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    deletedAt: row.deletedAt,
    courseName: row.course.name,
    courseLevelName: row.courseLevel?.name ?? null,
    teacherName: row.teacher
      ? `${row.teacher.firstName} ${row.teacher.lastName}`
      : null,
    branchName: row.branch?.name ?? null,
    enrollmentsCount: row._count.enrollments,
    schedulesCount: row._count.schedules,
  };
}

export async function findClassGroupsByOrganization(
  organizationId: string,
  params: ListClassGroupsParams
): Promise<PaginatedResult<ClassGroup>> {
  const db = await getDb();
  const { skip, take } = buildSkipTake(params);

  const where = {
    organizationId,
    deletedAt: null,
    ...(params.search && {
      OR: [
        { name: { contains: params.search } },
        { code: { contains: params.search } },
      ],
    }),
    ...(params.status && { status: params.status }),
    ...(params.courseId && { courseId: params.courseId }),
    ...(params.branchId && { branchId: params.branchId }),
  };

  const [rows, total] = await Promise.all([
    db.classGroup.findMany({
      where,
      select: classGroupSelect,
      skip,
      take,
      orderBy: [{ createdAt: "desc" }],
    }),
    db.classGroup.count({ where }),
  ]);

  return buildPaginationMeta(rows.map(mapToClassGroup), total, params);
}

export async function findClassGroupById(
  id: string,
  organizationId: string
): Promise<ClassGroupWithSchedules | null> {
  const db = await getDb();
  const row = await db.classGroup.findFirst({
    where: { id, organizationId, deletedAt: null },
    select: {
      ...classGroupSelect,
      schedules: {
        select: {
          id: true,
          classGroupId: true,
          dayOfWeek: true,
          startTime: true,
          endTime: true,
          room: true,
          createdAt: true,
          updatedAt: true,
        },
        orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }],
      },
    },
  });
  if (!row) return null;

  return {
    ...mapToClassGroup(row),
    schedules: row.schedules,
  };
}

export async function findClassGroupByCode(
  organizationId: string,
  code: string,
  excludeId?: string
): Promise<ClassGroup | null> {
  const db = await getDb();
  const row = await db.classGroup.findFirst({
    where: {
      organizationId,
      code,
      deletedAt: null,
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
    select: classGroupSelect,
  });
  return row ? mapToClassGroup(row) : null;
}

export async function createClassGroup(data: {
  organizationId: string;
  branchId?: string | null;
  courseId: string;
  courseLevelId?: string | null;
  teacherId?: string | null;
  name: string;
  code?: string | null;
  capacity: number;
  startDate?: Date | null;
  endDate?: Date | null;
  status: string;
  createdBy?: string | null;
}): Promise<ClassGroup> {
  const db = await getDb();
  const row = await db.classGroup.create({
    data: {
      organizationId: data.organizationId,
      branchId: data.branchId ?? null,
      courseId: data.courseId,
      courseLevelId: data.courseLevelId ?? null,
      teacherId: data.teacherId ?? null,
      name: data.name,
      code: data.code ?? null,
      capacity: data.capacity,
      startDate: data.startDate ?? null,
      endDate: data.endDate ?? null,
      status: data.status,
      createdBy: data.createdBy ?? null,
    },
    select: classGroupSelect,
  });
  return mapToClassGroup(row);
}

export async function updateClassGroup(
  id: string,
  organizationId: string,
  data: {
    name?: string;
    code?: string | null;
    courseId?: string;
    courseLevelId?: string | null;
    branchId?: string | null;
    teacherId?: string | null;
    capacity?: number;
    startDate?: Date | null;
    endDate?: Date | null;
    status?: string;
  }
): Promise<ClassGroup> {
  const db = await getDb();
  const updateData: Record<string, unknown> = {};
  if (data.name !== undefined) updateData.name = data.name;
  if (data.code !== undefined) updateData.code = data.code;
  if (data.courseId !== undefined) updateData.courseId = data.courseId;
  if (data.courseLevelId !== undefined) updateData.courseLevelId = data.courseLevelId;
  if (data.branchId !== undefined) updateData.branchId = data.branchId;
  if (data.teacherId !== undefined) updateData.teacherId = data.teacherId;
  if (data.capacity !== undefined) updateData.capacity = data.capacity;
  if (data.startDate !== undefined) updateData.startDate = data.startDate;
  if (data.endDate !== undefined) updateData.endDate = data.endDate;
  if (data.status !== undefined) updateData.status = data.status;

  const row = await db.classGroup.update({
    where: { id, organizationId },
    data: updateData,
    select: classGroupSelect,
  });
  return mapToClassGroup(row);
}

export async function archiveClassGroup(
  id: string,
  organizationId: string
): Promise<void> {
  const db = await getDb();
  await db.classGroup.update({
    where: { id, organizationId },
    data: { status: "ARCHIVED" },
  });
}

export async function softDeleteClassGroup(
  id: string,
  organizationId: string
): Promise<void> {
  const db = await getDb();
  await db.classGroup.update({
    where: { id, organizationId },
    data: { deletedAt: new Date() },
  });
}

export async function countEnrollmentsForClassGroup(
  classGroupId: string
): Promise<number> {
  const db = await getDb();
  return db.enrollment.count({
    where: {
      classGroupId,
      status: { notIn: ["CANCELLED", "COMPLETED"] },
    },
  });
}

export async function countClassGroupsByStatus(
  organizationId: string
): Promise<Record<string, number>> {
  const db = await getDb();
  const rows = await db.classGroup.groupBy({
    by: ["status"],
    where: { organizationId, deletedAt: null },
    _count: { _all: true },
  });
  const result: Record<string, number> = {};
  for (const row of rows) {
    result[row.status] = row._count._all;
  }
  return result;
}
