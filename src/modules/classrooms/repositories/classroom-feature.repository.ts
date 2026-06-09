import { getDb } from "@/server/db";
import type { ClassroomFeature } from "@/modules/classrooms/types";

// =============================================================================
// CLASSROOM FEATURE REPOSITORY
// =============================================================================

const featureSelect = {
  id: true,
  organizationId: true,
  classroomId: true,
  feature: true,
  createdAt: true,
  updatedAt: true,
} as const;

export async function findFeaturesByClassroom(
  classroomId: string,
  organizationId: string
): Promise<ClassroomFeature[]> {
  const db = await getDb();
  return db.classroomFeature.findMany({
    where: { classroomId, organizationId },
    select: featureSelect,
    orderBy: [{ feature: "asc" }],
  });
}

export async function findFeatureByClassroomAndType(
  classroomId: string,
  feature: string
): Promise<ClassroomFeature | null> {
  const db = await getDb();
  const row = await db.classroomFeature.findFirst({
    where: { classroomId, feature },
    select: featureSelect,
  });
  return row ?? null;
}

export async function createClassroomFeature(data: {
  organizationId: string;
  classroomId: string;
  feature: string;
}): Promise<ClassroomFeature> {
  const db = await getDb();
  return db.classroomFeature.create({ data, select: featureSelect });
}

export async function deleteClassroomFeature(
  id: string,
  organizationId: string
): Promise<void> {
  const db = await getDb();
  await db.classroomFeature.deleteMany({ where: { id, organizationId } });
}
