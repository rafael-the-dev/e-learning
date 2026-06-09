import { getDb } from "@/server/db";
import { buildSkipTake, buildPaginationMeta } from "@/shared/lib/pagination";
import type { PaginatedResult, PaginationParams } from "@/shared/types/common";
import type { AcademicHoliday } from "@/modules/academic-calendar/types";

// =============================================================================
// ACADEMIC HOLIDAY REPOSITORY
// All queries scoped to organizationId. Never query cross-tenant.
// =============================================================================

export interface ListAcademicHolidaysParams extends PaginationParams {
  academicYearId?: string;
  search?: string;
  status?: string;
}

const holidaySelect = {
  id: true,
  organizationId: true,
  academicYearId: true,
  name: true,
  description: true,
  startDate: true,
  endDate: true,
  isRecurring: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
  academicYear: { select: { name: true } },
} as const;

function mapToHoliday(row: {
  id: string;
  organizationId: string;
  academicYearId: string | null;
  name: string;
  description: string | null;
  startDate: Date;
  endDate: Date;
  isRecurring: boolean;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
  academicYear: { name: string } | null;
}): AcademicHoliday {
  return {
    id: row.id,
    organizationId: row.organizationId,
    academicYearId: row.academicYearId,
    name: row.name,
    description: row.description,
    startDate: row.startDate,
    endDate: row.endDate,
    isRecurring: row.isRecurring,
    status: row.status,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    deletedAt: row.deletedAt,
    yearName: row.academicYear?.name ?? null,
  };
}

export async function findAcademicHolidaysByOrganization(
  organizationId: string,
  params: ListAcademicHolidaysParams
): Promise<PaginatedResult<AcademicHoliday>> {
  const db = await getDb();
  const { skip, take } = buildSkipTake(params);

  const where = {
    organizationId,
    deletedAt: null,
    ...(params.academicYearId && { academicYearId: params.academicYearId }),
    ...(params.search && {
      name: { contains: params.search },
    }),
    ...(params.status && { status: params.status }),
  };

  const [rows, total] = await Promise.all([
    db.academicHoliday.findMany({
      where,
      select: holidaySelect,
      skip,
      take,
      orderBy: { startDate: "asc" },
    }),
    db.academicHoliday.count({ where }),
  ]);

  return buildPaginationMeta(rows.map(mapToHoliday), total, params);
}

export async function findUpcomingHolidaysByOrganization(
  organizationId: string,
  limit = 5
): Promise<AcademicHoliday[]> {
  const db = await getDb();
  const rows = await db.academicHoliday.findMany({
    where: {
      organizationId,
      deletedAt: null,
      status: { not: "ARCHIVED" },
      endDate: { gte: new Date() },
    },
    select: holidaySelect,
    orderBy: { startDate: "asc" },
    take: limit,
  });
  return rows.map(mapToHoliday);
}

export async function findAcademicHolidayByIdInOrganization(
  id: string,
  organizationId: string
): Promise<AcademicHoliday | null> {
  const db = await getDb();
  const row = await db.academicHoliday.findFirst({
    where: { id, organizationId, deletedAt: null },
    select: holidaySelect,
  });
  return row ? mapToHoliday(row) : null;
}

export async function createAcademicHoliday(data: {
  organizationId: string;
  academicYearId?: string | null;
  name: string;
  description?: string | null;
  startDate: Date;
  endDate: Date;
  isRecurring?: boolean;
  status?: string;
}): Promise<AcademicHoliday> {
  const db = await getDb();
  const row = await db.academicHoliday.create({
    data: {
      organizationId: data.organizationId,
      academicYearId: data.academicYearId ?? null,
      name: data.name,
      description: data.description ?? null,
      startDate: data.startDate,
      endDate: data.endDate,
      isRecurring: data.isRecurring ?? false,
      status: data.status ?? "ACTIVE",
    },
    select: holidaySelect,
  });
  return mapToHoliday(row);
}

export async function updateAcademicHoliday(
  id: string,
  organizationId: string,
  data: {
    academicYearId?: string | null;
    name?: string;
    description?: string | null;
    startDate?: Date;
    endDate?: Date;
    isRecurring?: boolean;
    status?: string;
  }
): Promise<AcademicHoliday> {
  const db = await getDb();
  const updateData: Record<string, unknown> = {};
  if ("academicYearId" in data) updateData.academicYearId = data.academicYearId ?? null;
  if (data.name !== undefined) updateData.name = data.name;
  if ("description" in data) updateData.description = data.description ?? null;
  if (data.startDate !== undefined) updateData.startDate = data.startDate;
  if (data.endDate !== undefined) updateData.endDate = data.endDate;
  if (data.isRecurring !== undefined) updateData.isRecurring = data.isRecurring;
  if (data.status !== undefined) updateData.status = data.status;

  const row = await db.academicHoliday.update({
    where: { id, organizationId },
    data: updateData,
    select: holidaySelect,
  });
  return mapToHoliday(row);
}

export async function archiveAcademicHoliday(
  id: string,
  organizationId: string
): Promise<void> {
  const db = await getDb();
  await db.academicHoliday.update({
    where: { id, organizationId },
    data: { status: "ARCHIVED" },
  });
}

export async function softDeleteAcademicHoliday(
  id: string,
  organizationId: string
): Promise<void> {
  const db = await getDb();
  await db.academicHoliday.update({
    where: { id, organizationId },
    data: { deletedAt: new Date() },
  });
}
