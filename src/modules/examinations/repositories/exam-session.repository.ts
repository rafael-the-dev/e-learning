import { getDb } from "@/server/db";
import type { PrismaClientOrTx } from "@/server/db";
import type {
  CreateExamSessionInput,
  ExamSessionRecord,
  ListExamSessionsFilters,
  MarkExamSessionCancelledParams,
  MarkExamSessionCompletedParams,
  MarkExamSessionLockedParams,
  MarkExamSessionPublishedParams,
  MarkExamSessionResultsRecordedParams,
  MarkExamSessionScheduledParams,
  MarkExamSessionStartedParams,
  ReturnExamSessionToResultsRecordedParams,
  UpdateExamSessionMetadataInput,
} from "@/modules/examinations/types/repository";

// =============================================================================
// EXAM SESSION REPOSITORY (Phase 2) — persistence only
// -----------------------------------------------------------------------------
// Tenant-safe access for scheduled exam sittings. Makes NO scheduling decision:
// the conflict helpers below only READ the rows that *could* overlap in time /
// room / invigilator — the Phase 4 scheduling command decides whether an overlap
// is disallowed. Org-scoped throughout; soft delete sets `deletedAt`; NO hard
// delete, NO findUnique, NO update-by-id.
// =============================================================================

const sessionSelect = {
  id: true,
  organizationId: true,
  periodId: true,
  branchId: true,
  courseId: true,
  courseLevelId: true,
  levelSubjectId: true,
  roomId: true,
  title: true,
  status: true,
  startsAt: true,
  endsAt: true,
  capacity: true,
  instructions: true,
  lockedAt: true,
  startedAt: true,
  completedAt: true,
  publishedAt: true,
  cancelledAt: true,
  createdById: true,
  lockedById: true,
  completedById: true,
  publishedById: true,
  cancelledById: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
} as const;

type Row = Record<string, unknown>;

function toRecord(row: Row): ExamSessionRecord {
  return {
    id: row.id as string,
    organizationId: row.organizationId as string,
    periodId: row.periodId as string,
    branchId: (row.branchId as string | null) ?? null,
    courseId: (row.courseId as string | null) ?? null,
    courseLevelId: (row.courseLevelId as string | null) ?? null,
    levelSubjectId: row.levelSubjectId as string,
    roomId: (row.roomId as string | null) ?? null,
    title: row.title as string,
    status: row.status as string,
    startsAt: row.startsAt as Date,
    endsAt: row.endsAt as Date,
    capacity: row.capacity as number,
    instructions: (row.instructions as string | null) ?? null,
    lockedAt: (row.lockedAt as Date | null) ?? null,
    startedAt: (row.startedAt as Date | null) ?? null,
    completedAt: (row.completedAt as Date | null) ?? null,
    publishedAt: (row.publishedAt as Date | null) ?? null,
    cancelledAt: (row.cancelledAt as Date | null) ?? null,
    createdById: (row.createdById as string | null) ?? null,
    lockedById: (row.lockedById as string | null) ?? null,
    completedById: (row.completedById as string | null) ?? null,
    publishedById: (row.publishedById as string | null) ?? null,
    cancelledById: (row.cancelledById as string | null) ?? null,
    createdAt: row.createdAt as Date,
    updatedAt: row.updatedAt as Date,
    deletedAt: (row.deletedAt as Date | null) ?? null,
  };
}

export async function createExamSession(
  params: CreateExamSessionInput,
  client?: PrismaClientOrTx
): Promise<ExamSessionRecord> {
  const db = client ?? (await getDb());
  const row = await db.examSession.create({
    data: {
      organizationId: params.organizationId,
      periodId: params.periodId,
      levelSubjectId: params.levelSubjectId,
      title: params.title,
      startsAt: params.startsAt,
      endsAt: params.endsAt,
      capacity: params.capacity,
      branchId: params.branchId ?? null,
      courseId: params.courseId ?? null,
      courseLevelId: params.courseLevelId ?? null,
      roomId: params.roomId ?? null,
      status: params.status,
      instructions: params.instructions ?? null,
      createdById: params.createdById ?? null,
    },
    select: sessionSelect,
  });
  return toRecord(row);
}

export interface FindExamSessionByIdParams {
  organizationId: string;
  id: string;
}

export async function findExamSessionById(
  params: FindExamSessionByIdParams,
  client?: PrismaClientOrTx
): Promise<ExamSessionRecord | null> {
  const db = client ?? (await getDb());
  const row = await db.examSession.findFirst({
    where: { id: params.id, organizationId: params.organizationId },
    select: sessionSelect,
  });
  return row ? toRecord(row) : null;
}

function buildListWhere(filters: ListExamSessionsFilters): Record<string, unknown> {
  const where: Record<string, unknown> = { organizationId: filters.organizationId };
  if (filters.periodId !== undefined) where.periodId = filters.periodId;
  if (filters.levelSubjectId !== undefined) where.levelSubjectId = filters.levelSubjectId;
  if (filters.status !== undefined) where.status = filters.status;
  if (filters.roomId !== undefined) where.roomId = filters.roomId;
  if (!filters.includeDeleted) where.deletedAt = null;
  return where;
}

export async function listExamSessions(
  filters: ListExamSessionsFilters,
  client?: PrismaClientOrTx
): Promise<ExamSessionRecord[]> {
  const db = client ?? (await getDb());
  const rows = await db.examSession.findMany({
    where: buildListWhere(filters),
    select: sessionSelect,
    orderBy: [{ createdAt: "desc" }, { id: "asc" }],
    skip: filters.skip,
    take: filters.take,
  });
  return rows.map(toRecord);
}

export async function countExamSessions(
  filters: ListExamSessionsFilters,
  client?: PrismaClientOrTx
): Promise<number> {
  const db = client ?? (await getDb());
  return db.examSession.count({ where: buildListWhere(filters) });
}

export interface UpdateExamSessionMetadataParams {
  organizationId: string;
  id: string;
  patch: UpdateExamSessionMetadataInput;
}

export async function updateExamSessionMetadata(
  params: UpdateExamSessionMetadataParams,
  client?: PrismaClientOrTx
): Promise<{ count: number }> {
  const db = client ?? (await getDb());
  const res = await db.examSession.updateMany({
    where: { id: params.id, organizationId: params.organizationId, deletedAt: null },
    data: { ...params.patch },
  });
  return { count: res.count };
}

export async function softDeleteExamSession(
  params: FindExamSessionByIdParams,
  client?: PrismaClientOrTx
): Promise<{ count: number }> {
  const db = client ?? (await getDb());
  const res = await db.examSession.updateMany({
    where: { id: params.id, organizationId: params.organizationId, deletedAt: null },
    data: { deletedAt: new Date() },
  });
  return { count: res.count };
}

// ─── PHASE 4 — lifecycle transitions (conditional writes) ─────────────────────
// Race-safe conditional writes: `where` pins the expected current status so a
// wrong/terminal/concurrently-moved state matches zero rows → `{ count: 0 }`.
// The command asserts `count === 1`; no decision, no event/audit here. ExamSession
// has NO `scheduledAt` and NO `startedById` column — those are intentionally not set.

/** DRAFT → SCHEDULED. */
export async function markSessionScheduled(
  params: MarkExamSessionScheduledParams,
  client?: PrismaClientOrTx
): Promise<{ count: number }> {
  const db = client ?? (await getDb());
  const res = await db.examSession.updateMany({
    where: { id: params.id, organizationId: params.organizationId, status: "DRAFT", deletedAt: null },
    data: { status: "SCHEDULED" },
  });
  return { count: res.count };
}

/** SCHEDULED → LOCKED. */
export async function markSessionLocked(
  params: MarkExamSessionLockedParams,
  client?: PrismaClientOrTx
): Promise<{ count: number }> {
  const db = client ?? (await getDb());
  const res = await db.examSession.updateMany({
    where: { id: params.id, organizationId: params.organizationId, status: "SCHEDULED", deletedAt: null },
    data: { status: "LOCKED", lockedAt: new Date(), lockedById: params.lockedById ?? null },
  });
  return { count: res.count };
}

/** LOCKED → IN_PROGRESS. */
export async function markSessionStarted(
  params: MarkExamSessionStartedParams,
  client?: PrismaClientOrTx
): Promise<{ count: number }> {
  const db = client ?? (await getDb());
  const res = await db.examSession.updateMany({
    where: { id: params.id, organizationId: params.organizationId, status: "LOCKED", deletedAt: null },
    data: { status: "IN_PROGRESS", startedAt: new Date() },
  });
  return { count: res.count };
}

/** IN_PROGRESS → COMPLETED. */
export async function markSessionCompleted(
  params: MarkExamSessionCompletedParams,
  client?: PrismaClientOrTx
): Promise<{ count: number }> {
  const db = client ?? (await getDb());
  const res = await db.examSession.updateMany({
    where: { id: params.id, organizationId: params.organizationId, status: "IN_PROGRESS", deletedAt: null },
    data: { status: "COMPLETED", completedAt: new Date(), completedById: params.completedById ?? null },
  });
  return { count: res.count };
}

/** DRAFT | SCHEDULED | LOCKED → CANCELLED. */
export async function markSessionCancelled(
  params: MarkExamSessionCancelledParams,
  client?: PrismaClientOrTx
): Promise<{ count: number }> {
  const db = client ?? (await getDb());
  const res = await db.examSession.updateMany({
    where: {
      id: params.id,
      organizationId: params.organizationId,
      status: { in: ["DRAFT", "SCHEDULED", "LOCKED"] },
      deletedAt: null,
    },
    data: { status: "CANCELLED", cancelledAt: new Date(), cancelledById: params.cancelledById ?? null },
  });
  return { count: res.count };
}

// ─── PHASE 9 — publication transitions (conditional writes) ───────────────────
// Same race-safe pattern as Phase 4: `where` pins the expected current status so a
// wrong/concurrently-moved state matches zero rows → `{ count: 0 }`; the command
// asserts the expected count. No readiness / visibility decision, no event / audit
// here — the Phase-9 publication command owns those.

/** COMPLETED → RESULTS_RECORDED. */
export async function markExamSessionResultsRecorded(
  params: MarkExamSessionResultsRecordedParams,
  client?: PrismaClientOrTx
): Promise<{ count: number }> {
  const db = client ?? (await getDb());
  const res = await db.examSession.updateMany({
    where: { id: params.id, organizationId: params.organizationId, status: "COMPLETED", deletedAt: null },
    data: { status: "RESULTS_RECORDED" },
  });
  return { count: res.count };
}

/** RESULTS_RECORDED → PUBLISHED (stamps `publishedAt` / `publishedById`). */
export async function markExamSessionPublished(
  params: MarkExamSessionPublishedParams,
  client?: PrismaClientOrTx
): Promise<{ count: number }> {
  const db = client ?? (await getDb());
  const res = await db.examSession.updateMany({
    where: { id: params.id, organizationId: params.organizationId, status: "RESULTS_RECORDED", deletedAt: null },
    data: { status: "PUBLISHED", publishedAt: new Date(), publishedById: params.publishedById ?? null },
  });
  return { count: res.count };
}

/** PUBLISHED → RESULTS_RECORDED (retraction; clears the publication stamps). */
export async function returnExamSessionToResultsRecorded(
  params: ReturnExamSessionToResultsRecordedParams,
  client?: PrismaClientOrTx
): Promise<{ count: number }> {
  const db = client ?? (await getDb());
  const res = await db.examSession.updateMany({
    where: { id: params.id, organizationId: params.organizationId, status: "PUBLISHED", deletedAt: null },
    data: { status: "RESULTS_RECORDED", publishedAt: null, publishedById: null },
  });
  return { count: res.count };
}

// ─── READ-ONLY conflict helpers (Phase 4 scheduling command decides) ──────────
// Overlap predicate: session.startsAt < endsAt AND session.endsAt > startsAt.
// CANCELLED and soft-deleted sessions are excluded (they never occupy a slot).

export interface SessionTimeRangeParams {
  organizationId: string;
  startsAt: Date;
  endsAt: Date;
}

/** Live, non-CANCELLED sessions whose time window overlaps [startsAt, endsAt).
 *  A pure read — the caller decides whether any overlap is a conflict. */
export async function listSessionsInTimeRange(
  params: SessionTimeRangeParams,
  client?: PrismaClientOrTx
): Promise<ExamSessionRecord[]> {
  const db = client ?? (await getDb());
  const rows = await db.examSession.findMany({
    where: {
      organizationId: params.organizationId,
      deletedAt: null,
      status: { not: "CANCELLED" },
      startsAt: { lt: params.endsAt },
      endsAt: { gt: params.startsAt },
    },
    select: sessionSelect,
    orderBy: [{ startsAt: "asc" }, { id: "asc" }],
  });
  return rows.map(toRecord);
}

export interface SessionByRoomTimeRangeParams extends SessionTimeRangeParams {
  roomId: string;
}

/** Overlapping live sessions in one room — the room double-booking read. */
export async function listSessionsByRoomInTimeRange(
  params: SessionByRoomTimeRangeParams,
  client?: PrismaClientOrTx
): Promise<ExamSessionRecord[]> {
  const db = client ?? (await getDb());
  const rows = await db.examSession.findMany({
    where: {
      organizationId: params.organizationId,
      roomId: params.roomId,
      deletedAt: null,
      status: { not: "CANCELLED" },
      startsAt: { lt: params.endsAt },
      endsAt: { gt: params.startsAt },
    },
    select: sessionSelect,
    orderBy: [{ startsAt: "asc" }, { id: "asc" }],
  });
  return rows.map(toRecord);
}

export interface SessionByInvigilatorTimeRangeParams extends SessionTimeRangeParams {
  teacherId?: string;
  userId?: string;
}

/** Overlapping live sessions this invigilator (by teacherId and/or userId) is
 *  assigned to — the invigilator double-booking read. Because assignments are a
 *  separate table with no clean single query to sessions, this loads the
 *  assignment rows first, then the overlapping sessions in that id set. Still a
 *  simple read: no decision, no conflict rule applied here. */
export async function listSessionsByInvigilatorInTimeRange(
  params: SessionByInvigilatorTimeRangeParams,
  client?: PrismaClientOrTx
): Promise<ExamSessionRecord[]> {
  const db = client ?? (await getDb());

  const hasTeacher = params.teacherId !== undefined;
  const hasUser = params.userId !== undefined;
  if (!hasTeacher && !hasUser) return [];

  // Plain equality where when exactly one pointer is given; OR only when both are.
  const assignmentWhere: Record<string, unknown> = { organizationId: params.organizationId };
  if (hasTeacher && hasUser) {
    assignmentWhere.OR = [{ teacherId: params.teacherId }, { userId: params.userId }];
  } else if (hasTeacher) {
    assignmentWhere.teacherId = params.teacherId;
  } else {
    assignmentWhere.userId = params.userId;
  }

  const assignments = await db.examInvigilatorAssignment.findMany({
    where: assignmentWhere,
    select: { examSessionId: true },
  });
  const sessionIds = Array.from(
    new Set(assignments.map((a) => a.examSessionId as string))
  );
  if (sessionIds.length === 0) return [];

  const rows = await db.examSession.findMany({
    where: {
      organizationId: params.organizationId,
      id: { in: sessionIds },
      deletedAt: null,
      status: { not: "CANCELLED" },
      startsAt: { lt: params.endsAt },
      endsAt: { gt: params.startsAt },
    },
    select: sessionSelect,
    orderBy: [{ startsAt: "asc" }, { id: "asc" }],
  });
  return rows.map(toRecord);
}
