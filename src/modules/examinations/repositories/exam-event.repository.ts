import { getDb } from "@/server/db";
import type { PrismaClientOrTx } from "@/server/db";
import type {
  CreateExamEventInput,
  ExamEventRecord,
  ListExamEventsFilters,
} from "@/modules/examinations/types/repository";

// =============================================================================
// EXAM EVENT REPOSITORY (Phase 2) — APPEND-ONLY, persistence only
// -----------------------------------------------------------------------------
// The domain-level append-only history across every exam aggregate. This module
// exposes CREATE + READ only — NO update, NO delete, NO soft delete, NO upsert
// (rows are immutable once written; the model has neither `updatedAt` nor
// `deletedAt`). It publishes nothing and decides nothing: a command writes the
// event describing a transition it has already performed. `metadata` is
// NVarChar(Max) stored raw. Org-scoped throughout.
// =============================================================================

const eventSelect = {
  id: true,
  organizationId: true,
  aggregateType: true,
  aggregateId: true,
  eventType: true,
  previousStatus: true,
  newStatus: true,
  actorId: true,
  reason: true,
  metadata: true,
  createdAt: true,
} as const;

type Row = Record<string, unknown>;

function toRecord(row: Row): ExamEventRecord {
  return {
    id: row.id as string,
    organizationId: row.organizationId as string,
    aggregateType: row.aggregateType as string,
    aggregateId: row.aggregateId as string,
    eventType: row.eventType as string,
    previousStatus: (row.previousStatus as string | null) ?? null,
    newStatus: (row.newStatus as string | null) ?? null,
    actorId: (row.actorId as string | null) ?? null,
    reason: (row.reason as string | null) ?? null,
    metadata: (row.metadata as string | null) ?? null,
    createdAt: row.createdAt as Date,
  };
}

export async function createExamEvent(
  params: CreateExamEventInput,
  client?: PrismaClientOrTx
): Promise<ExamEventRecord> {
  const db = client ?? (await getDb());
  const row = await db.examEvent.create({
    data: {
      organizationId: params.organizationId,
      aggregateType: params.aggregateType,
      aggregateId: params.aggregateId,
      eventType: params.eventType,
      previousStatus: params.previousStatus ?? null,
      newStatus: params.newStatus ?? null,
      actorId: params.actorId ?? null,
      reason: params.reason ?? null,
      metadata: params.metadata ?? null,
    },
    select: eventSelect,
  });
  return toRecord(row);
}

export interface ListExamEventsByAggregateParams {
  organizationId: string;
  aggregateType: string;
  aggregateId: string;
  skip?: number;
  take?: number;
}

/** Chronological (createdAt asc, id asc) history for one aggregate, org-scoped. */
export async function listExamEventsByAggregate(
  params: ListExamEventsByAggregateParams,
  client?: PrismaClientOrTx
): Promise<ExamEventRecord[]> {
  const db = client ?? (await getDb());
  const rows = await db.examEvent.findMany({
    where: {
      organizationId: params.organizationId,
      aggregateType: params.aggregateType,
      aggregateId: params.aggregateId,
    },
    select: eventSelect,
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    skip: params.skip,
    take: params.take,
  });
  return rows.map(toRecord);
}

/** Chronological, optionally filtered by aggregateType / eventType, org-scoped. */
export async function listExamEvents(
  filters: ListExamEventsFilters,
  client?: PrismaClientOrTx
): Promise<ExamEventRecord[]> {
  const db = client ?? (await getDb());
  const where: Record<string, unknown> = { organizationId: filters.organizationId };
  if (filters.aggregateType !== undefined) where.aggregateType = filters.aggregateType;
  if (filters.eventType !== undefined) where.eventType = filters.eventType;

  const rows = await db.examEvent.findMany({
    where,
    select: eventSelect,
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    skip: filters.skip,
    take: filters.take,
  });
  return rows.map(toRecord);
}
