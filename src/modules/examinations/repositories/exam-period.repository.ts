import { getDb } from "@/server/db";
import type { PrismaClientOrTx } from "@/server/db";
import type {
  CreateExamPeriodInput,
  ExamPeriodRecord,
  ListExamPeriodsFilters,
  UpdateExamPeriodMetadataInput,
} from "@/modules/examinations/types/repository";

// =============================================================================
// EXAM PERIOD REPOSITORY (Phase 2) — persistence only
// -----------------------------------------------------------------------------
// Tenant-safe access for the exam calendar container. Makes NO lifecycle
// decision: a command decides DRAFT→OPEN→LOCKED→COMPLETED/CANCELLED and passes
// the columns; this layer only persists them. Org-scoped throughout; soft delete
// sets `deletedAt`; NO hard delete, NO findUnique, NO update-by-id.
// =============================================================================

const periodSelect = {
  id: true,
  organizationId: true,
  branchId: true,
  name: true,
  academicYear: true,
  term: true,
  status: true,
  startsAt: true,
  endsAt: true,
  lockedAt: true,
  completedAt: true,
  cancelledAt: true,
  createdById: true,
  lockedById: true,
  completedById: true,
  cancelledById: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
} as const;

type Row = Record<string, unknown>;

function toRecord(row: Row): ExamPeriodRecord {
  return {
    id: row.id as string,
    organizationId: row.organizationId as string,
    branchId: (row.branchId as string | null) ?? null,
    name: row.name as string,
    academicYear: row.academicYear as string,
    term: (row.term as string | null) ?? null,
    status: row.status as string,
    startsAt: row.startsAt as Date,
    endsAt: row.endsAt as Date,
    lockedAt: (row.lockedAt as Date | null) ?? null,
    completedAt: (row.completedAt as Date | null) ?? null,
    cancelledAt: (row.cancelledAt as Date | null) ?? null,
    createdById: (row.createdById as string | null) ?? null,
    lockedById: (row.lockedById as string | null) ?? null,
    completedById: (row.completedById as string | null) ?? null,
    cancelledById: (row.cancelledById as string | null) ?? null,
    createdAt: row.createdAt as Date,
    updatedAt: row.updatedAt as Date,
    deletedAt: (row.deletedAt as Date | null) ?? null,
  };
}

export async function createExamPeriod(
  params: CreateExamPeriodInput,
  client?: PrismaClientOrTx
): Promise<ExamPeriodRecord> {
  const db = client ?? (await getDb());
  const row = await db.examPeriod.create({
    data: {
      organizationId: params.organizationId,
      name: params.name,
      academicYear: params.academicYear,
      startsAt: params.startsAt,
      endsAt: params.endsAt,
      branchId: params.branchId ?? null,
      term: params.term ?? null,
      status: params.status,
      createdById: params.createdById ?? null,
    },
    select: periodSelect,
  });
  return toRecord(row);
}

export interface FindExamPeriodByIdParams {
  organizationId: string;
  id: string;
}

export async function findExamPeriodById(
  params: FindExamPeriodByIdParams,
  client?: PrismaClientOrTx
): Promise<ExamPeriodRecord | null> {
  const db = client ?? (await getDb());
  const row = await db.examPeriod.findFirst({
    where: { id: params.id, organizationId: params.organizationId },
    select: periodSelect,
  });
  return row ? toRecord(row) : null;
}

function buildListWhere(filters: ListExamPeriodsFilters): Record<string, unknown> {
  const where: Record<string, unknown> = { organizationId: filters.organizationId };
  if (filters.status !== undefined) where.status = filters.status;
  if (filters.academicYear !== undefined) where.academicYear = filters.academicYear;
  if (!filters.includeDeleted) where.deletedAt = null;
  return where;
}

export async function listExamPeriods(
  filters: ListExamPeriodsFilters,
  client?: PrismaClientOrTx
): Promise<ExamPeriodRecord[]> {
  const db = client ?? (await getDb());
  const rows = await db.examPeriod.findMany({
    where: buildListWhere(filters),
    select: periodSelect,
    orderBy: [{ createdAt: "desc" }, { id: "asc" }],
    skip: filters.skip,
    take: filters.take,
  });
  return rows.map(toRecord);
}

export async function countExamPeriods(
  filters: ListExamPeriodsFilters,
  client?: PrismaClientOrTx
): Promise<number> {
  const db = client ?? (await getDb());
  return db.examPeriod.count({ where: buildListWhere(filters) });
}

export interface UpdateExamPeriodMetadataParams {
  organizationId: string;
  id: string;
  patch: UpdateExamPeriodMetadataInput;
}

/** Thin metadata write. NO lifecycle/business decision — commands decide the
 *  allowed transition and pass the resolved columns. Caller asserts `count`. */
export async function updateExamPeriodMetadata(
  params: UpdateExamPeriodMetadataParams,
  client?: PrismaClientOrTx
): Promise<{ count: number }> {
  const db = client ?? (await getDb());
  const res = await db.examPeriod.updateMany({
    where: { id: params.id, organizationId: params.organizationId, deletedAt: null },
    data: { ...params.patch },
  });
  return { count: res.count };
}

export async function softDeleteExamPeriod(
  params: FindExamPeriodByIdParams,
  client?: PrismaClientOrTx
): Promise<{ count: number }> {
  const db = client ?? (await getDb());
  const res = await db.examPeriod.updateMany({
    where: { id: params.id, organizationId: params.organizationId, deletedAt: null },
    data: { deletedAt: new Date() },
  });
  return { count: res.count };
}
