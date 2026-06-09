import { getDb } from "@/server/db";
import type { ClassroomMaintenance } from "@/modules/classrooms/types";

// =============================================================================
// CLASSROOM MAINTENANCE REPOSITORY
// =============================================================================

const maintenanceSelect = {
  id: true,
  organizationId: true,
  classroomId: true,
  title: true,
  description: true,
  startDate: true,
  endDate: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
} as const;

export async function findMaintenancesByClassroom(
  classroomId: string,
  organizationId: string
): Promise<ClassroomMaintenance[]> {
  const db = await getDb();
  return db.classroomMaintenance.findMany({
    where: { classroomId, organizationId, deletedAt: null },
    select: maintenanceSelect,
    orderBy: [{ startDate: "desc" }],
  });
}

export async function findMaintenanceById(
  id: string,
  organizationId: string
): Promise<ClassroomMaintenance | null> {
  const db = await getDb();
  const row = await db.classroomMaintenance.findFirst({
    where: { id, organizationId, deletedAt: null },
    select: maintenanceSelect,
  });
  return row ?? null;
}

export async function findActiveMaintenancesForClassroom(
  classroomId: string,
  startDate: Date,
  endDate: Date
): Promise<ClassroomMaintenance[]> {
  const db = await getDb();
  return db.classroomMaintenance.findMany({
    where: {
      classroomId,
      deletedAt: null,
      status: { in: ["SCHEDULED", "IN_PROGRESS"] },
      startDate: { lte: endDate },
      endDate: { gte: startDate },
    },
    select: maintenanceSelect,
  });
}

export async function createClassroomMaintenance(data: {
  organizationId: string;
  classroomId: string;
  title: string;
  description?: string | null;
  startDate: Date;
  endDate: Date;
}): Promise<ClassroomMaintenance> {
  const db = await getDb();
  return db.classroomMaintenance.create({
    data: {
      organizationId: data.organizationId,
      classroomId: data.classroomId,
      title: data.title,
      description: data.description ?? null,
      startDate: data.startDate,
      endDate: data.endDate,
    },
    select: maintenanceSelect,
  });
}

export async function updateClassroomMaintenance(
  id: string,
  organizationId: string,
  data: {
    title?: string;
    description?: string | null;
    startDate?: Date;
    endDate?: Date;
    status?: string;
  }
): Promise<ClassroomMaintenance> {
  const db = await getDb();
  const updateData: Record<string, unknown> = {};
  if (data.title !== undefined) updateData.title = data.title;
  if (data.description !== undefined) updateData.description = data.description;
  if (data.startDate !== undefined) updateData.startDate = data.startDate;
  if (data.endDate !== undefined) updateData.endDate = data.endDate;
  if (data.status !== undefined) updateData.status = data.status;

  return db.classroomMaintenance.update({
    where: { id, organizationId },
    data: updateData,
    select: maintenanceSelect,
  });
}

export async function softDeleteClassroomMaintenance(
  id: string,
  organizationId: string
): Promise<void> {
  const db = await getDb();
  await db.classroomMaintenance.update({
    where: { id, organizationId },
    data: { deletedAt: new Date() },
  });
}
