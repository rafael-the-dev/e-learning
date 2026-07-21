"use server";

import { getDb } from "@/server/db";
import type { PrerequisiteItem } from "@/modules/prerequisites/types";

export async function findItemsByGroup(
  prerequisiteGroupId: string,
  organizationId: string
): Promise<PrerequisiteItem[]> {
  const db = await getDb();
  const rows = await db.levelSubjectPrerequisiteItem.findMany({
    where: { prerequisiteGroupId, organizationId, deletedAt: null, status: "ACTIVE" },
    include: {
      prerequisiteLevelSubject: {
        include: {
          subject: { select: { name: true } },
          courseLevel: { select: { name: true } },
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  return rows.map((r) => ({
    id: r.id,
    organizationId: r.organizationId,
    prerequisiteGroupId: r.prerequisiteGroupId,
    prerequisiteLevelSubjectId: r.prerequisiteLevelSubjectId,
    requirementType: r.requirementType,
    minimumRequiredGrade: r.minimumRequiredGrade != null ? parseFloat(String(r.minimumRequiredGrade)) : null,
    status: r.status,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    deletedAt: r.deletedAt,
    prerequisiteSubjectName: r.prerequisiteLevelSubject.subject.name,
    prerequisiteCourseLevelName: r.prerequisiteLevelSubject.courseLevel?.name ?? null,
  }));
}

export async function createPrerequisiteItem(data: {
  organizationId: string;
  prerequisiteGroupId: string;
  prerequisiteLevelSubjectId: string;
  requirementType: string;
  minimumRequiredGrade?: number | null;
}): Promise<PrerequisiteItem> {
  const db = await getDb();
  const row = await db.levelSubjectPrerequisiteItem.create({
    data: {
      organizationId: data.organizationId,
      prerequisiteGroupId: data.prerequisiteGroupId,
      prerequisiteLevelSubjectId: data.prerequisiteLevelSubjectId,
      requirementType: data.requirementType,
      minimumRequiredGrade: data.minimumRequiredGrade ?? null,
      status: "ACTIVE",
    },
    include: {
      prerequisiteLevelSubject: {
        include: {
          subject: { select: { name: true } },
          courseLevel: { select: { name: true } },
        },
      },
    },
  });

  return {
    id: row.id,
    organizationId: row.organizationId,
    prerequisiteGroupId: row.prerequisiteGroupId,
    prerequisiteLevelSubjectId: row.prerequisiteLevelSubjectId,
    requirementType: row.requirementType,
    minimumRequiredGrade: row.minimumRequiredGrade != null ? parseFloat(String(row.minimumRequiredGrade)) : null,
    status: row.status,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    deletedAt: row.deletedAt,
    prerequisiteSubjectName: row.prerequisiteLevelSubject.subject.name,
    prerequisiteCourseLevelName: row.prerequisiteLevelSubject.courseLevel?.name ?? null,
  };
}

export async function deletePrerequisiteItem(
  itemId: string,
  organizationId: string
): Promise<void> {
  const db = await getDb();
  await db.levelSubjectPrerequisiteItem.updateMany({
    where: { id: itemId, organizationId },
    data: { status: "ARCHIVED", deletedAt: new Date() },
  });
}

export async function findAllActiveGroupsWithItems(
  levelSubjectId: string,
  organizationId: string
) {
  const db = await getDb();
  return db.levelSubjectPrerequisiteGroup.findMany({
    where: { levelSubjectId, organizationId, status: "ACTIVE", deletedAt: null },
    include: {
      items: {
        where: { status: "ACTIVE", deletedAt: null },
        include: {
          prerequisiteLevelSubject: {
            include: {
              subject: { select: { name: true } },
              courseLevel: { select: { name: true, course: { select: { name: true } } } },
            },
          },
        },
      },
      waivers: {
        where: { status: "ACTIVE" },
        select: { id: true, studentId: true, enrollmentId: true, prerequisiteGroupId: true, prerequisiteItemId: true },
      },
    },
  });
}

// Batch variant of `findAllActiveGroupsWithItems` (H4): loads the ACTIVE prerequisite
// groups + items for MANY target level-subjects in ONE query (`levelSubjectId IN (...)`),
// so eligibility for a whole level can be evaluated without a per-subject round-trip.
// Each returned group carries its own `levelSubjectId`, so the caller can index groups by
// their target subject. Waivers are loaded separately (per enrollment), so unlike the
// single-subject variant this one does not include them. Tenant-scoped by organizationId.
export async function findActiveGroupsWithItemsForLevelSubjects(
  levelSubjectIds: string[],
  organizationId: string
) {
  if (levelSubjectIds.length === 0) return [];
  const db = await getDb();
  return db.levelSubjectPrerequisiteGroup.findMany({
    where: {
      levelSubjectId: { in: levelSubjectIds },
      organizationId,
      status: "ACTIVE",
      deletedAt: null,
    },
    include: {
      items: {
        where: { status: "ACTIVE", deletedAt: null },
        include: {
          prerequisiteLevelSubject: {
            include: {
              subject: { select: { name: true } },
              courseLevel: { select: { name: true, course: { select: { name: true } } } },
            },
          },
        },
      },
    },
  });
}
