import { getDb } from "@/server/db";
import { buildSkipTake, buildPaginationMeta } from "@/shared/lib/pagination";
import type { PaginatedResult, PaginationParams } from "@/shared/types/common";
import type { Classroom } from "@/modules/classrooms/types";

// =============================================================================
// CLASSROOM REPOSITORY — all queries scoped to organizationId
// =============================================================================

export interface ListClassroomsParams extends PaginationParams {
  search?: string;
  status?: string;
  classroomType?: string;
  branchId?: string;
  minCapacity?: number;
}

const classroomSelect = {
  id: true,
  organizationId: true,
  branchId: true,
  code: true,
  name: true,
  description: true,
  classroomType: true,
  capacity: true,
  location: true,
  floor: true,
  meetingProvider: true,
  meetingUrl: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
  branch: { select: { id: true, name: true } },
  _count: { select: { features: true, resources: true, bookings: true } },
} as const;

function mapToClassroom(row: {
  id: string;
  organizationId: string;
  branchId: string | null;
  code: string;
  name: string;
  description: string | null;
  classroomType: string;
  capacity: number;
  location: string | null;
  floor: string | null;
  meetingProvider: string | null;
  meetingUrl: string | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
  branch: { id: string; name: string } | null;
  _count: { features: number; resources: number; bookings: number };
}): Classroom {
  return {
    id: row.id,
    organizationId: row.organizationId,
    branchId: row.branchId,
    code: row.code,
    name: row.name,
    description: row.description,
    classroomType: row.classroomType,
    capacity: row.capacity,
    location: row.location,
    floor: row.floor,
    meetingProvider: row.meetingProvider,
    meetingUrl: row.meetingUrl,
    status: row.status,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    deletedAt: row.deletedAt,
    branchName: row.branch?.name ?? null,
    featuresCount: row._count.features,
    resourcesCount: row._count.resources,
    bookingsCount: row._count.bookings,
  };
}

export async function findClassroomsByOrganization(
  organizationId: string,
  params: ListClassroomsParams
): Promise<PaginatedResult<Classroom>> {
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
    ...(params.classroomType && { classroomType: params.classroomType }),
    ...(params.branchId && { branchId: params.branchId }),
    ...(params.minCapacity && { capacity: { gte: params.minCapacity } }),
  };

  const [rows, total] = await Promise.all([
    db.classroom.findMany({ where, select: classroomSelect, skip, take, orderBy: [{ createdAt: "desc" }] }),
    db.classroom.count({ where }),
  ]);

  return buildPaginationMeta(rows.map(mapToClassroom), total, params);
}

export async function findClassroomById(
  id: string,
  organizationId: string
): Promise<Classroom | null> {
  const db = await getDb();
  const row = await db.classroom.findFirst({
    where: { id, organizationId, deletedAt: null },
    select: classroomSelect,
  });
  return row ? mapToClassroom(row) : null;
}

export async function findClassroomByCode(
  organizationId: string,
  branchId: string | null,
  code: string,
  excludeId?: string
): Promise<Classroom | null> {
  const db = await getDb();
  const row = await db.classroom.findFirst({
    where: {
      organizationId,
      branchId: branchId ?? null,
      code,
      deletedAt: null,
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
    select: classroomSelect,
  });
  return row ? mapToClassroom(row) : null;
}

export async function createClassroom(data: {
  organizationId: string;
  branchId?: string | null;
  code: string;
  name: string;
  description?: string | null;
  classroomType: string;
  capacity: number;
  location?: string | null;
  floor?: string | null;
  meetingProvider?: string | null;
  meetingUrl?: string | null;
  status: string;
}): Promise<Classroom> {
  const db = await getDb();
  const row = await db.classroom.create({
    data: {
      organizationId: data.organizationId,
      branchId: data.branchId ?? null,
      code: data.code,
      name: data.name,
      description: data.description ?? null,
      classroomType: data.classroomType,
      capacity: data.capacity,
      location: data.location ?? null,
      floor: data.floor ?? null,
      meetingProvider: data.meetingProvider ?? null,
      meetingUrl: data.meetingUrl ?? null,
      status: data.status,
    },
    select: classroomSelect,
  });
  return mapToClassroom(row);
}

export async function updateClassroom(
  id: string,
  organizationId: string,
  data: {
    branchId?: string | null;
    code?: string;
    name?: string;
    description?: string | null;
    classroomType?: string;
    capacity?: number;
    location?: string | null;
    floor?: string | null;
    meetingProvider?: string | null;
    meetingUrl?: string | null;
    status?: string;
  }
): Promise<Classroom> {
  const db = await getDb();
  const updateData: Record<string, unknown> = {};
  if (data.branchId !== undefined) updateData.branchId = data.branchId;
  if (data.code !== undefined) updateData.code = data.code;
  if (data.name !== undefined) updateData.name = data.name;
  if (data.description !== undefined) updateData.description = data.description;
  if (data.classroomType !== undefined) updateData.classroomType = data.classroomType;
  if (data.capacity !== undefined) updateData.capacity = data.capacity;
  if (data.location !== undefined) updateData.location = data.location;
  if (data.floor !== undefined) updateData.floor = data.floor;
  if (data.meetingProvider !== undefined) updateData.meetingProvider = data.meetingProvider;
  if (data.meetingUrl !== undefined) updateData.meetingUrl = data.meetingUrl;
  if (data.status !== undefined) updateData.status = data.status;

  const row = await db.classroom.update({
    where: { id, organizationId },
    data: updateData,
    select: classroomSelect,
  });
  return mapToClassroom(row);
}

export async function archiveClassroom(id: string, organizationId: string): Promise<void> {
  const db = await getDb();
  await db.classroom.update({ where: { id, organizationId }, data: { status: "ARCHIVED" } });
}

export async function softDeleteClassroom(id: string, organizationId: string): Promise<void> {
  const db = await getDb();
  await db.classroom.update({ where: { id, organizationId }, data: { deletedAt: new Date() } });
}

export async function countClassroomsByStatus(
  organizationId: string
): Promise<Record<string, number>> {
  const db = await getDb();
  const rows = await db.classroom.groupBy({
    by: ["status"],
    where: { organizationId, deletedAt: null },
    _count: { _all: true },
  });
  const result: Record<string, number> = {};
  for (const row of rows) result[row.status] = row._count._all;
  return result;
}

export async function findActiveClassrooms(
  organizationId: string,
  branchId?: string | null
): Promise<Array<{ id: string; name: string; code: string; capacity: number; classroomType: string }>> {
  const db = await getDb();
  return db.classroom.findMany({
    where: {
      organizationId,
      deletedAt: null,
      status: "ACTIVE",
      ...(branchId ? { branchId } : {}),
    },
    select: { id: true, name: true, code: true, capacity: true, classroomType: true },
    orderBy: [{ name: "asc" }],
  });
}
