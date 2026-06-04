import { getDb } from "@/server/db";
import { buildSkipTake, buildPaginationMeta } from "@/shared/lib/pagination";
import type { PaginatedResult, PaginationParams } from "@/shared/types/common";
import type { ScheduleSlot } from "@/modules/schedules/types";
import { DAY_OF_WEEK_ORDER } from "@/modules/schedules/types";

// =============================================================================
// SCHEDULE SLOT REPOSITORY
// All queries scoped to organizationId. Never query cross-tenant.
// =============================================================================

export interface ListScheduleSlotsParams extends PaginationParams {
  search?: string;
  status?: string;
  schedulePeriodId?: string;
  dayOfWeek?: string;
}

const slotSelect = {
  id: true,
  organizationId: true,
  schedulePeriodId: true,
  dayOfWeek: true,
  startTime: true,
  endTime: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
  schedulePeriod: { select: { name: true, code: true } },
} as const;

function mapToSlot(row: {
  id: string;
  organizationId: string;
  schedulePeriodId: string;
  dayOfWeek: string;
  startTime: string;
  endTime: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
  schedulePeriod: { name: string; code: string };
}): ScheduleSlot {
  return {
    id: row.id,
    organizationId: row.organizationId,
    schedulePeriodId: row.schedulePeriodId,
    dayOfWeek: row.dayOfWeek,
    startTime: row.startTime,
    endTime: row.endTime,
    status: row.status,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    deletedAt: row.deletedAt,
    periodName: row.schedulePeriod.name,
    periodCode: row.schedulePeriod.code,
  };
}

export async function findScheduleSlotsByOrganization(
  organizationId: string,
  params: ListScheduleSlotsParams
): Promise<PaginatedResult<ScheduleSlot>> {
  const db = await getDb();
  const { skip, take } = buildSkipTake(params);

  const where = {
    organizationId,
    deletedAt: null,
    ...(params.status && { status: params.status }),
    ...(params.schedulePeriodId && { schedulePeriodId: params.schedulePeriodId }),
    ...(params.dayOfWeek && { dayOfWeek: params.dayOfWeek }),
  };

  const [rows, total] = await Promise.all([
    db.scheduleSlot.findMany({
      where,
      select: slotSelect,
      skip,
      take,
      orderBy: [{ schedulePeriodId: "asc" }, { startTime: "asc" }],
    }),
    db.scheduleSlot.count({ where }),
  ]);

  return buildPaginationMeta(rows.map(mapToSlot), total, params);
}

export async function findScheduleSlotsByPeriod(
  schedulePeriodId: string,
  organizationId: string
): Promise<ScheduleSlot[]> {
  const db = await getDb();
  const rows = await db.scheduleSlot.findMany({
    where: { schedulePeriodId, organizationId, deletedAt: null },
    select: slotSelect,
    orderBy: [{ startTime: "asc" }],
  });
  return rows.map(mapToSlot).sort(
    (a, b) => (DAY_OF_WEEK_ORDER[a.dayOfWeek] ?? 0) - (DAY_OF_WEEK_ORDER[b.dayOfWeek] ?? 0)
  );
}

export async function findActiveSlotsByOrganization(
  organizationId: string
): Promise<ScheduleSlot[]> {
  const db = await getDb();
  const rows = await db.scheduleSlot.findMany({
    where: { organizationId, deletedAt: null, status: "ACTIVE" },
    select: slotSelect,
    orderBy: [{ schedulePeriodId: "asc" }, { startTime: "asc" }],
  });
  return rows.map(mapToSlot);
}

export async function findScheduleSlotByIdInOrganization(
  id: string,
  organizationId: string
): Promise<ScheduleSlot | null> {
  const db = await getDb();
  const row = await db.scheduleSlot.findFirst({
    where: { id, organizationId, deletedAt: null },
    select: slotSelect,
  });
  return row ? mapToSlot(row) : null;
}

export async function findDuplicateSlot(
  schedulePeriodId: string,
  dayOfWeek: string,
  startTime: string,
  endTime: string,
  excludeId?: string
): Promise<ScheduleSlot | null> {
  const db = await getDb();
  const row = await db.scheduleSlot.findFirst({
    where: {
      schedulePeriodId,
      dayOfWeek,
      startTime,
      endTime,
      deletedAt: null,
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
    select: slotSelect,
  });
  return row ? mapToSlot(row) : null;
}

export async function createScheduleSlot(data: {
  organizationId: string;
  schedulePeriodId: string;
  dayOfWeek: string;
  startTime: string;
  endTime: string;
  status?: string;
}): Promise<ScheduleSlot> {
  const db = await getDb();
  const row = await db.scheduleSlot.create({
    data: {
      organizationId: data.organizationId,
      schedulePeriodId: data.schedulePeriodId,
      dayOfWeek: data.dayOfWeek,
      startTime: data.startTime,
      endTime: data.endTime,
      status: data.status ?? "ACTIVE",
    },
    select: slotSelect,
  });
  return mapToSlot(row);
}

export async function updateScheduleSlot(
  id: string,
  organizationId: string,
  data: {
    dayOfWeek?: string;
    startTime?: string;
    endTime?: string;
    status?: string;
  }
): Promise<ScheduleSlot> {
  const db = await getDb();
  const updateData: Record<string, unknown> = {};
  if (data.dayOfWeek !== undefined) updateData.dayOfWeek = data.dayOfWeek;
  if (data.startTime !== undefined) updateData.startTime = data.startTime;
  if (data.endTime !== undefined) updateData.endTime = data.endTime;
  if (data.status !== undefined) updateData.status = data.status;

  const row = await db.scheduleSlot.update({
    where: { id, organizationId },
    data: updateData,
    select: slotSelect,
  });
  return mapToSlot(row);
}

export async function archiveScheduleSlot(id: string, organizationId: string): Promise<void> {
  const db = await getDb();
  await db.scheduleSlot.update({
    where: { id, organizationId },
    data: { status: "ARCHIVED" },
  });
}

export async function softDeleteScheduleSlot(id: string, organizationId: string): Promise<void> {
  const db = await getDb();
  await db.scheduleSlot.update({
    where: { id, organizationId },
    data: { deletedAt: new Date() },
  });
}

export async function countActiveClassGroupAssignments(
  scheduleSlotId: string,
  organizationId: string
): Promise<number> {
  const db = await getDb();
  return db.classGroupSchedule.count({
    where: { scheduleSlotId, organizationId, deletedAt: null, status: { not: "ARCHIVED" } },
  });
}

export async function countActiveScheduleSlots(organizationId: string): Promise<number> {
  const db = await getDb();
  return db.scheduleSlot.count({
    where: { organizationId, deletedAt: null, status: "ACTIVE" },
  });
}
