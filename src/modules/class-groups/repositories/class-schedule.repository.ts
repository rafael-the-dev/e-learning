import { getDb } from "@/server/db";
import type { ClassSchedule } from "@/modules/class-groups/types";

// =============================================================================
// CLASS SCHEDULE REPOSITORY
// ClassSchedule has no organizationId column. Tenant isolation is achieved by
// joining through classGroup (which carries organizationId).
// =============================================================================

const scheduleSelect = {
  id: true,
  classGroupId: true,
  dayOfWeek: true,
  startTime: true,
  endTime: true,
  room: true,
  createdAt: true,
  updatedAt: true,
} as const;

export async function findSchedulesByClassGroup(
  classGroupId: string,
  organizationId: string
): Promise<ClassSchedule[]> {
  const db = await getDb();
  return db.classSchedule.findMany({
    where: {
      classGroupId,
      classGroup: { organizationId, deletedAt: null },
    },
    select: scheduleSelect,
    orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }],
  });
}

export async function findScheduleById(
  id: string,
  classGroupId: string,
  organizationId: string
): Promise<ClassSchedule | null> {
  const db = await getDb();
  return db.classSchedule.findFirst({
    where: {
      id,
      classGroupId,
      classGroup: { organizationId, deletedAt: null },
    },
    select: scheduleSelect,
  });
}

export async function createSchedule(data: {
  classGroupId: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  room?: string | null;
}): Promise<ClassSchedule> {
  const db = await getDb();
  return db.classSchedule.create({
    data: {
      classGroupId: data.classGroupId,
      dayOfWeek: data.dayOfWeek,
      startTime: data.startTime,
      endTime: data.endTime,
      room: data.room ?? null,
    },
    select: scheduleSelect,
  });
}

export async function updateSchedule(
  id: string,
  classGroupId: string,
  data: {
    dayOfWeek?: number;
    startTime?: string;
    endTime?: string;
    room?: string | null;
  }
): Promise<ClassSchedule> {
  const db = await getDb();
  const updateData: Record<string, unknown> = {};
  if (data.dayOfWeek !== undefined) updateData.dayOfWeek = data.dayOfWeek;
  if (data.startTime !== undefined) updateData.startTime = data.startTime;
  if (data.endTime !== undefined) updateData.endTime = data.endTime;
  if (data.room !== undefined) updateData.room = data.room;

  return db.classSchedule.update({
    where: { id, classGroupId },
    data: updateData,
    select: scheduleSelect,
  });
}

export async function deleteSchedule(
  id: string,
  classGroupId: string
): Promise<void> {
  const db = await getDb();
  await db.classSchedule.delete({ where: { id, classGroupId } });
}
