"use server";

import { getDb } from "@/server/db";
import type { PrerequisiteGroup, ListPrerequisiteGroupsParams } from "@/modules/prerequisites/types";

export async function findPrerequisiteGroupsByLevelSubject(
  levelSubjectId: string,
  organizationId: string,
  params: ListPrerequisiteGroupsParams = {}
): Promise<PrerequisiteGroup[]> {
  const db = await getDb();
  const rows = await db.levelSubjectPrerequisiteGroup.findMany({
    where: {
      levelSubjectId,
      organizationId,
      deletedAt: null,
      ...(params.status ? { status: params.status } : {}),
    },
    include: {
      items: {
        where: { deletedAt: null, status: "ACTIVE" },
        select: { id: true },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  return rows.map((r) => ({
    id: r.id,
    organizationId: r.organizationId,
    levelSubjectId: r.levelSubjectId,
    name: r.name,
    description: r.description,
    logicType: r.logicType,
    status: r.status,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    deletedAt: r.deletedAt,
    itemsCount: r.items.length,
  }));
}

export async function findPrerequisiteGroupWithItems(
  groupId: string,
  organizationId: string
) {
  const db = await getDb();
  return db.levelSubjectPrerequisiteGroup.findFirst({
    where: { id: groupId, organizationId, deletedAt: null },
    include: {
      items: {
        where: { deletedAt: null, status: "ACTIVE" },
        include: {
          prerequisiteLevelSubject: {
            include: { subject: { select: { name: true } }, courseLevel: { select: { name: true } } },
          },
        },
        orderBy: { createdAt: "asc" },
      },
    },
  });
}

export async function createPrerequisiteGroup(data: {
  organizationId: string;
  levelSubjectId: string;
  name: string | null;
  description: string | null;
  logicType: string;
}): Promise<PrerequisiteGroup> {
  const db = await getDb();
  const row = await db.levelSubjectPrerequisiteGroup.create({
    data: {
      ...data,
      status: "ACTIVE",
    },
  });
  return {
    id: row.id,
    organizationId: row.organizationId,
    levelSubjectId: row.levelSubjectId,
    name: row.name,
    description: row.description,
    logicType: row.logicType,
    status: row.status,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    deletedAt: row.deletedAt,
    itemsCount: 0,
  };
}

export async function updatePrerequisiteGroup(
  groupId: string,
  organizationId: string,
  data: Partial<{ name: string | null; description: string | null; logicType: string; status: string }>
): Promise<void> {
  const db = await getDb();
  await db.levelSubjectPrerequisiteGroup.updateMany({
    where: { id: groupId, organizationId },
    data,
  });
}

export async function archivePrerequisiteGroup(
  groupId: string,
  organizationId: string
): Promise<void> {
  const db = await getDb();
  await db.levelSubjectPrerequisiteGroup.updateMany({
    where: { id: groupId, organizationId },
    data: { status: "ARCHIVED", deletedAt: new Date() },
  });
}
