import { getDb } from "@/server/db";
import type { PrismaClientOrTx } from "@/server/db";
import type {
  CreateExamAppealInput,
  ExamAppealRecord,
  FindActiveAppealByResultParams,
  ListExamAppealsFilters,
  MarkAppealDecidedParams,
  MarkAppealUnderReviewParams,
  MarkAppealWithdrawnParams,
  UpdateExamAppealMetadataInput,
} from "@/modules/examinations/types/repository";

// =============================================================================
// EXAM APPEAL REPOSITORY (Phase 2) — persistence only
// -----------------------------------------------------------------------------
// Tenant-safe access for a student's appeal against a result (D4). Makes NO
// decision: a command sets `status` / `decision` / `decidedBy`; this layer
// persists them. No `deletedAt` → NO soft delete, NO hard delete, NO findUnique,
// NO update-by-id.
// =============================================================================

const appealSelect = {
  id: true,
  organizationId: true,
  examResultId: true,
  studentId: true,
  requestedById: true,
  reason: true,
  status: true,
  decision: true,
  decisionReason: true,
  decidedById: true,
  decidedAt: true,
  closedAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

type Row = Record<string, unknown>;

function toRecord(row: Row): ExamAppealRecord {
  return {
    id: row.id as string,
    organizationId: row.organizationId as string,
    examResultId: row.examResultId as string,
    studentId: row.studentId as string,
    requestedById: row.requestedById as string,
    reason: row.reason as string,
    status: row.status as string,
    decision: (row.decision as string | null) ?? null,
    decisionReason: (row.decisionReason as string | null) ?? null,
    decidedById: (row.decidedById as string | null) ?? null,
    decidedAt: (row.decidedAt as Date | null) ?? null,
    closedAt: (row.closedAt as Date | null) ?? null,
    createdAt: row.createdAt as Date,
    updatedAt: row.updatedAt as Date,
  };
}

export async function createExamAppeal(
  params: CreateExamAppealInput,
  client?: PrismaClientOrTx
): Promise<ExamAppealRecord> {
  const db = client ?? (await getDb());
  const row = await db.examAppeal.create({
    data: {
      organizationId: params.organizationId,
      examResultId: params.examResultId,
      studentId: params.studentId,
      requestedById: params.requestedById,
      reason: params.reason,
      status: params.status,
    },
    select: appealSelect,
  });
  return toRecord(row);
}

export interface FindExamAppealByIdParams {
  organizationId: string;
  id: string;
}

export async function findExamAppealById(
  params: FindExamAppealByIdParams,
  client?: PrismaClientOrTx
): Promise<ExamAppealRecord | null> {
  const db = client ?? (await getDb());
  const row = await db.examAppeal.findFirst({
    where: { id: params.id, organizationId: params.organizationId },
    select: appealSelect,
  });
  return row ? toRecord(row) : null;
}

function buildListWhere(filters: ListExamAppealsFilters): Record<string, unknown> {
  const where: Record<string, unknown> = { organizationId: filters.organizationId };
  if (filters.status !== undefined) where.status = filters.status;
  if (filters.studentId !== undefined) where.studentId = filters.studentId;
  if (filters.examResultId !== undefined) where.examResultId = filters.examResultId;
  return where;
}

export async function listExamAppeals(
  filters: ListExamAppealsFilters,
  client?: PrismaClientOrTx
): Promise<ExamAppealRecord[]> {
  const db = client ?? (await getDb());
  const rows = await db.examAppeal.findMany({
    where: buildListWhere(filters),
    select: appealSelect,
    orderBy: [{ createdAt: "desc" }, { id: "asc" }],
    skip: filters.skip,
    take: filters.take,
  });
  return rows.map(toRecord);
}

export async function countExamAppeals(
  filters: ListExamAppealsFilters,
  client?: PrismaClientOrTx
): Promise<number> {
  const db = client ?? (await getDb());
  return db.examAppeal.count({ where: buildListWhere(filters) });
}

export interface UpdateExamAppealMetadataParams {
  organizationId: string;
  id: string;
  patch: UpdateExamAppealMetadataInput;
}

export async function updateExamAppealMetadata(
  params: UpdateExamAppealMetadataParams,
  client?: PrismaClientOrTx
): Promise<{ count: number }> {
  const db = client ?? (await getDb());
  const res = await db.examAppeal.updateMany({
    where: { id: params.id, organizationId: params.organizationId },
    data: { ...params.patch },
  });
  return { count: res.count };
}

// =============================================================================
// PHASE 10 — APPEAL WORKFLOW PRIMITIVES (thin, org-scoped, conditional)
// -----------------------------------------------------------------------------
// Conditional status transitions that PIN the expected current status in `where`
// so a concurrently-moved row matches zero rows → `{ count: 0 }`; the command
// asserts `count === 1` (else `APPEAL_CONCURRENTLY_CHANGED`). NO workflow / rule
// decision lives here — the command owns the PENDING → UNDER_REVIEW → APPROVED /
// REJECTED / WITHDRAWN lifecycle and passes the resolved columns.
// =============================================================================

/** Conditional PENDING → UNDER_REVIEW mark. Only a still-PENDING row matches. */
export async function markAppealUnderReview(
  params: MarkAppealUnderReviewParams,
  client?: PrismaClientOrTx
): Promise<{ count: number }> {
  const db = client ?? (await getDb());
  const res = await db.examAppeal.updateMany({
    where: { id: params.id, organizationId: params.organizationId, status: "PENDING" },
    data: { status: "UNDER_REVIEW" },
  });
  return { count: res.count };
}

/** Conditional UNDER_REVIEW → APPROVED mark (stamps decision + decidedBy/At).
 *  Only a still-UNDER_REVIEW row matches. */
export async function markAppealApproved(
  params: MarkAppealDecidedParams,
  client?: PrismaClientOrTx
): Promise<{ count: number }> {
  const db = client ?? (await getDb());
  const res = await db.examAppeal.updateMany({
    where: { id: params.id, organizationId: params.organizationId, status: "UNDER_REVIEW" },
    data: {
      status: "APPROVED",
      decision: "APPROVED",
      decisionReason: params.decisionReason,
      decidedById: params.decidedById,
      decidedAt: params.decidedAt,
    },
  });
  return { count: res.count };
}

/** Conditional UNDER_REVIEW → REJECTED mark (stamps decision + decidedBy/At).
 *  Only a still-UNDER_REVIEW row matches. */
export async function markAppealRejected(
  params: MarkAppealDecidedParams,
  client?: PrismaClientOrTx
): Promise<{ count: number }> {
  const db = client ?? (await getDb());
  const res = await db.examAppeal.updateMany({
    where: { id: params.id, organizationId: params.organizationId, status: "UNDER_REVIEW" },
    data: {
      status: "REJECTED",
      decision: "REJECTED",
      decisionReason: params.decisionReason,
      decidedById: params.decidedById,
      decidedAt: params.decidedAt,
    },
  });
  return { count: res.count };
}

/** Conditional PENDING → WITHDRAWN mark (stamps `closedAt`). Only a still-PENDING
 *  row matches — a student may withdraw only before review opens. */
export async function markAppealWithdrawn(
  params: MarkAppealWithdrawnParams,
  client?: PrismaClientOrTx
): Promise<{ count: number }> {
  const db = client ?? (await getDb());
  const res = await db.examAppeal.updateMany({
    where: { id: params.id, organizationId: params.organizationId, status: "PENDING" },
    data: { status: "WITHDRAWN", closedAt: params.closedAt },
  });
  return { count: res.count };
}

/** The active (PENDING | UNDER_REVIEW) appeal for a result, if any — the duplicate
 *  guard the create command reads. Read-only; decides nothing. */
export async function findActiveAppealByResult(
  params: FindActiveAppealByResultParams,
  client?: PrismaClientOrTx
): Promise<ExamAppealRecord | null> {
  const db = client ?? (await getDb());
  const row = await db.examAppeal.findFirst({
    where: {
      organizationId: params.organizationId,
      examResultId: params.examResultId,
      status: { in: ["PENDING", "UNDER_REVIEW"] },
    },
    select: appealSelect,
  });
  return row ? toRecord(row) : null;
}
