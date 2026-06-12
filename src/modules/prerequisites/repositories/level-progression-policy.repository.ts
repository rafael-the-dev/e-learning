"use server";

import { getDb } from "@/server/db";
import type { LevelProgressionPolicy, ListProgressionPoliciesParams } from "@/modules/prerequisites/types";

export async function findProgressionPolicies(
  organizationId: string,
  params: ListProgressionPoliciesParams = {}
): Promise<LevelProgressionPolicy[]> {
  const db = await getDb();
  const rows = await db.levelProgressionPolicy.findMany({
    where: {
      organizationId,
      deletedAt: null,
      ...(params.courseId ? { courseId: params.courseId } : {}),
      ...(params.fromLevelId ? { fromLevelId: params.fromLevelId } : {}),
      ...(params.status ? { status: params.status } : { status: "ACTIVE" }),
    },
    include: {
      course: { select: { name: true } },
      fromLevel: { select: { name: true } },
      toLevel: { select: { name: true } },
    },
    orderBy: [{ courseId: "asc" }, { createdAt: "asc" }],
  });

  return rows.map((r) => ({
    id: r.id,
    organizationId: r.organizationId,
    courseId: r.courseId,
    fromLevelId: r.fromLevelId,
    toLevelId: r.toLevelId,
    name: r.name,
    description: r.description,
    progressionMode: r.progressionMode,
    minimumLevelAverage: r.minimumLevelAverage != null ? parseFloat(String(r.minimumLevelAverage)) : null,
    maxFailedRequiredSubjects: r.maxFailedRequiredSubjects,
    maxPendingSubjects: r.maxPendingSubjects,
    requiredCredits: r.requiredCredits,
    requireFinancialClearance: r.requireFinancialClearance,
    requireManualApproval: r.requireManualApproval,
    status: r.status,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    deletedAt: r.deletedAt,
    courseName: r.course.name,
    fromLevelName: r.fromLevel.name,
    toLevelName: r.toLevel.name,
  }));
}

export async function findPolicyByTransition(
  courseId: string,
  fromLevelId: string,
  toLevelId: string,
  organizationId: string
): Promise<LevelProgressionPolicy | null> {
  const db = await getDb();
  const row = await db.levelProgressionPolicy.findFirst({
    where: { courseId, fromLevelId, toLevelId, organizationId, status: "ACTIVE", deletedAt: null },
    include: {
      course: { select: { name: true } },
      fromLevel: { select: { name: true } },
      toLevel: { select: { name: true } },
    },
  });
  if (!row) return null;
  return {
    id: row.id,
    organizationId: row.organizationId,
    courseId: row.courseId,
    fromLevelId: row.fromLevelId,
    toLevelId: row.toLevelId,
    name: row.name,
    description: row.description,
    progressionMode: row.progressionMode,
    minimumLevelAverage: row.minimumLevelAverage != null ? parseFloat(String(row.minimumLevelAverage)) : null,
    maxFailedRequiredSubjects: row.maxFailedRequiredSubjects,
    maxPendingSubjects: row.maxPendingSubjects,
    requiredCredits: row.requiredCredits,
    requireFinancialClearance: row.requireFinancialClearance,
    requireManualApproval: row.requireManualApproval,
    status: row.status,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    deletedAt: row.deletedAt,
    courseName: row.course.name,
    fromLevelName: row.fromLevel.name,
    toLevelName: row.toLevel.name,
  };
}

export async function createProgressionPolicy(data: {
  organizationId: string;
  courseId: string;
  fromLevelId: string;
  toLevelId: string;
  name: string;
  description?: string | null;
  progressionMode: string;
  minimumLevelAverage?: number | null;
  maxFailedRequiredSubjects?: number | null;
  maxPendingSubjects?: number | null;
  requiredCredits?: number | null;
  requireFinancialClearance?: boolean;
  requireManualApproval?: boolean;
}): Promise<LevelProgressionPolicy> {
  const db = await getDb();
  const row = await db.levelProgressionPolicy.create({
    data: {
      organizationId: data.organizationId,
      courseId: data.courseId,
      fromLevelId: data.fromLevelId,
      toLevelId: data.toLevelId,
      name: data.name,
      description: data.description ?? null,
      progressionMode: data.progressionMode,
      minimumLevelAverage: data.minimumLevelAverage ?? null,
      maxFailedRequiredSubjects: data.maxFailedRequiredSubjects ?? 0,
      maxPendingSubjects: data.maxPendingSubjects ?? 0,
      requiredCredits: data.requiredCredits ?? null,
      requireFinancialClearance: data.requireFinancialClearance ?? false,
      requireManualApproval: data.requireManualApproval ?? false,
      status: "ACTIVE",
    },
    include: {
      course: { select: { name: true } },
      fromLevel: { select: { name: true } },
      toLevel: { select: { name: true } },
    },
  });
  return {
    id: row.id,
    organizationId: row.organizationId,
    courseId: row.courseId,
    fromLevelId: row.fromLevelId,
    toLevelId: row.toLevelId,
    name: row.name,
    description: row.description,
    progressionMode: row.progressionMode,
    minimumLevelAverage: row.minimumLevelAverage != null ? parseFloat(String(row.minimumLevelAverage)) : null,
    maxFailedRequiredSubjects: row.maxFailedRequiredSubjects,
    maxPendingSubjects: row.maxPendingSubjects,
    requiredCredits: row.requiredCredits,
    requireFinancialClearance: row.requireFinancialClearance,
    requireManualApproval: row.requireManualApproval,
    status: row.status,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    deletedAt: row.deletedAt,
    courseName: row.course.name,
    fromLevelName: row.fromLevel.name,
    toLevelName: row.toLevel.name,
  };
}

export async function updateProgressionPolicy(
  policyId: string,
  organizationId: string,
  data: Partial<{
    name: string; description: string | null; progressionMode: string;
    minimumLevelAverage: number | null; maxFailedRequiredSubjects: number | null;
    maxPendingSubjects: number | null; requiredCredits: number | null;
    requireFinancialClearance: boolean; requireManualApproval: boolean; status: string;
  }>
): Promise<void> {
  const db = await getDb();
  await db.levelProgressionPolicy.updateMany({
    where: { id: policyId, organizationId },
    data,
  });
}
