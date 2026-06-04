import { getDb } from "@/server/db";
import type { ClassGroupSchedule, ClassGroupScheduleWithSlot } from "@/modules/schedules/types";
import { DAY_OF_WEEK_ORDER } from "@/modules/schedules/types";

// =============================================================================
// CLASS GROUP SCHEDULE REPOSITORY
// All queries scoped to organizationId. Never query cross-tenant.
// =============================================================================

const scheduleSelect = {
  id: true,
  organizationId: true,
  classGroupId: true,
  scheduleSlotId: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
  scheduleSlot: {
    select: {
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
    },
  },
} as const;

function mapToSchedule(row: {
  id: string;
  organizationId: string;
  classGroupId: string;
  scheduleSlotId: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
  scheduleSlot: {
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
  };
}): ClassGroupScheduleWithSlot {
  return {
    id: row.id,
    organizationId: row.organizationId,
    classGroupId: row.classGroupId,
    scheduleSlotId: row.scheduleSlotId,
    status: row.status,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    deletedAt: row.deletedAt,
    slot: {
      id: row.scheduleSlot.id,
      organizationId: row.scheduleSlot.organizationId,
      schedulePeriodId: row.scheduleSlot.schedulePeriodId,
      dayOfWeek: row.scheduleSlot.dayOfWeek,
      startTime: row.scheduleSlot.startTime,
      endTime: row.scheduleSlot.endTime,
      status: row.scheduleSlot.status,
      createdAt: row.scheduleSlot.createdAt,
      updatedAt: row.scheduleSlot.updatedAt,
      deletedAt: row.scheduleSlot.deletedAt,
      periodName: row.scheduleSlot.schedulePeriod.name,
      periodCode: row.scheduleSlot.schedulePeriod.code,
    },
  };
}

export async function findSchedulesByClassGroup(
  classGroupId: string,
  organizationId: string
): Promise<ClassGroupScheduleWithSlot[]> {
  const db = await getDb();
  const rows = await db.classGroupSchedule.findMany({
    where: { classGroupId, organizationId, deletedAt: null },
    select: scheduleSelect,
    orderBy: { createdAt: "asc" },
  });
  return rows.map(mapToSchedule).sort(
    (a, b) =>
      (DAY_OF_WEEK_ORDER[a.slot.dayOfWeek] ?? 0) - (DAY_OF_WEEK_ORDER[b.slot.dayOfWeek] ?? 0) ||
      a.slot.startTime.localeCompare(b.slot.startTime)
  );
}

export async function findClassGroupScheduleById(
  id: string,
  organizationId: string
): Promise<ClassGroupScheduleWithSlot | null> {
  const db = await getDb();
  const row = await db.classGroupSchedule.findFirst({
    where: { id, organizationId, deletedAt: null },
    select: scheduleSelect,
  });
  return row ? mapToSchedule(row) : null;
}

export async function existsClassGroupSchedule(
  classGroupId: string,
  scheduleSlotId: string
): Promise<boolean> {
  const db = await getDb();
  const count = await db.classGroupSchedule.count({
    where: { classGroupId, scheduleSlotId, deletedAt: null },
  });
  return count > 0;
}

export async function assignScheduleSlotToClassGroup(data: {
  organizationId: string;
  classGroupId: string;
  scheduleSlotId: string;
}): Promise<ClassGroupSchedule> {
  const db = await getDb();
  return db.classGroupSchedule.create({
    data: {
      organizationId: data.organizationId,
      classGroupId: data.classGroupId,
      scheduleSlotId: data.scheduleSlotId,
      status: "ACTIVE",
    },
    select: {
      id: true,
      organizationId: true,
      classGroupId: true,
      scheduleSlotId: true,
      status: true,
      createdAt: true,
      updatedAt: true,
      deletedAt: true,
    },
  });
}

export async function removeScheduleSlotFromClassGroup(
  id: string,
  organizationId: string
): Promise<void> {
  const db = await getDb();
  await db.classGroupSchedule.update({
    where: { id, organizationId },
    data: { deletedAt: new Date(), status: "ARCHIVED" },
  });
}

export async function countSchedulesByClassGroup(classGroupId: string): Promise<number> {
  const db = await getDb();
  return db.classGroupSchedule.count({ where: { classGroupId, deletedAt: null } });
}
