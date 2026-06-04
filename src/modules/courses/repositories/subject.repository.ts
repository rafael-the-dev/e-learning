import { getDb } from "@/server/db";
import type { Subject } from "@/modules/courses/types";

// =============================================================================
// SUBJECTS REPOSITORY
// Subject is a global org-level entity scoped directly by organizationId.
// =============================================================================

const subjectSelect = {
  id: true,
  organizationId: true,
  name: true,
  code: true,
  description: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
} as const;

function mapToSubject(row: {
  id: string;
  organizationId: string;
  name: string;
  code: string | null;
  description: string | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}): Subject {
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
  };
}

export interface ListSubjectsParams {
  search?: string;
  status?: string;
}

export async function findSubjectsByOrganization(
  organizationId: string,
  params: ListSubjectsParams = {}
): Promise<Subject[]> {
  const db = await getDb();
  const rows = await db.subject.findMany({
    where: {
      organizationId,
      deletedAt: null,
      ...(params.status ? { status: params.status } : {}),
      ...(params.search
        ? {
            OR: [
              { name: { contains: params.search } },
              { code: { contains: params.search } },
            ],
          }
        : {}),
    },
    select: subjectSelect,
    orderBy: { name: "asc" },
  });
  return rows.map(mapToSubject);
}

export async function findActiveSubjectsByOrganization(
  organizationId: string
): Promise<Subject[]> {
  const db = await getDb();
  const rows = await db.subject.findMany({
    where: { organizationId, status: "ACTIVE", deletedAt: null },
    select: subjectSelect,
    orderBy: { name: "asc" },
  });
  return rows.map(mapToSubject);
}

export async function findSubjectByIdInOrganization(
  id: string,
  organizationId: string
): Promise<Subject | null> {
  const db = await getDb();
  const row = await db.subject.findFirst({
    where: { id, organizationId, deletedAt: null },
    select: subjectSelect,
  });
  return row ? mapToSubject(row) : null;
}

export async function existsSubjectCodeInOrganization(
  organizationId: string,
  code: string,
  excludeId?: string
): Promise<boolean> {
  const db = await getDb();
  const row = await db.subject.findFirst({
    where: {
      organizationId,
      code,
      deletedAt: null,
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
    select: { id: true },
  });
  return row !== null;
}

export async function createSubject(data: {
  organizationId: string;
  name: string;
  code?: string | null;
  description?: string | null;
}): Promise<Subject> {
  const db = await getDb();
  const row = await db.subject.create({
    data: {
      organizationId: data.organizationId,
      name: data.name,
      code: data.code ?? null,
      description: data.description ?? null,
      status: "ACTIVE",
    },
    select: subjectSelect,
  });
  return mapToSubject(row);
}

export async function updateSubject(
  id: string,
  organizationId: string,
  data: {
    name?: string;
    code?: string | null;
    description?: string | null;
    status?: string;
  }
): Promise<Subject> {
  const db = await getDb();
  const updateData: Record<string, unknown> = {};
  if (data.name !== undefined) updateData.name = data.name;
  if (data.code !== undefined) updateData.code = data.code;
  if (data.description !== undefined) updateData.description = data.description;
  if (data.status !== undefined) updateData.status = data.status;

  const row = await db.subject.update({
    where: { id, organizationId },
    data: updateData,
    select: subjectSelect,
  });
  return mapToSubject(row);
}

export async function archiveSubject(id: string, organizationId: string): Promise<Subject> {
  const db = await getDb();
  const row = await db.subject.update({
    where: { id, organizationId },
    data: { status: "ARCHIVED" },
    select: subjectSelect,
  });
  return mapToSubject(row);
}

export async function softDeleteSubject(id: string, organizationId: string): Promise<void> {
  const db = await getDb();
  await db.subject.update({
    where: { id, organizationId },
    data: { deletedAt: new Date() },
  });
}

export async function countTeacherAssignmentsForSubject(
  subjectId: string
): Promise<number> {
  const db = await getDb();
  return db.teacherSubject.count({ where: { subjectId } });
}

export async function countLevelAssignmentsForSubject(
  subjectId: string
): Promise<number> {
  const db = await getDb();
  return db.levelSubject.count({ where: { subjectId, deletedAt: null } });
}
