import { getDb } from "@/server/db";
import type { ClassroomResource } from "@/modules/classrooms/types";

// =============================================================================
// CLASSROOM RESOURCE REPOSITORY
// =============================================================================

const resourceSelect = {
  id: true,
  organizationId: true,
  classroomId: true,
  name: true,
  quantity: true,
  description: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
} as const;

export async function findResourcesByClassroom(
  classroomId: string,
  organizationId: string
): Promise<ClassroomResource[]> {
  const db = await getDb();
  return db.classroomResource.findMany({
    where: { classroomId, organizationId, deletedAt: null },
    select: resourceSelect,
    orderBy: [{ name: "asc" }],
  });
}

export async function findResourceById(
  id: string,
  organizationId: string
): Promise<ClassroomResource | null> {
  const db = await getDb();
  const row = await db.classroomResource.findFirst({
    where: { id, organizationId, deletedAt: null },
    select: resourceSelect,
  });
  return row ?? null;
}

export async function createClassroomResource(data: {
  organizationId: string;
  classroomId: string;
  name: string;
  quantity: number;
  description?: string | null;
}): Promise<ClassroomResource> {
  const db = await getDb();
  return db.classroomResource.create({
    data: {
      organizationId: data.organizationId,
      classroomId: data.classroomId,
      name: data.name,
      quantity: data.quantity,
      description: data.description ?? null,
    },
    select: resourceSelect,
  });
}

export async function updateClassroomResource(
  id: string,
  organizationId: string,
  data: { name?: string; quantity?: number; description?: string | null; status?: string }
): Promise<ClassroomResource> {
  const db = await getDb();
  const updateData: Record<string, unknown> = {};
  if (data.name !== undefined) updateData.name = data.name;
  if (data.quantity !== undefined) updateData.quantity = data.quantity;
  if (data.description !== undefined) updateData.description = data.description;
  if (data.status !== undefined) updateData.status = data.status;

  return db.classroomResource.update({
    where: { id, organizationId },
    data: updateData,
    select: resourceSelect,
  });
}

export async function softDeleteClassroomResource(
  id: string,
  organizationId: string
): Promise<void> {
  const db = await getDb();
  await db.classroomResource.update({
    where: { id, organizationId },
    data: { deletedAt: new Date() },
  });
}
