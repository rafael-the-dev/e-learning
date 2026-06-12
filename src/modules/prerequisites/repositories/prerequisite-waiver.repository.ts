"use server";

import { getDb } from "@/server/db";
import type { PrerequisiteWaiver, ListPrerequisiteWaiversParams } from "@/modules/prerequisites/types";

export async function findWaiversByEnrollmentAndSubject(
  enrollmentId: string,
  levelSubjectId: string,
  organizationId: string
): Promise<PrerequisiteWaiver[]> {
  const db = await getDb();
  const rows = await db.prerequisiteWaiver.findMany({
    where: { enrollmentId, levelSubjectId, organizationId, status: "ACTIVE" },
    orderBy: { grantedAt: "desc" },
  });
  return rows.map(mapWaiver);
}

export async function findWaivers(
  organizationId: string,
  params: ListPrerequisiteWaiversParams = {}
): Promise<PrerequisiteWaiver[]> {
  const db = await getDb();
  const rows = await db.prerequisiteWaiver.findMany({
    where: {
      organizationId,
      ...(params.studentId ? { studentId: params.studentId } : {}),
      ...(params.enrollmentId ? { enrollmentId: params.enrollmentId } : {}),
      ...(params.levelSubjectId ? { levelSubjectId: params.levelSubjectId } : {}),
      ...(params.status ? { status: params.status } : {}),
    },
    orderBy: { grantedAt: "desc" },
  });
  return rows.map(mapWaiver);
}

export async function createWaiver(data: {
  organizationId: string;
  studentId: string;
  enrollmentId: string;
  levelSubjectId: string;
  prerequisiteGroupId?: string | null;
  prerequisiteItemId?: string | null;
  reason: string;
  grantedBy: string;
}): Promise<PrerequisiteWaiver> {
  const db = await getDb();
  const row = await db.prerequisiteWaiver.create({
    data: {
      organizationId: data.organizationId,
      studentId: data.studentId,
      enrollmentId: data.enrollmentId,
      levelSubjectId: data.levelSubjectId,
      prerequisiteGroupId: data.prerequisiteGroupId ?? null,
      prerequisiteItemId: data.prerequisiteItemId ?? null,
      reason: data.reason,
      grantedBy: data.grantedBy,
      status: "ACTIVE",
    },
  });
  return mapWaiver(row);
}

export async function revokeWaiver(
  waiverId: string,
  organizationId: string,
  revokedBy: string,
  revokedReason: string
): Promise<void> {
  const db = await getDb();
  await db.prerequisiteWaiver.updateMany({
    where: { id: waiverId, organizationId },
    data: { status: "REVOKED", revokedBy, revokedAt: new Date(), revokedReason },
  });
}

function mapWaiver(row: {
  id: string; organizationId: string; studentId: string; enrollmentId: string;
  levelSubjectId: string; prerequisiteGroupId: string | null; prerequisiteItemId: string | null;
  reason: string; grantedBy: string; grantedAt: Date; status: string;
  revokedBy: string | null; revokedAt: Date | null; revokedReason: string | null;
  createdAt: Date; updatedAt: Date;
}): PrerequisiteWaiver {
  return {
    id: row.id,
    organizationId: row.organizationId,
    studentId: row.studentId,
    enrollmentId: row.enrollmentId,
    levelSubjectId: row.levelSubjectId,
    prerequisiteGroupId: row.prerequisiteGroupId,
    prerequisiteItemId: row.prerequisiteItemId,
    reason: row.reason,
    grantedBy: row.grantedBy,
    grantedAt: row.grantedAt,
    status: row.status,
    revokedBy: row.revokedBy,
    revokedAt: row.revokedAt,
    revokedReason: row.revokedReason,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
