import { getDb } from "@/server/db";
import type { PrismaClientOrTx } from "@/server/db";
import type {
  CreateExamResultInput,
  ExamResultRecord,
  ExamResultRevisionRecord,
  ListExamResultsFilters,
  MarkExamResultApprovedParams,
  MarkExamResultReviewedParams,
  MarkExamResultsPublishedConditionallyParams,
  MarkExamResultSubmittedParams,
  ResultsBySessionParams,
  ReturnExamResultsToApprovedConditionallyParams,
  ReturnExamResultToDraftParams,
  UpdateDraftExamResultConditionallyParams,
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

// =============================================================================
// PHASE 7 — RESULT-ENTRY PRIMITIVES (thin, org-scoped; no rule / decision)
// -----------------------------------------------------------------------------
// Conditional writes that pin `status = 'DRAFT'` so a SUBMITTED/REVIEWED/APPROVED/
// PUBLISHED/INVALIDATED (or concurrently-moved) row matches zero rows →
// `{ count: 0 }`; the command asserts `count === 1`. Because ExamResult carries no
// `examSessionId`, the session-scoped reads resolve the session's candidate ids
// first, then read the results for that id set. NO normalization, NO pass/fail, NO
// business rule lives here — the caller resolves every column value.
// =============================================================================

/** Conditional DRAFT edit: writes the resolved score/maxScore/normalizedScore/
 *  resultCode/remarks columns only when the row is still `DRAFT` (per id, org).
 *  `markerId` is written only when the caller included it in `patch`. */
export async function updateDraftExamResultConditionally(
  params: UpdateDraftExamResultConditionallyParams,
  client?: PrismaClientOrTx
): Promise<{ count: number }> {
  const db = client ?? (await getDb());
  const { patch } = params;
  const res = await db.examResult.updateMany({
    where: { id: params.id, organizationId: params.organizationId, status: "DRAFT" },
    data: {
      score: patch.score,
      maxScore: patch.maxScore,
      normalizedScore: patch.normalizedScore,
      resultCode: patch.resultCode,
      ...(patch.remarks !== undefined ? { remarks: patch.remarks } : {}),
      ...(patch.markerId !== undefined ? { markerId: patch.markerId } : {}),
    },
  });
  return { count: res.count };
}

/** Conditional DRAFT → SUBMITTED mark (stamps `submittedAt`; `markerId` only when
 *  supplied). Only a still-DRAFT row matches, so a double-submit ⇒ `{ count: 0 }`. */
export async function markExamResultSubmitted(
  params: MarkExamResultSubmittedParams,
  client?: PrismaClientOrTx
): Promise<{ count: number }> {
  const db = client ?? (await getDb());
  const res = await db.examResult.updateMany({
    where: { id: params.id, organizationId: params.organizationId, status: "DRAFT" },
    data: {
      status: "SUBMITTED",
      submittedAt: params.submittedAt,
      ...(params.markerId !== undefined ? { markerId: params.markerId } : {}),
    },
  });
  return { count: res.count };
}

/** Conditional SUBMITTED → REVIEWED mark (stamps `reviewedById` / `reviewedAt`).
 *  Only a still-SUBMITTED row matches, so a lost race / double-review ⇒ `{ count: 0 }`.
 *  No lifecycle / separation / attendance decision — the command owns those. */
export async function markExamResultReviewed(
  params: MarkExamResultReviewedParams,
  client?: PrismaClientOrTx
): Promise<{ count: number }> {
  const db = client ?? (await getDb());
  const res = await db.examResult.updateMany({
    where: { id: params.id, organizationId: params.organizationId, status: "SUBMITTED" },
    data: {
      status: "REVIEWED",
      reviewedById: params.reviewedById,
      reviewedAt: params.reviewedAt,
    },
  });
  return { count: res.count };
}

/** Conditional REVIEWED → APPROVED mark (stamps `approvedById` / `approvedAt`).
 *  Only a still-REVIEWED row matches, so a lost race / double-approve ⇒ `{ count: 0 }`. */
export async function markExamResultApproved(
  params: MarkExamResultApprovedParams,
  client?: PrismaClientOrTx
): Promise<{ count: number }> {
  const db = client ?? (await getDb());
  const res = await db.examResult.updateMany({
    where: { id: params.id, organizationId: params.organizationId, status: "REVIEWED" },
    data: {
      status: "APPROVED",
      approvedById: params.approvedById,
      approvedAt: params.approvedAt,
    },
  });
  return { count: res.count };
}

/** Conditional return to DRAFT from the observed status (SUBMITTED | REVIEWED),
 *  pinned in `where` so a concurrently-moved row matches zero rows. When
 *  `clearReviewMetadata` is set (returning from REVIEWED) the review stamps are
 *  cleared. `markerId` and the score/resultCode columns are NEVER touched here —
 *  content correction happens later via `UpdateDraftExamResultCommand`. */
export async function returnExamResultToDraft(
  params: ReturnExamResultToDraftParams,
  client?: PrismaClientOrTx
): Promise<{ count: number }> {
  const db = client ?? (await getDb());
  const res = await db.examResult.updateMany({
    where: {
      id: params.id,
      organizationId: params.organizationId,
      status: params.expectedStatus,
    },
    data: {
      status: "DRAFT",
      ...(params.clearReviewMetadata ? { reviewedById: null, reviewedAt: null } : {}),
    },
  });
  return { count: res.count };
}

// =============================================================================
// PHASE 9 — RESULT-PUBLICATION PRIMITIVES (batch conditional; no rule / decision)
// -----------------------------------------------------------------------------
// Batch conditional writes pinning the expected current status in `where` so any
// row not in that status matches zero rows; the caller supplies the exact id set
// and asserts `count === ids.length`. They ONLY flip status + stamp / clear
// `publishedAt` — the score / maxScore / normalizedScore / resultCode / markerId /
// reviewedById / approvedById / remarks content columns are NEVER touched. No
// readiness / visibility decision lives here — the Phase-9 command owns it.
// =============================================================================

/** Conditional APPROVED → PUBLISHED for a fixed id set (stamps `publishedAt`).
 *  Only still-APPROVED rows match; the caller asserts `count === ids.length`. */
export async function markExamResultsPublishedConditionally(
  params: MarkExamResultsPublishedConditionallyParams,
  client?: PrismaClientOrTx
): Promise<{ count: number }> {
  const db = client ?? (await getDb());
  if (params.ids.length === 0) return { count: 0 };
  const res = await db.examResult.updateMany({
    where: { organizationId: params.organizationId, id: { in: params.ids }, status: "APPROVED" },
    data: { status: "PUBLISHED", publishedAt: new Date() },
  });
  return { count: res.count };
}

/** Conditional PUBLISHED → APPROVED for a fixed id set (retraction; clears
 *  `publishedAt`). Only still-PUBLISHED rows match; the caller asserts
 *  `count === ids.length`. NEVER touches score / maxScore / normalizedScore /
 *  resultCode / markerId / reviewedById / approvedById / remarks. */
export async function returnExamResultsToApprovedConditionally(
  params: ReturnExamResultsToApprovedConditionallyParams,
  client?: PrismaClientOrTx
): Promise<{ count: number }> {
  const db = client ?? (await getDb());
  if (params.ids.length === 0) return { count: 0 };
  const res = await db.examResult.updateMany({
    where: { organizationId: params.organizationId, id: { in: params.ids }, status: "PUBLISHED" },
    data: { status: "APPROVED", publishedAt: null },
  });
  return { count: res.count };
}

/** The live candidate ids of a session (soft-deleted rows excluded). Internal
 *  helper for the session-scoped result reads. */
async function sessionCandidateIds(
  params: ResultsBySessionParams,
  db: PrismaClientOrTx
): Promise<string[]> {
  const rows = await db.examCandidate.findMany({
    where: {
      organizationId: params.organizationId,
      examSessionId: params.examSessionId,
      deletedAt: null,
    },
    select: { id: true },
  });
  return rows.map((r) => r.id as string);
}

/** Results for every candidate in a session (read-only roster). */
export async function findResultsBySession(
  params: ResultsBySessionParams,
  client?: PrismaClientOrTx
): Promise<ExamResultRecord[]> {
  const db = client ?? (await getDb());
  const ids = await sessionCandidateIds(params, db);
  if (ids.length === 0) return [];
  const rows = await db.examResult.findMany({
    where: { organizationId: params.organizationId, examCandidateId: { in: ids } },
    select: resultSelect,
    orderBy: [{ createdAt: "desc" }, { id: "asc" }],
  });
  return rows.map(toRecord);
}

/** Count of results recorded for a session's candidates (read-only). */
export async function countResultsBySession(
  params: ResultsBySessionParams,
  client?: PrismaClientOrTx
): Promise<number> {
  const db = client ?? (await getDb());
  const ids = await sessionCandidateIds(params, db);
  if (ids.length === 0) return 0;
  return db.examResult.count({
    where: { organizationId: params.organizationId, examCandidateId: { in: ids } },
  });
}
