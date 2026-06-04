import { getDb } from "@/server/db";
import type { Subject } from "@/modules/courses/types";

// =============================================================================
// SUBJECTS REPOSITORY
// Subject has no direct organizationId — scope via courseLevel.course.organizationId.
// All ownership verification happens in commands before these functions are called.
// =============================================================================

function mapToSubject(row: {
  id: string;
  courseLevelId: string;
  name: string;
  code: string | null;
  description: string | null;
  hoursRequired: number | null;
  order: number;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  courseLevel?: {
    courseId: string;
    name: string;
    course?: { name: string };
  };
}): Subject {
  return {
    id: row.id,
    courseLevelId: row.courseLevelId,
    courseId: row.courseLevel?.courseId ?? "",
    name: row.name,
    code: row.code,
    description: row.description,
    hoursRequired: row.hoursRequired,
    order: row.order,
    status: row.status,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    levelName: row.courseLevel?.name,
    courseName: row.courseLevel?.course?.name,
  };
}

const subjectSelect = {
  id: true,
  courseLevelId: true,
  name: true,
  code: true,
  description: true,
  hoursRequired: true,
  order: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  courseLevel: {
    select: {
      courseId: true,
      name: true,
      course: { select: { name: true } },
    },
  },
} as const;

export async function findSubjectsByCourse(
  courseId: string,
  organizationId: string
): Promise<Subject[]> {
  const db = await getDb();
  const rows = await db.subject.findMany({
    where: {
      courseLevel: {
        courseId,
        course: { organizationId, deletedAt: null },
      },
    },
    select: subjectSelect,
    orderBy: [{ courseLevel: { order: "asc" } }, { order: "asc" }],
  });
  return rows.map(mapToSubject);
}

export async function findSubjectsByLevel(
  levelId: string,
  organizationId: string
): Promise<Subject[]> {
  const db = await getDb();
  const rows = await db.subject.findMany({
    where: {
      courseLevelId: levelId,
      courseLevel: { course: { organizationId, deletedAt: null } },
    },
    select: subjectSelect,
    orderBy: { order: "asc" },
  });
  return rows.map(mapToSubject);
}

export async function findSubjectByIdInOrganization(
  id: string,
  organizationId: string
): Promise<Subject | null> {
  const db = await getDb();
  const row = await db.subject.findFirst({
    where: {
      id,
      courseLevel: { course: { organizationId, deletedAt: null } },
    },
    select: subjectSelect,
  });
  return row ? mapToSubject(row) : null;
}

export async function createSubject(data: {
  courseLevelId: string;
  name: string;
  code?: string | null;
  description?: string | null;
  hoursRequired?: number | null;
  order?: number;
}): Promise<Subject> {
  const db = await getDb();

  let order = data.order;
  if (order === undefined || order === null) {
    const last = await db.subject.findFirst({
      where: { courseLevelId: data.courseLevelId },
      orderBy: { order: "desc" },
      select: { order: true },
    });
    order = last ? last.order + 1 : 0;
  }

  const row = await db.subject.create({
    data: {
      courseLevelId: data.courseLevelId,
      name: data.name,
      code: data.code ?? null,
      description: data.description ?? null,
      hoursRequired: data.hoursRequired ?? null,
      order,
      status: "ACTIVE",
      isActive: true,
    },
    select: subjectSelect,
  });
  return mapToSubject(row);
}

export async function updateSubject(
  id: string,
  data: {
    name?: string;
    code?: string | null;
    description?: string | null;
    courseLevelId?: string;
    hoursRequired?: number | null;
    order?: number;
    status?: string;
  }
): Promise<Subject> {
  const db = await getDb();

  const updateData: Record<string, unknown> = {};
  if (data.name !== undefined) updateData.name = data.name;
  if (data.code !== undefined) updateData.code = data.code;
  if (data.description !== undefined) updateData.description = data.description;
  if (data.courseLevelId !== undefined) updateData.courseLevelId = data.courseLevelId;
  if (data.hoursRequired !== undefined) updateData.hoursRequired = data.hoursRequired;
  if (data.order !== undefined) updateData.order = data.order;
  if (data.status !== undefined) {
    updateData.status = data.status;
    updateData.isActive = data.status === "ACTIVE";
  }

  const row = await db.subject.update({
    where: { id },
    data: updateData,
    select: subjectSelect,
  });
  return mapToSubject(row);
}

export async function archiveSubject(id: string): Promise<Subject> {
  const db = await getDb();
  const row = await db.subject.update({
    where: { id },
    data: { status: "ARCHIVED", isActive: false },
    select: subjectSelect,
  });
  return mapToSubject(row);
}

export async function deleteSubject(id: string): Promise<void> {
  const db = await getDb();
  await db.subject.delete({ where: { id } });
}

export async function countTeacherAssignmentsForSubject(
  subjectId: string
): Promise<number> {
  const db = await getDb();
  return db.teacherSubject.count({ where: { subjectId } });
}
