import { getDb } from "@/server/db";
import type { PrismaClientOrTx } from "@/server/db";
import type {
  CreateExamResultInput,
  ExamResultRecord,
  ExamResultRevisionRecord,
  ListExamResultsFilters,
  UpdateExamResultMetadataInput,
} from "@/modules/examinations/types/repository";

// =============================================================================
// EXAM RESULT REPOSITORY (Phase 2) — persistence only
// -----------------------------------------------------------------------------
// Tenant-safe access for the official exam result, one row per candidate
// (examCandidateId is @unique). Decimal columns (score / maxScore /
// normalizedScore) are copied to `number` — never recomputed, never pass/fail'd.
// `currentRevisionId` is a plain pointer (not a relation). No `deletedAt` → NO
// soft delete, NO hard delete, NO findUnique, NO update-by-id. The command owns
// the DRAFT→SUBMITTED→REVIEWED→APPROVED→PUBLISHED lifecycle; this layer persists
// primitive column patches only.
// =============================================================================

/** Prisma Decimal | null → number | null. Copy, not calculation. */
const toNum = (v: unknown): number | null => (v == null ? null : Number(v));

const resultSelect = {
  id: true,
  organizationId: true,
  examCandidateId: true,
  examAttemptId: true,
  studentId: true,
  enrollmentId: true,
  levelSubjectId: true,
  score: true,
  maxScore: true,
  normalizedScore: true,
  status: true,
  resultCode: true,
  markerId: true,
  reviewedById: true,
  approvedById: true,
  submittedAt: true,
  reviewedAt: true,
  approvedAt: true,
  publishedAt: true,
  invalidatedAt: true,
  invalidationReason: true,
  remarks: true,
  resultChecksum: true,
  currentRevisionId: true,
  createdAt: true,
  updatedAt: true,
} as const;

const revisionSelect = {
  id: true,
  organizationId: true,
  examResultId: true,
  revisionNumber: true,
  previousScore: true,
  revisedScore: true,
  previousStatus: true,
  revisedStatus: true,
  reason: true,
  sourceType: true,
  status: true,
  isCurrent: true,
  createdById: true,
  approvedById: true,
  approvedAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

type Row = Record<string, unknown>;

function toRecord(row: Row): ExamResultRecord {
  return {
    id: row.id as string,
    organizationId: row.organizationId as string,
    examCandidateId: row.examCandidateId as string,
    examAttemptId: row.examAttemptId as string,
    studentId: row.studentId as string,
    enrollmentId: row.enrollmentId as string,
    levelSubjectId: row.levelSubjectId as string,
    score: toNum(row.score),
    maxScore: Number(row.maxScore),
    normalizedScore: toNum(row.normalizedScore),
    status: row.status as string,
    resultCode: (row.resultCode as string | null) ?? null,
    markerId: (row.markerId as string | null) ?? null,
    reviewedById: (row.reviewedById as string | null) ?? null,
    approvedById: (row.approvedById as string | null) ?? null,
    submittedAt: (row.submittedAt as Date | null) ?? null,
    reviewedAt: (row.reviewedAt as Date | null) ?? null,
    approvedAt: (row.approvedAt as Date | null) ?? null,
    publishedAt: (row.publishedAt as Date | null) ?? null,
    invalidatedAt: (row.invalidatedAt as Date | null) ?? null,
    invalidationReason: (row.invalidationReason as string | null) ?? null,
    remarks: (row.remarks as string | null) ?? null,
    resultChecksum: (row.resultChecksum as string | null) ?? null,
    currentRevisionId: (row.currentRevisionId as string | null) ?? null,
    createdAt: row.createdAt as Date,
    updatedAt: row.updatedAt as Date,
  };
}

function toRevisionRecord(row: Row): ExamResultRevisionRecord {
  return {
    id: row.id as string,
    organizationId: row.organizationId as string,
    examResultId: row.examResultId as string,
    revisionNumber: row.revisionNumber as number,
    previousScore: toNum(row.previousScore),
    revisedScore: toNum(row.revisedScore),
    previousStatus: (row.previousStatus as string | null) ?? null,
    revisedStatus: (row.revisedStatus as string | null) ?? null,
    reason: row.reason as string,
    sourceType: row.sourceType as string,
    status: row.status as string,
    isCurrent: row.isCurrent as boolean,
    createdById: (row.createdById as string | null) ?? null,
    approvedById: (row.approvedById as string | null) ?? null,
    approvedAt: (row.approvedAt as Date | null) ?? null,
    createdAt: row.createdAt as Date,
    updatedAt: row.updatedAt as Date,
  };
}

export async function createExamResult(
  params: CreateExamResultInput,
  client?: PrismaClientOrTx
): Promise<ExamResultRecord> {
  const db = client ?? (await getDb());
  const row = await db.examResult.create({
    data: {
      organizationId: params.organizationId,
      examCandidateId: params.examCandidateId,
      examAttemptId: params.examAttemptId,
      studentId: params.studentId,
      enrollmentId: params.enrollmentId,
      levelSubjectId: params.levelSubjectId,
      maxScore: params.maxScore,
      score: params.score ?? null,
      normalizedScore: params.normalizedScore ?? null,
      status: params.status,
      resultCode: params.resultCode ?? null,
      markerId: params.markerId ?? null,
      remarks: params.remarks ?? null,
    },
    select: resultSelect,
  });
  return toRecord(row);
}

export interface FindExamResultByIdParams {
  organizationId: string;
  id: string;
}

export async function findExamResultById(
  params: FindExamResultByIdParams,
  client?: PrismaClientOrTx
): Promise<ExamResultRecord | null> {
  const db = client ?? (await getDb());
  const row = await db.examResult.findFirst({
    where: { id: params.id, organizationId: params.organizationId },
    select: resultSelect,
  });
  return row ? toRecord(row) : null;
}

export interface FindResultByCandidateIdParams {
  organizationId: string;
  examCandidateId: string;
}

export async function findResultByCandidateId(
  params: FindResultByCandidateIdParams,
  client?: PrismaClientOrTx
): Promise<ExamResultRecord | null> {
  const db = client ?? (await getDb());
  const row = await db.examResult.findFirst({
    where: { organizationId: params.organizationId, examCandidateId: params.examCandidateId },
    select: resultSelect,
  });
  return row ? toRecord(row) : null;
}

export interface CurrentOfficialResult {
  result: ExamResultRecord;
  currentRevision: ExamResultRevisionRecord | null;
}

export interface FindCurrentOfficialResultParams {
  organizationId: string;
  /** Locate the result by its own id … */
  examResultId?: string;
  /** … or by the owning candidate (one of the two must be supplied). */
  examCandidateId?: string;
}

/**
 * Assemble the "current official result" projection (D14): the ExamResult plus,
 * when `currentRevisionId` is set, the pointed-to ExamResultRevision. Pure
 * assembly — it does NOT decide pass/fail and does NOT recompute a score. Returns
 * `null` when no result matches for the organization. When the base result has no
 * `currentRevisionId`, `currentRevision` is `null`.
 */
export async function findCurrentOfficialResult(
  params: FindCurrentOfficialResultParams,
  client?: PrismaClientOrTx
): Promise<CurrentOfficialResult | null> {
  const db = client ?? (await getDb());
  const where: Record<string, unknown> = { organizationId: params.organizationId };
  if (params.examResultId !== undefined) where.id = params.examResultId;
  if (params.examCandidateId !== undefined) where.examCandidateId = params.examCandidateId;

  const resultRow = await db.examResult.findFirst({ where, select: resultSelect });
  if (!resultRow) return null;
  const result = toRecord(resultRow);

  if (!result.currentRevisionId) return { result, currentRevision: null };

  const revisionRow = await db.examResultRevision.findFirst({
    where: {
      id: result.currentRevisionId,
      organizationId: params.organizationId,
      examResultId: result.id,
    },
    select: revisionSelect,
  });
  return { result, currentRevision: revisionRow ? toRevisionRecord(revisionRow) : null };
}

function buildListWhere(filters: ListExamResultsFilters): Record<string, unknown> {
  const where: Record<string, unknown> = { organizationId: filters.organizationId };
  if (filters.status !== undefined) where.status = filters.status;
  if (filters.studentId !== undefined) where.studentId = filters.studentId;
  if (filters.enrollmentId !== undefined) where.enrollmentId = filters.enrollmentId;
  if (filters.levelSubjectId !== undefined) where.levelSubjectId = filters.levelSubjectId;
  return where;
}

export async function listExamResults(
  filters: ListExamResultsFilters,
  client?: PrismaClientOrTx
): Promise<ExamResultRecord[]> {
  const db = client ?? (await getDb());
  const rows = await db.examResult.findMany({
    where: buildListWhere(filters),
    select: resultSelect,
    orderBy: [{ createdAt: "desc" }, { id: "asc" }],
    skip: filters.skip,
    take: filters.take,
  });
  return rows.map(toRecord);
}

export async function countExamResults(
  filters: ListExamResultsFilters,
  client?: PrismaClientOrTx
): Promise<number> {
  const db = client ?? (await getDb());
  return db.examResult.count({ where: buildListWhere(filters) });
}

export interface UpdateExamResultMetadataParams {
  organizationId: string;
  id: string;
  patch: UpdateExamResultMetadataInput;
}

/** Primitive column patch. NO lifecycle/business decision — commands decide the
 *  allowed transition and pass the resolved columns. Caller asserts `count`. */
export async function updateExamResultMetadata(
  params: UpdateExamResultMetadataParams,
  client?: PrismaClientOrTx
): Promise<{ count: number }> {
  const db = client ?? (await getDb());
  const res = await db.examResult.updateMany({
    where: { id: params.id, organizationId: params.organizationId },
    data: { ...params.patch },
  });
  return { count: res.count };
}
