import { getDb } from "@/server/db";
import type { PrismaClientOrTx } from "@/server/db";
import type {
  AttendanceBySessionParams,
  CreateExamAttendanceInput,
  ExamAttendanceRecord,
  ListExamAttendanceFilters,
  UpdateExamAttendanceConditionallyParams,
  UpdateExamAttendanceMetadataInput,
} from "@/modules/examinations/types/repository";

// =============================================================================
// EXAM ATTENDANCE REPOSITORY (Phase 2) — persistence only
// -----------------------------------------------------------------------------
// Tenant-safe access for exam-day attendance, one row per candidate
// (examCandidateId is @unique). Separate from class attendance (D8) — this layer
// never touches the Attendance Engine and makes NO decision about presence rules.
// No `deletedAt` on this model → NO soft delete, NO hard delete, NO findUnique,
// NO update-by-id.
// =============================================================================

const attendanceSelect = {
  id: true,
  organizationId: true,
  examCandidateId: true,
  status: true,
  checkedInAt: true,
  markedAt: true,
  markedById: true,
  remarks: true,
  createdAt: true,
  updatedAt: true,
} as const;

type Row = Record<string, unknown>;

function toRecord(row: Row): ExamAttendanceRecord {
  return {
    id: row.id as string,
    organizationId: row.organizationId as string,
    examCandidateId: row.examCandidateId as string,
    status: row.status as string,
    checkedInAt: (row.checkedInAt as Date | null) ?? null,
    markedAt: (row.markedAt as Date | null) ?? null,
    markedById: (row.markedById as string | null) ?? null,
    remarks: (row.remarks as string | null) ?? null,
    createdAt: row.createdAt as Date,
    updatedAt: row.updatedAt as Date,
  };
}

export async function createExamAttendance(
  params: CreateExamAttendanceInput,
  client?: PrismaClientOrTx
): Promise<ExamAttendanceRecord> {
  const db = client ?? (await getDb());
  const row = await db.examAttendance.create({
    data: {
      organizationId: params.organizationId,
      examCandidateId: params.examCandidateId,
      status: params.status,
      checkedInAt: params.checkedInAt ?? null,
      markedAt: params.markedAt ?? null,
      markedById: params.markedById ?? null,
      remarks: params.remarks ?? null,
    },
    select: attendanceSelect,
  });
  return toRecord(row);
}

export interface FindAttendanceByCandidateIdParams {
  organizationId: string;
  examCandidateId: string;
}

export async function findAttendanceByCandidateId(
  params: FindAttendanceByCandidateIdParams,
  client?: PrismaClientOrTx
): Promise<ExamAttendanceRecord | null> {
  const db = client ?? (await getDb());
  const row = await db.examAttendance.findFirst({
    where: { organizationId: params.organizationId, examCandidateId: params.examCandidateId },
    select: attendanceSelect,
  });
  return row ? toRecord(row) : null;
}

function buildListWhere(filters: ListExamAttendanceFilters): Record<string, unknown> {
  const where: Record<string, unknown> = { organizationId: filters.organizationId };
  if (filters.status !== undefined) where.status = filters.status;
  return where;
}

export async function listExamAttendance(
  filters: ListExamAttendanceFilters,
  client?: PrismaClientOrTx
): Promise<ExamAttendanceRecord[]> {
  const db = client ?? (await getDb());
  const rows = await db.examAttendance.findMany({
    where: buildListWhere(filters),
    select: attendanceSelect,
    orderBy: [{ createdAt: "desc" }, { id: "asc" }],
    skip: filters.skip,
    take: filters.take,
  });
  return rows.map(toRecord);
}

export interface UpdateExamAttendanceMetadataParams {
  organizationId: string;
  id: string;
  patch: UpdateExamAttendanceMetadataInput;
}

export async function updateExamAttendanceMetadata(
  params: UpdateExamAttendanceMetadataParams,
  client?: PrismaClientOrTx
): Promise<{ count: number }> {
  const db = client ?? (await getDb());
  const res = await db.examAttendance.updateMany({
    where: { id: params.id, organizationId: params.organizationId },
    data: { ...params.patch },
  });
  return { count: res.count };
}

// =============================================================================
// PHASE 6 — ATTENDANCE PRIMITIVES (thin, org-scoped; no rule / decision)
// -----------------------------------------------------------------------------
// A conditional correction write that pins the expected current status (a
// concurrently-corrected row matches zero rows → `{ count: 0 }`; the command
// asserts `count === 1`), plus read-only session-scoped roster helpers. Because
// ExamAttendance carries no `examSessionId`, the session-scoped reads load the
// session's candidate ids first, then the attendance rows for that id set. No
// business rule lives here.
// =============================================================================

/** Conditional attendance correction: matches only the row whose current status
 *  equals `expectedStatus` (per candidate, org-scoped). `checkedInAt` / `remarks`
 *  are written only when the caller included them in `patch`. */
export async function updateExamAttendanceConditionally(
  params: UpdateExamAttendanceConditionallyParams,
  client?: PrismaClientOrTx
): Promise<{ count: number }> {
  const db = client ?? (await getDb());
  const res = await db.examAttendance.updateMany({
    where: {
      organizationId: params.organizationId,
      examCandidateId: params.examCandidateId,
      status: params.expectedStatus,
    },
    data: { ...params.patch },
  });
  return { count: res.count };
}

/** The live candidate ids of a session (soft-deleted rows excluded). Internal
 *  helper for the session-scoped attendance reads. */
async function sessionCandidateIds(
  params: AttendanceBySessionParams,
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

/** Attendance rows for every candidate in a session (read-only roster). */
export async function listAttendanceBySession(
  params: AttendanceBySessionParams,
  client?: PrismaClientOrTx
): Promise<ExamAttendanceRecord[]> {
  const db = client ?? (await getDb());
  const ids = await sessionCandidateIds(params, db);
  if (ids.length === 0) return [];
  const rows = await db.examAttendance.findMany({
    where: { organizationId: params.organizationId, examCandidateId: { in: ids } },
    select: attendanceSelect,
    orderBy: [{ createdAt: "desc" }, { id: "asc" }],
  });
  return rows.map(toRecord);
}

/** Count of attendance rows recorded for a session's candidates (read-only). */
export async function countAttendanceBySession(
  params: AttendanceBySessionParams,
  client?: PrismaClientOrTx
): Promise<number> {
  const db = client ?? (await getDb());
  const ids = await sessionCandidateIds(params, db);
  if (ids.length === 0) return 0;
  return db.examAttendance.count({
    where: { organizationId: params.organizationId, examCandidateId: { in: ids } },
  });
}

/** REGISTERED candidate ids of a session that have NO attendance row yet — the
 *  "still to check in" roster read. Pure read; decides nothing. */
export async function listCandidatesWithoutAttendance(
  params: AttendanceBySessionParams,
  client?: PrismaClientOrTx
): Promise<string[]> {
  const db = client ?? (await getDb());
  const registered = await db.examCandidate.findMany({
    where: {
      organizationId: params.organizationId,
      examSessionId: params.examSessionId,
      status: "REGISTERED",
      deletedAt: null,
    },
    select: { id: true },
  });
  const ids = registered.map((r) => r.id as string);
  if (ids.length === 0) return [];
  const marked = await db.examAttendance.findMany({
    where: { organizationId: params.organizationId, examCandidateId: { in: ids } },
    select: { examCandidateId: true },
  });
  const markedIds = new Set(marked.map((r) => r.examCandidateId as string));
  return ids.filter((id) => !markedIds.has(id));
}
