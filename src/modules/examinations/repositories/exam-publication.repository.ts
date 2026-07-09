import { getDb } from "@/server/db";
import type { PrismaClientOrTx } from "@/server/db";
import type {
  CreateExamPublicationInput,
  ExamPublicationRecord,
  ListExamPublicationsFilters,
  UpdateExamPublicationMetadataInput,
} from "@/modules/examinations/types/repository";

// =============================================================================
// EXAM PUBLICATION REPOSITORY (Phase 2) — persistence only
// -----------------------------------------------------------------------------
// Tenant-safe access for the per-session result-publication record (D9/D10).
// Makes NO visibility/retraction decision — a command sets `status` /
// `publishedAt` / `retractedAt`; this layer persists them and never deletes a
// published row. No `deletedAt` → NO soft delete, NO hard delete, NO findUnique,
// NO update-by-id.
// =============================================================================

const publicationSelect = {
  id: true,
  organizationId: true,
  examSessionId: true,
  status: true,
  publishedAt: true,
  publishedById: true,
  retractedAt: true,
  retractedById: true,
  reason: true,
  createdAt: true,
  updatedAt: true,
} as const;

type Row = Record<string, unknown>;

function toRecord(row: Row): ExamPublicationRecord {
  return {
    id: row.id as string,
    organizationId: row.organizationId as string,
    examSessionId: row.examSessionId as string,
    status: row.status as string,
    publishedAt: (row.publishedAt as Date | null) ?? null,
    publishedById: (row.publishedById as string | null) ?? null,
    retractedAt: (row.retractedAt as Date | null) ?? null,
    retractedById: (row.retractedById as string | null) ?? null,
    reason: (row.reason as string | null) ?? null,
    createdAt: row.createdAt as Date,
    updatedAt: row.updatedAt as Date,
  };
}

export async function createExamPublication(
  params: CreateExamPublicationInput,
  client?: PrismaClientOrTx
): Promise<ExamPublicationRecord> {
  const db = client ?? (await getDb());
  const row = await db.examPublication.create({
    data: {
      organizationId: params.organizationId,
      examSessionId: params.examSessionId,
      status: params.status,
      reason: params.reason ?? null,
    },
    select: publicationSelect,
  });
  return toRecord(row);
}

export interface FindExamPublicationByIdParams {
  organizationId: string;
  id: string;
}

export async function findExamPublicationById(
  params: FindExamPublicationByIdParams,
  client?: PrismaClientOrTx
): Promise<ExamPublicationRecord | null> {
  const db = client ?? (await getDb());
  const row = await db.examPublication.findFirst({
    where: { id: params.id, organizationId: params.organizationId },
    select: publicationSelect,
  });
  return row ? toRecord(row) : null;
}

export interface PublicationsBySessionParams {
  organizationId: string;
  examSessionId: string;
}

/** All publication rows for a session, newest first. */
export async function listPublicationsBySession(
  params: PublicationsBySessionParams,
  client?: PrismaClientOrTx
): Promise<ExamPublicationRecord[]> {
  const db = client ?? (await getDb());
  const rows = await db.examPublication.findMany({
    where: { organizationId: params.organizationId, examSessionId: params.examSessionId },
    select: publicationSelect,
    orderBy: [{ createdAt: "desc" }, { id: "asc" }],
  });
  return rows.map(toRecord);
}

function buildListWhere(filters: ListExamPublicationsFilters): Record<string, unknown> {
  const where: Record<string, unknown> = { organizationId: filters.organizationId };
  if (filters.status !== undefined) where.status = filters.status;
  return where;
}

export async function listExamPublications(
  filters: ListExamPublicationsFilters,
  client?: PrismaClientOrTx
): Promise<ExamPublicationRecord[]> {
  const db = client ?? (await getDb());
  const rows = await db.examPublication.findMany({
    where: buildListWhere(filters),
    select: publicationSelect,
    orderBy: [{ createdAt: "desc" }, { id: "asc" }],
    skip: filters.skip,
    take: filters.take,
  });
  return rows.map(toRecord);
}

export interface UpdateExamPublicationMetadataParams {
  organizationId: string;
  id: string;
  patch: UpdateExamPublicationMetadataInput;
}

export async function updateExamPublicationMetadata(
  params: UpdateExamPublicationMetadataParams,
  client?: PrismaClientOrTx
): Promise<{ count: number }> {
  const db = client ?? (await getDb());
  const res = await db.examPublication.updateMany({
    where: { id: params.id, organizationId: params.organizationId },
    data: { ...params.patch },
  });
  return { count: res.count };
}
