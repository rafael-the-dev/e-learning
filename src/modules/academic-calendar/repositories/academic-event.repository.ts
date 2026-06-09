import { getDb } from "@/server/db";
import { buildSkipTake, buildPaginationMeta } from "@/shared/lib/pagination";
import type { PaginatedResult, PaginationParams } from "@/shared/types/common";
import type { AcademicEvent } from "@/modules/academic-calendar/types";

// =============================================================================
// ACADEMIC EVENT REPOSITORY
// All queries scoped to organizationId. Never query cross-tenant.
// =============================================================================

export interface ListAcademicEventsParams extends PaginationParams {
  academicYearId?: string;
  academicTermId?: string;
  eventType?: string;
  status?: string;
  search?: string;
}

const eventSelect = {
  id: true,
  organizationId: true,
  academicYearId: true,
  academicTermId: true,
  title: true,
  description: true,
  eventType: true,
  startDate: true,
  endDate: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
  academicYear: { select: { name: true } },
  academicTerm: { select: { name: true } },
} as const;

function mapToEvent(row: {
  id: string;
  organizationId: string;
  academicYearId: string | null;
  academicTermId: string | null;
  title: string;
  description: string | null;
  eventType: string;
  startDate: Date;
  endDate: Date;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
  academicYear: { name: string } | null;
  academicTerm: { name: string } | null;
}): AcademicEvent {
  return {
    id: row.id,
    organizationId: row.organizationId,
    academicYearId: row.academicYearId,
    academicTermId: row.academicTermId,
    title: row.title,
    description: row.description,
    eventType: row.eventType,
    startDate: row.startDate,
    endDate: row.endDate,
    status: row.status,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    deletedAt: row.deletedAt,
    yearName: row.academicYear?.name ?? null,
    termName: row.academicTerm?.name ?? null,
  };
}

export async function findAcademicEventsByOrganization(
  organizationId: string,
  params: ListAcademicEventsParams
): Promise<PaginatedResult<AcademicEvent>> {
  const db = await getDb();
  const { skip, take } = buildSkipTake(params);

  const where = {
    organizationId,
    deletedAt: null,
    ...(params.academicYearId && { academicYearId: params.academicYearId }),
    ...(params.academicTermId && { academicTermId: params.academicTermId }),
    ...(params.eventType && { eventType: params.eventType }),
    ...(params.status && { status: params.status }),
    ...(params.search && {
      title: { contains: params.search },
    }),
  };

  const [rows, total] = await Promise.all([
    db.academicEvent.findMany({
      where,
      select: eventSelect,
      skip,
      take,
      orderBy: { startDate: "asc" },
    }),
    db.academicEvent.count({ where }),
  ]);

  return buildPaginationMeta(rows.map(mapToEvent), total, params);
}

export async function findUpcomingEventsByOrganization(
  organizationId: string,
  limit = 5
): Promise<AcademicEvent[]> {
  const db = await getDb();
  const rows = await db.academicEvent.findMany({
    where: {
      organizationId,
      deletedAt: null,
      status: { not: "ARCHIVED" },
      endDate: { gte: new Date() },
    },
    select: eventSelect,
    orderBy: { startDate: "asc" },
    take: limit,
  });
  return rows.map(mapToEvent);
}

export async function findAcademicEventByIdInOrganization(
  id: string,
  organizationId: string
): Promise<AcademicEvent | null> {
  const db = await getDb();
  const row = await db.academicEvent.findFirst({
    where: { id, organizationId, deletedAt: null },
    select: eventSelect,
  });
  return row ? mapToEvent(row) : null;
}

export async function createAcademicEvent(data: {
  organizationId: string;
  academicYearId?: string | null;
  academicTermId?: string | null;
  title: string;
  description?: string | null;
  eventType?: string;
  startDate: Date;
  endDate: Date;
  status?: string;
}): Promise<AcademicEvent> {
  const db = await getDb();
  const row = await db.academicEvent.create({
    data: {
      organizationId: data.organizationId,
      academicYearId: data.academicYearId ?? null,
      academicTermId: data.academicTermId ?? null,
      title: data.title,
      description: data.description ?? null,
      eventType: data.eventType ?? "GENERAL",
      startDate: data.startDate,
      endDate: data.endDate,
      status: data.status ?? "DRAFT",
    },
    select: eventSelect,
  });
  return mapToEvent(row);
}

export async function updateAcademicEvent(
  id: string,
  organizationId: string,
  data: {
    academicYearId?: string | null;
    academicTermId?: string | null;
    title?: string;
    description?: string | null;
    eventType?: string;
    startDate?: Date;
    endDate?: Date;
    status?: string;
  }
): Promise<AcademicEvent> {
  const db = await getDb();
  const updateData: Record<string, unknown> = {};
  if ("academicYearId" in data) updateData.academicYearId = data.academicYearId ?? null;
  if ("academicTermId" in data) updateData.academicTermId = data.academicTermId ?? null;
  if (data.title !== undefined) updateData.title = data.title;
  if ("description" in data) updateData.description = data.description ?? null;
  if (data.eventType !== undefined) updateData.eventType = data.eventType;
  if (data.startDate !== undefined) updateData.startDate = data.startDate;
  if (data.endDate !== undefined) updateData.endDate = data.endDate;
  if (data.status !== undefined) updateData.status = data.status;

  const row = await db.academicEvent.update({
    where: { id, organizationId },
    data: updateData,
    select: eventSelect,
  });
  return mapToEvent(row);
}

export async function archiveAcademicEvent(
  id: string,
  organizationId: string
): Promise<void> {
  const db = await getDb();
  await db.academicEvent.update({
    where: { id, organizationId },
    data: { status: "ARCHIVED" },
  });
}

export async function softDeleteAcademicEvent(
  id: string,
  organizationId: string
): Promise<void> {
  const db = await getDb();
  await db.academicEvent.update({
    where: { id, organizationId },
    data: { deletedAt: new Date() },
  });
}
