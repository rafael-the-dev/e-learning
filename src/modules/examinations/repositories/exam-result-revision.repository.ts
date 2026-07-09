import { getDb } from "@/server/db";
import type { PrismaClientOrTx } from "@/server/db";
import type {
  CreateExamResultRevisionInput,
  ExamResultRevisionRecord,
} from "@/modules/examinations/types/repository";

// =============================================================================
// EXAM RESULT REVISION REPOSITORY (Phase 2) — append-only create + thin flags
// -----------------------------------------------------------------------------
// The append-only revision history (D4/D14): a revision is CREATED, never
// rewritten — scores / reason / sourceType are immutable after write, so this
// layer exposes NO score/reason update and NO delete. `markRevisionCurrent` /
// `clearCurrentRevisionForResult` are thin `isCurrent` toggles (a command decides
// which revision becomes current and orchestrates the swap; the single-CURRENT
// invariant is a filtered-unique index in the migration). Org-scoped throughout.
// =============================================================================

/** Prisma Decimal | null → number | null. Copy, not calculation. */
const toNum = (v: unknown): number | null => (v == null ? null : Number(v));

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

function toRecord(row: Row): ExamResultRevisionRecord {
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

export async function createExamResultRevision(
  params: CreateExamResultRevisionInput,
  client?: PrismaClientOrTx
): Promise<ExamResultRevisionRecord> {
  const db = client ?? (await getDb());
  const row = await db.examResultRevision.create({
    data: {
      organizationId: params.organizationId,
      examResultId: params.examResultId,
      revisionNumber: params.revisionNumber,
      reason: params.reason,
      sourceType: params.sourceType,
      previousScore: params.previousScore ?? null,
      revisedScore: params.revisedScore ?? null,
      previousStatus: params.previousStatus ?? null,
      revisedStatus: params.revisedStatus ?? null,
      status: params.status,
      isCurrent: params.isCurrent,
      createdById: params.createdById ?? null,
    },
    select: revisionSelect,
  });
  return toRecord(row);
}

export interface FindExamResultRevisionByIdParams {
  organizationId: string;
  id: string;
}

export async function findExamResultRevisionById(
  params: FindExamResultRevisionByIdParams,
  client?: PrismaClientOrTx
): Promise<ExamResultRevisionRecord | null> {
  const db = client ?? (await getDb());
  const row = await db.examResultRevision.findFirst({
    where: { id: params.id, organizationId: params.organizationId },
    select: revisionSelect,
  });
  return row ? toRecord(row) : null;
}

export interface RevisionsByResultParams {
  organizationId: string;
  examResultId: string;
}

/** The full revision chain for a result, oldest first (revisionNumber asc). */
export async function listRevisionsByResult(
  params: RevisionsByResultParams,
  client?: PrismaClientOrTx
): Promise<ExamResultRevisionRecord[]> {
  const db = client ?? (await getDb());
  const rows = await db.examResultRevision.findMany({
    where: { organizationId: params.organizationId, examResultId: params.examResultId },
    select: revisionSelect,
    orderBy: [{ revisionNumber: "asc" }, { id: "asc" }],
  });
  return rows.map(toRecord);
}

/** The single CURRENT revision for a result (`isCurrent = true`), if any. */
export async function findCurrentRevisionByResult(
  params: RevisionsByResultParams,
  client?: PrismaClientOrTx
): Promise<ExamResultRevisionRecord | null> {
  const db = client ?? (await getDb());
  const row = await db.examResultRevision.findFirst({
    where: {
      organizationId: params.organizationId,
      examResultId: params.examResultId,
      isCurrent: true,
    },
    select: revisionSelect,
  });
  return row ? toRecord(row) : null;
}

export interface MarkRevisionCurrentParams {
  organizationId: string;
  id: string;
}

/** Thin primitive: set `isCurrent = true` on one revision. A command clears the
 *  previous current first and asserts `count === 1`. No decision here. */
export async function markRevisionCurrent(
  params: MarkRevisionCurrentParams,
  client?: PrismaClientOrTx
): Promise<{ count: number }> {
  const db = client ?? (await getDb());
  const res = await db.examResultRevision.updateMany({
    where: { id: params.id, organizationId: params.organizationId },
    data: { isCurrent: true },
  });
  return { count: res.count };
}

/** Thin primitive: clear `isCurrent` for every revision of a result (the command
 *  calls this before marking a new current). No decision here. */
export async function clearCurrentRevisionForResult(
  params: RevisionsByResultParams,
  client?: PrismaClientOrTx
): Promise<{ count: number }> {
  const db = client ?? (await getDb());
  const res = await db.examResultRevision.updateMany({
    where: {
      organizationId: params.organizationId,
      examResultId: params.examResultId,
      isCurrent: true,
    },
    data: { isCurrent: false },
  });
  return { count: res.count };
}
