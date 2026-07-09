import { getDb } from "@/server/db";
import type { PrismaClientOrTx } from "@/server/db";
import type {
  CreateExamAttemptInput,
  ExamAttemptRecord,
  ListExamAttemptsFilters,
  UpdateExamAttemptMetadataInput,
} from "@/modules/examinations/types/repository";

// =============================================================================
// EXAM ATTEMPT REPOSITORY (Phase 2) — persistence only
// -----------------------------------------------------------------------------
// Tenant-safe access for the first-class re-sit record (D12). `attemptNumber` is
// scoped by (organizationId, enrollmentId, levelSubjectId) and enforced UNIQUE by
// a filtered index in the migration. Historical attempts are never overwritten.
// Org-scoped; soft delete sets `deletedAt`; NO hard delete, NO findUnique,
// NO update-by-id.
// =============================================================================

const attemptSelect = {
  id: true,
  organizationId: true,
  studentId: true,
  enrollmentId: true,
  levelSubjectId: true,
  attemptNumber: true,
  status: true,
  source: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
} as const;

type Row = Record<string, unknown>;

function toRecord(row: Row): ExamAttemptRecord {
  return {
    id: row.id as string,
    organizationId: row.organizationId as string,
    studentId: row.studentId as string,
    enrollmentId: row.enrollmentId as string,
    levelSubjectId: row.levelSubjectId as string,
    attemptNumber: row.attemptNumber as number,
    status: row.status as string,
    source: (row.source as string | null) ?? null,
    createdAt: row.createdAt as Date,
    updatedAt: row.updatedAt as Date,
    deletedAt: (row.deletedAt as Date | null) ?? null,
  };
}

export async function createExamAttempt(
  params: CreateExamAttemptInput,
  client?: PrismaClientOrTx
): Promise<ExamAttemptRecord> {
  const db = client ?? (await getDb());
  const row = await db.examAttempt.create({
    data: {
      organizationId: params.organizationId,
      studentId: params.studentId,
      enrollmentId: params.enrollmentId,
      levelSubjectId: params.levelSubjectId,
      attemptNumber: params.attemptNumber,
      status: params.status,
      source: params.source ?? null,
    },
    select: attemptSelect,
  });
  return toRecord(row);
}

export interface FindExamAttemptByIdParams {
  organizationId: string;
  id: string;
}

export async function findExamAttemptById(
  params: FindExamAttemptByIdParams,
  client?: PrismaClientOrTx
): Promise<ExamAttemptRecord | null> {
  const db = client ?? (await getDb());
  const row = await db.examAttempt.findFirst({
    where: { id: params.id, organizationId: params.organizationId },
    select: attemptSelect,
  });
  return row ? toRecord(row) : null;
}

export interface FindAttemptByEnrollmentSubjectNumberParams {
  organizationId: string;
  enrollmentId: string;
  levelSubjectId: string;
  attemptNumber: number;
}

/** The (org, enrollment, levelSubject, attemptNumber) attempt among live rows,
 *  if any — the uniqueness lookup. No decision. */
export async function findAttemptByEnrollmentSubjectNumber(
  params: FindAttemptByEnrollmentSubjectNumberParams,
  client?: PrismaClientOrTx
): Promise<ExamAttemptRecord | null> {
  const db = client ?? (await getDb());
  const row = await db.examAttempt.findFirst({
    where: {
      organizationId: params.organizationId,
      enrollmentId: params.enrollmentId,
      levelSubjectId: params.levelSubjectId,
      attemptNumber: params.attemptNumber,
      deletedAt: null,
    },
    select: attemptSelect,
  });
  return row ? toRecord(row) : null;
}

function buildListWhere(filters: ListExamAttemptsFilters): Record<string, unknown> {
  const where: Record<string, unknown> = { organizationId: filters.organizationId };
  if (filters.studentId !== undefined) where.studentId = filters.studentId;
  if (filters.enrollmentId !== undefined) where.enrollmentId = filters.enrollmentId;
  if (filters.levelSubjectId !== undefined) where.levelSubjectId = filters.levelSubjectId;
  if (filters.status !== undefined) where.status = filters.status;
  if (!filters.includeDeleted) where.deletedAt = null;
  return where;
}

export async function listExamAttempts(
  filters: ListExamAttemptsFilters,
  client?: PrismaClientOrTx
): Promise<ExamAttemptRecord[]> {
  const db = client ?? (await getDb());
  const rows = await db.examAttempt.findMany({
    where: buildListWhere(filters),
    select: attemptSelect,
    orderBy: [{ createdAt: "desc" }, { id: "asc" }],
    skip: filters.skip,
    take: filters.take,
  });
  return rows.map(toRecord);
}

export async function countExamAttempts(
  filters: ListExamAttemptsFilters,
  client?: PrismaClientOrTx
): Promise<number> {
  const db = client ?? (await getDb());
  return db.examAttempt.count({ where: buildListWhere(filters) });
}

export interface GetNextAttemptNumberCandidateParams {
  organizationId: string;
  enrollmentId: string;
  levelSubjectId: string;
}

/**
 * A CANDIDATE next `attemptNumber` = current max among non-deleted attempts for
 * (org, enrollment, levelSubject) + 1 (or 1 when none exist).
 *
 * NOT race-safe: two concurrent callers can read the same max. Concurrency is
 * handled by the command (conditional write) together with the filtered-unique
 * index on (organizationId, enrollmentId, levelSubjectId, attemptNumber). This
 * layer only reads a suggestion — it decides nothing.
 */
export async function getNextAttemptNumberCandidate(
  params: GetNextAttemptNumberCandidateParams,
  client?: PrismaClientOrTx
): Promise<number> {
  const db = client ?? (await getDb());
  const rows = await db.examAttempt.findMany({
    where: {
      organizationId: params.organizationId,
      enrollmentId: params.enrollmentId,
      levelSubjectId: params.levelSubjectId,
      deletedAt: null,
    },
    select: { attemptNumber: true },
    orderBy: [{ attemptNumber: "desc" }, { id: "asc" }],
    take: 1,
  });
  const max = rows.length ? (rows[0].attemptNumber as number) : 0;
  return max + 1;
}

export interface UpdateExamAttemptMetadataParams {
  organizationId: string;
  id: string;
  patch: UpdateExamAttemptMetadataInput;
}

export async function updateExamAttemptMetadata(
  params: UpdateExamAttemptMetadataParams,
  client?: PrismaClientOrTx
): Promise<{ count: number }> {
  const db = client ?? (await getDb());
  const res = await db.examAttempt.updateMany({
    where: { id: params.id, organizationId: params.organizationId, deletedAt: null },
    data: { ...params.patch },
  });
  return { count: res.count };
}

export async function softDeleteExamAttempt(
  params: FindExamAttemptByIdParams,
  client?: PrismaClientOrTx
): Promise<{ count: number }> {
  const db = client ?? (await getDb());
  const res = await db.examAttempt.updateMany({
    where: { id: params.id, organizationId: params.organizationId, deletedAt: null },
    data: { deletedAt: new Date() },
  });
  return { count: res.count };
}
