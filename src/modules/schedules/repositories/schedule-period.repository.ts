import { getDb } from "@/server/db";
import { buildSkipTake, buildPaginationMeta } from "@/shared/lib/pagination";
import type { PaginatedResult, PaginationParams } from "@/shared/types/common";
import type { SchedulePeriod } from "@/modules/schedules/types";

// =============================================================================
// SCHEDULE PERIOD REPOSITORY
// All queries scoped to organizationId. Never query cross-tenant.
// =============================================================================

export interface ListSchedulePeriodsParams extends PaginationParams {
  search?: string;
  status?: string;
}

const periodSelect = {
  id: true,
  organizationId: true,
  name: true,
  code: true,
  description: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
  _count: { select: { slots: true } },
} as const;

function mapToPeriod(row: {
  id: string;
  organizationId: string;
  name: string;
  code: string;
  description: string | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
  _count: { slots: number };
}): SchedulePeriod {
  return {
    id: row.id,
    organizationId: row.organizationId,
    name: row.name,
    code: row.code,
    description: row.description,
    status: row.status,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    deletedAt: row.deletedAt,
    slotsCount: row._count.slots,
  };
}

export async function findSchedulePeriodsByOrganization(
  organizationId: string,
  params: ListSchedulePeriodsParams
): Promise<PaginatedResult<SchedulePeriod>> {
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
  };

  const [rows, total] = await Promise.all([
    db.schedulePeriod.findMany({ where, select: periodSelect, skip, take, orderBy: { name: "asc" } }),
    db.schedulePeriod.count({ where }),
  ]);

  return buildPaginationMeta(rows.map(mapToPeriod), total, params);
}

export async function findAllSchedulePeriodsByOrganization(
  organizationId: string
): Promise<SchedulePeriod[]> {
  const db = await getDb();
  const rows = await db.schedulePeriod.findMany({
    where: { organizationId, deletedAt: null, status: "ACTIVE" },
    select: periodSelect,
    orderBy: { name: "asc" },
  });
  return rows.map(mapToPeriod);
}

export async function findSchedulePeriodByIdInOrganization(
  id: string,
  organizationId: string
): Promise<SchedulePeriod | null> {
  const db = await getDb();
  const row = await db.schedulePeriod.findFirst({
    where: { id, organizationId, deletedAt: null },
    select: periodSelect,
  });
  return row ? mapToPeriod(row) : null;
}

export async function findSchedulePeriodByCode(
  organizationId: string,
  code: string,
  excludeId?: string
): Promise<SchedulePeriod | null> {
  const db = await getDb();
  const row = await db.schedulePeriod.findFirst({
    where: {
      organizationId,
      code,
      deletedAt: null,
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
    select: periodSelect,
  });
  return row ? mapToPeriod(row) : null;
}

export async function createSchedulePeriod(data: {
  organizationId: string;
  name: string;
  code: string;
  description?: string | null;
  status?: string;
}): Promise<SchedulePeriod> {
  const db = await getDb();
  const row = await db.schedulePeriod.create({
    data: {
      organizationId: data.organizationId,
      name: data.name,
      code: data.code,
      description: data.description ?? null,
      status: data.status ?? "ACTIVE",
    },
    select: periodSelect,
  });
  return mapToPeriod(row);
}

export async function updateSchedulePeriod(
  id: string,
  organizationId: string,
  data: {
    name?: string;
    code?: string;
    description?: string | null;
    status?: string;
  }
): Promise<SchedulePeriod> {
  const db = await getDb();
  const updateData: Record<string, unknown> = {};
  if (data.name !== undefined) updateData.name = data.name;
  if (data.code !== undefined) updateData.code = data.code;
  if (data.description !== undefined) updateData.description = data.description;
  if (data.status !== undefined) updateData.status = data.status;

  const row = await db.schedulePeriod.update({
    where: { id, organizationId },
    data: updateData,
    select: periodSelect,
  });
  return mapToPeriod(row);
}

export async function archiveSchedulePeriod(
  id: string,
  organizationId: string
): Promise<void> {
  const db = await getDb();
  await db.schedulePeriod.update({
    where: { id, organizationId },
    data: { status: "ARCHIVED" },
  });
}

export async function softDeleteSchedulePeriod(
  id: string,
  organizationId: string
): Promise<void> {
  const db = await getDb();
  await db.schedulePeriod.update({
    where: { id, organizationId },
    data: { deletedAt: new Date() },
  });
}

export async function countActiveSlotsForPeriod(
  schedulePeriodId: string,
  organizationId: string
): Promise<number> {
  const db = await getDb();
  return db.scheduleSlot.count({
    where: { schedulePeriodId, organizationId, deletedAt: null, status: { not: "ARCHIVED" } },
  });
}
