import { getDb } from "@/server/db";
import type { PrismaClientOrTx } from "@/server/db";
import type {
  CreateExamAppealInput,
  ExamAppealRecord,
  ListExamAppealsFilters,
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
