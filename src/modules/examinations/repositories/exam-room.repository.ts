import { getDb } from "@/server/db";
import type { PrismaClientOrTx } from "@/server/db";
import type {
  ArchiveExamRoomParams,
  CreateExamRoomInput,
  ExamRoomFutureSessionRef,
  ExamRoomRecord,
  FindFutureSessionsByRoomParams,
  ListExamRoomsFilters,
  UpdateExamRoomMetadataInput,
} from "@/modules/examinations/types/repository";

// =============================================================================
// EXAM ROOM REPOSITORY (Phase 2) — persistence only
// -----------------------------------------------------------------------------
// Tenant-safe access for exam venues (local v1 model, D11). No capacity/booking
// decision — a command decides; this layer persists. Org-scoped; soft delete
// sets `deletedAt`; NO hard delete, NO findUnique, NO update-by-id. The
// (organizationId, code) uniqueness among live rows is a filtered index enforced
// in the migration — this repo only reads the live row by code.
// =============================================================================

const roomSelect = {
  id: true,
  organizationId: true,
  branchId: true,
  name: true,
  code: true,
  capacity: true,
  status: true,
  description: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
} as const;

type Row = Record<string, unknown>;

function toRecord(row: Row): ExamRoomRecord {
  return {
    id: row.id as string,
    organizationId: row.organizationId as string,
    branchId: (row.branchId as string | null) ?? null,
    name: row.name as string,
    code: (row.code as string | null) ?? null,
    capacity: row.capacity as number,
    status: row.status as string,
    description: (row.description as string | null) ?? null,
    createdAt: row.createdAt as Date,
    updatedAt: row.updatedAt as Date,
    deletedAt: (row.deletedAt as Date | null) ?? null,
  };
}

export async function createExamRoom(
  params: CreateExamRoomInput,
  client?: PrismaClientOrTx
): Promise<ExamRoomRecord> {
  const db = client ?? (await getDb());
  const row = await db.examRoom.create({
    data: {
      organizationId: params.organizationId,
      name: params.name,
      capacity: params.capacity,
      branchId: params.branchId ?? null,
      code: params.code ?? null,
      status: params.status,
      description: params.description ?? null,
    },
    select: roomSelect,
  });
  return toRecord(row);
}

export interface FindExamRoomByIdParams {
  organizationId: string;
  id: string;
}

export async function findExamRoomById(
  params: FindExamRoomByIdParams,
  client?: PrismaClientOrTx
): Promise<ExamRoomRecord | null> {
  const db = client ?? (await getDb());
  const row = await db.examRoom.findFirst({
    where: { id: params.id, organizationId: params.organizationId },
    select: roomSelect,
  });
  return row ? toRecord(row) : null;
}

export interface FindExamRoomByCodeParams {
  organizationId: string;
  code: string;
}

/** The live (not soft-deleted) room with this code, if any — the duplicate-code
 *  lookup. Terminal (deleted) rooms never match. Org-scoped, no decision. */
export async function findExamRoomByCode(
  params: FindExamRoomByCodeParams,
  client?: PrismaClientOrTx
): Promise<ExamRoomRecord | null> {
  const db = client ?? (await getDb());
  const row = await db.examRoom.findFirst({
    where: { organizationId: params.organizationId, code: params.code, deletedAt: null },
    select: roomSelect,
  });
  return row ? toRecord(row) : null;
}

function buildListWhere(filters: ListExamRoomsFilters): Record<string, unknown> {
  const where: Record<string, unknown> = { organizationId: filters.organizationId };
  if (filters.branchId !== undefined) where.branchId = filters.branchId;
  if (filters.status !== undefined) where.status = filters.status;
  if (!filters.includeDeleted) where.deletedAt = null;
  return where;
}

export async function listExamRooms(
  filters: ListExamRoomsFilters,
  client?: PrismaClientOrTx
): Promise<ExamRoomRecord[]> {
  const db = client ?? (await getDb());
  const rows = await db.examRoom.findMany({
    where: buildListWhere(filters),
    select: roomSelect,
    orderBy: [{ createdAt: "desc" }, { id: "asc" }],
    skip: filters.skip,
    take: filters.take,
  });
  return rows.map(toRecord);
}

export async function countExamRooms(
  filters: ListExamRoomsFilters,
  client?: PrismaClientOrTx
): Promise<number> {
  const db = client ?? (await getDb());
  return db.examRoom.count({ where: buildListWhere(filters) });
}

export interface UpdateExamRoomMetadataParams {
  organizationId: string;
  id: string;
  patch: UpdateExamRoomMetadataInput;
}

export async function updateExamRoomMetadata(
  params: UpdateExamRoomMetadataParams,
  client?: PrismaClientOrTx
): Promise<{ count: number }> {
  const db = client ?? (await getDb());
  const res = await db.examRoom.updateMany({
    where: { id: params.id, organizationId: params.organizationId, deletedAt: null },
    data: { ...params.patch },
  });
  return { count: res.count };
}

export async function softDeleteExamRoom(
  params: FindExamRoomByIdParams,
  client?: PrismaClientOrTx
): Promise<{ count: number }> {
  const db = client ?? (await getDb());
  const res = await db.examRoom.updateMany({
    where: { id: params.id, organizationId: params.organizationId, deletedAt: null },
    data: { deletedAt: new Date() },
  });
  return { count: res.count };
}

// ─── PHASE 4 — archive + future-session read ──────────────────────────────────

/** Conditional soft delete: archives a live room (status → INACTIVE + stamps
 *  `deletedAt`), freeing its filtered-unique code. `where deletedAt: null` makes a
 *  double-archive / missing-room a race-safe no-op (`{ count: 0 }`); the command
 *  asserts `count === 1`. NO decision here. */
export async function archiveExamRoom(
  params: ArchiveExamRoomParams,
  client?: PrismaClientOrTx
): Promise<{ count: number }> {
  const db = client ?? (await getDb());
  const res = await db.examRoom.updateMany({
    where: { id: params.id, organizationId: params.organizationId, deletedAt: null },
    data: { status: "INACTIVE", deletedAt: new Date() },
  });
  return { count: res.count };
}

/** READ-ONLY. Live, non-CANCELLED sessions in this room that end after `after`
 *  (i.e. still upcoming / in-flight). The archive command decides whether a
 *  non-empty result blocks archival; this layer applies no rule. */
export async function findFutureSessionsByRoom(
  params: FindFutureSessionsByRoomParams,
  client?: PrismaClientOrTx
): Promise<ExamRoomFutureSessionRef[]> {
  const db = client ?? (await getDb());
  const rows = await db.examSession.findMany({
    where: {
      organizationId: params.organizationId,
      roomId: params.roomId,
      deletedAt: null,
      status: { notIn: ["CANCELLED"] },
      endsAt: { gt: params.after },
    },
    select: { id: true, status: true, startsAt: true, endsAt: true },
    orderBy: [{ startsAt: "asc" }, { id: "asc" }],
  });
  return rows.map((r) => ({
    id: r.id as string,
    status: r.status as string,
    startsAt: r.startsAt as Date,
    endsAt: r.endsAt as Date,
  }));
}
