import { getDb } from "@/server/db";
import type { PrismaClientOrTx } from "@/server/db";
import { isSessionConsumed } from "@/modules/examinations/commands/integration-shared";

// =============================================================================
// EXAMINATION ADMIN PORTAL — BATCHED READ REPOSITORY (Phase 12, Increment 2)
// -----------------------------------------------------------------------------
// The ONLY new Prisma layer for the portal: tenant-scoped, minimal-`select`,
// BATCHED-by-ids reads that the admin read services need (display enrichment +
// cross-entity projections + conflict/health detection). READ-ONLY — no writes,
// no business rules. Keeps the frozen v1.0 engine repositories untouched. Portal
// read services call these; they never touch Prisma directly.
// =============================================================================

const toNum = (v: unknown): number | null => (v == null ? null : Number(v));

/** Read-only wrapper so read services can check downstream consumption without
 *  importing `@/server/db` (they must not). Reuses the canonical shared rule. */
export async function isSessionConsumedRead(
  organizationId: string,
  examSessionId: string
): Promise<boolean> {
  const db = await getDb();
  return isSessionConsumed({ organizationId, examSessionId }, db);
}

// ─── Academic display batches (for studentNumber / name / enrollment / subject) ─

export interface StudentDisplay {
  id: string;
  code: string | null;
  firstName: string;
  lastName: string;
}
export async function listStudentDisplayByIds(
  organizationId: string,
  studentIds: string[],
  client?: PrismaClientOrTx
): Promise<StudentDisplay[]> {
  if (studentIds.length === 0) return [];
  const db = client ?? (await getDb());
  return db.student.findMany({
    where: { organizationId, id: { in: studentIds } },
    select: { id: true, code: true, firstName: true, lastName: true },
  });
}

export interface EnrollmentDisplay {
  id: string;
  enrollmentNumber: string | null;
}
export async function listEnrollmentDisplayByIds(
  organizationId: string,
  enrollmentIds: string[],
  client?: PrismaClientOrTx
): Promise<EnrollmentDisplay[]> {
  if (enrollmentIds.length === 0) return [];
  const db = client ?? (await getDb());
  return db.enrollment.findMany({
    where: { organizationId, id: { in: enrollmentIds } },
    select: { id: true, enrollmentNumber: true },
  });
}

export interface LevelSubjectName {
  levelSubjectId: string;
  subjectName: string | null;
}
export async function listSubjectNamesByLevelSubjectIds(
  organizationId: string,
  levelSubjectIds: string[],
  client?: PrismaClientOrTx
): Promise<LevelSubjectName[]> {
  if (levelSubjectIds.length === 0) return [];
  const db = client ?? (await getDb());
  const rows = await db.levelSubject.findMany({
    where: { organizationId, id: { in: levelSubjectIds } },
    select: { id: true, subject: { select: { name: true } } },
  });
  return rows.map((r) => ({ levelSubjectId: r.id, subjectName: r.subject?.name ?? null }));
}

export interface BranchName {
  id: string;
  name: string;
}
export async function listBranchNamesByIds(
  organizationId: string,
  branchIds: string[],
  client?: PrismaClientOrTx
): Promise<BranchName[]> {
  if (branchIds.length === 0) return [];
  const db = client ?? (await getDb());
  return db.branch.findMany({
    where: { organizationId, id: { in: branchIds } },
    select: { id: true, name: true },
  });
}

// ─── Room portal list (org-wide, DB-filtered + paginated) ──────────────────────

export interface RoomPortalRow {
  id: string;
  organizationId: string;
  branchId: string | null;
  name: string;
  code: string | null;
  capacity: number;
  status: string;
  description: string | null;
  createdAt: Date;
  updatedAt: Date;
}
export interface RoomPortalFilters {
  organizationId: string;
  branchId?: string;
  status?: string;
  minCapacity?: number;
  maxCapacity?: number;
  search?: string;
}
function buildRoomWhere(f: RoomPortalFilters): Record<string, unknown> {
  const where: Record<string, unknown> = { organizationId: f.organizationId, deletedAt: null };
  if (f.branchId) where.branchId = f.branchId;
  if (f.status) where.status = f.status;
  if (f.minCapacity != null || f.maxCapacity != null) {
    where.capacity = {
      ...(f.minCapacity != null ? { gte: f.minCapacity } : {}),
      ...(f.maxCapacity != null ? { lte: f.maxCapacity } : {}),
    };
  }
  if (f.search) {
    where.OR = [
      { name: { contains: f.search } },
      { code: { contains: f.search } },
    ];
  }
  return where;
}
export async function listRoomsForPortal(
  filters: RoomPortalFilters & { skip: number; take: number },
  client?: PrismaClientOrTx
): Promise<RoomPortalRow[]> {
  const db = client ?? (await getDb());
  return db.examRoom.findMany({
    where: buildRoomWhere(filters),
    select: {
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
    },
    orderBy: [{ name: "asc" }, { id: "asc" }],
    skip: filters.skip,
    take: filters.take,
  });
}
export async function countRoomsForPortal(
  filters: RoomPortalFilters,
  client?: PrismaClientOrTx
): Promise<number> {
  const db = client ?? (await getDb());
  return db.examRoom.count({ where: buildRoomWhere(filters) });
}

// ─── Room → upcoming sessions (batched) ────────────────────────────────────────

export interface UpcomingSessionRef {
  roomId: string;
  id: string;
  title: string;
  status: string;
  startsAt: Date;
  endsAt: Date;
}
/** Non-terminal sessions (SCHEDULED / LOCKED / IN_PROGRESS) attached to the given
 *  rooms — "upcoming/active" occupancy. One query for the whole room set. */
export async function listUpcomingSessionsByRoomIds(
  organizationId: string,
  roomIds: string[],
  client?: PrismaClientOrTx
): Promise<UpcomingSessionRef[]> {
  if (roomIds.length === 0) return [];
  const db = client ?? (await getDb());
  const rows = await db.examSession.findMany({
    where: {
      organizationId,
      deletedAt: null,
      roomId: { in: roomIds },
      status: { in: ["SCHEDULED", "LOCKED", "IN_PROGRESS"] },
    },
    select: { id: true, title: true, status: true, startsAt: true, endsAt: true, roomId: true },
    orderBy: { startsAt: "asc" },
  });
  return rows.map((r) => ({
    roomId: r.roomId as string,
    id: r.id,
    title: r.title,
    status: r.status,
    startsAt: r.startsAt,
    endsAt: r.endsAt,
  }));
}

// ─── Result → current revisions (batched official overlay) ─────────────────────

export interface CurrentRevisionProjection {
  examResultId: string;
  revisionId: string;
  revisionNumber: number;
  revisedScore: number | null;
}
export async function listCurrentRevisionsByResultIds(
  organizationId: string,
  resultIds: string[],
  client?: PrismaClientOrTx
): Promise<CurrentRevisionProjection[]> {
  if (resultIds.length === 0) return [];
  const db = client ?? (await getDb());
  const rows = await db.examResultRevision.findMany({
    where: { organizationId, examResultId: { in: resultIds }, isCurrent: true },
    select: { id: true, examResultId: true, revisionNumber: true, revisedScore: true },
  });
  return rows.map((r) => ({
    examResultId: r.examResultId,
    revisionId: r.id,
    revisionNumber: r.revisionNumber,
    revisedScore: toNum(r.revisedScore),
  }));
}

// ─── Results by ids (batched projection, e.g. for appeals) ─────────────────────

export interface ResultProjection {
  id: string;
  examCandidateId: string;
  levelSubjectId: string;
  status: string;
  resultCode: string | null;
  score: number | null;
  maxScore: number;
  normalizedScore: number | null;
  currentRevisionId: string | null;
}
export async function listResultsByIds(
  organizationId: string,
  resultIds: string[],
  client?: PrismaClientOrTx
): Promise<ResultProjection[]> {
  if (resultIds.length === 0) return [];
  const db = client ?? (await getDb());
  const rows = await db.examResult.findMany({
    where: { organizationId, id: { in: resultIds } },
    select: {
      id: true,
      examCandidateId: true,
      levelSubjectId: true,
      status: true,
      resultCode: true,
      score: true,
      maxScore: true,
      normalizedScore: true,
      currentRevisionId: true,
    },
  });
  return rows.map((r) => ({
    id: r.id,
    examCandidateId: r.examCandidateId,
    levelSubjectId: r.levelSubjectId,
    status: r.status,
    resultCode: r.resultCode ?? null,
    score: toNum(r.score),
    maxScore: Number(r.maxScore),
    normalizedScore: toNum(r.normalizedScore),
    currentRevisionId: r.currentRevisionId ?? null,
  }));
}

// ─── Result → integration ledger events (batched) ──────────────────────────────

export interface IntegrationEventProjection {
  examResultId: string;
  eventType: string;
  metadata: string | null;
  createdAt: Date;
}
export async function listIntegrationEventsByResultIds(
  organizationId: string,
  resultIds: string[],
  client?: PrismaClientOrTx
): Promise<IntegrationEventProjection[]> {
  if (resultIds.length === 0) return [];
  const db = client ?? (await getDb());
  const rows = await db.examEvent.findMany({
    where: {
      organizationId,
      aggregateType: "EXAM_RESULT",
      aggregateId: { in: resultIds },
      eventType: { in: ["exam_result.integrated", "exam_result.integration_reconciled"] },
    },
    select: { aggregateId: true, eventType: true, metadata: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });
  return rows.map((r) => ({
    examResultId: r.aggregateId,
    eventType: r.eventType,
    metadata: r.metadata ?? null,
    createdAt: r.createdAt,
  }));
}

// ─── Conflict / health detection reads ─────────────────────────────────────────

export interface ConflictSessionRow {
  id: string;
  title: string;
  status: string;
  startsAt: Date;
  endsAt: Date;
  roomId: string | null;
  capacity: number;
  periodId: string;
}
/** Non-cancelled, schedulable/active sessions used for conflict detection. */
export async function listSessionsForConflicts(
  organizationId: string,
  client?: PrismaClientOrTx
): Promise<ConflictSessionRow[]> {
  const db = client ?? (await getDb());
  const rows = await db.examSession.findMany({
    where: {
      organizationId,
      deletedAt: null,
      status: { in: ["SCHEDULED", "LOCKED", "IN_PROGRESS"] },
    },
    select: {
      id: true,
      title: true,
      status: true,
      startsAt: true,
      endsAt: true,
      roomId: true,
      capacity: true,
      periodId: true,
    },
    orderBy: { startsAt: "asc" },
  });
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    status: r.status,
    startsAt: r.startsAt,
    endsAt: r.endsAt,
    roomId: r.roomId ?? null,
    capacity: r.capacity,
    periodId: r.periodId,
  }));
}

export interface InvigilatorAssignmentRow {
  examSessionId: string;
  invigilatorId: string;
}
export async function listInvigilatorAssignmentsBySessionIds(
  organizationId: string,
  sessionIds: string[],
  client?: PrismaClientOrTx
): Promise<InvigilatorAssignmentRow[]> {
  if (sessionIds.length === 0) return [];
  const db = client ?? (await getDb());
  const rows = await db.examInvigilatorAssignment.findMany({
    where: { organizationId, examSessionId: { in: sessionIds } },
    select: { examSessionId: true, teacherId: true, userId: true },
  });
  return rows.map((r) => ({
    examSessionId: r.examSessionId,
    invigilatorId: (r.teacherId ?? r.userId ?? "") as string,
  }));
}

export interface SessionCandidateCount {
  examSessionId: string;
  activeCount: number;
}
export async function countActiveCandidatesBySessionIds(
  organizationId: string,
  sessionIds: string[],
  client?: PrismaClientOrTx
): Promise<SessionCandidateCount[]> {
  if (sessionIds.length === 0) return [];
  const db = client ?? (await getDb());
  const rows = await db.examCandidate.groupBy({
    by: ["examSessionId"],
    where: {
      organizationId,
      examSessionId: { in: sessionIds },
      deletedAt: null,
      status: { notIn: ["WITHDRAWN", "DISQUALIFIED"] },
    },
    _count: { _all: true },
  });
  return rows.map((r) => ({ examSessionId: r.examSessionId, activeCount: r._count._all }));
}

export interface PeriodWindow {
  id: string;
  startsAt: Date;
  endsAt: Date;
}
export async function listPeriodWindowsByIds(
  organizationId: string,
  periodIds: string[],
  client?: PrismaClientOrTx
): Promise<PeriodWindow[]> {
  if (periodIds.length === 0) return [];
  const db = client ?? (await getDb());
  return db.examPeriod.findMany({
    where: { organizationId, id: { in: periodIds } },
    select: { id: true, startsAt: true, endsAt: true },
  });
}

export interface ActiveBindingRef {
  examSessionId: string;
  bindingId: string;
  assessmentComponentId: string;
}
export async function listActiveBindingsBySessionIds(
  organizationId: string,
  sessionIds: string[],
  client?: PrismaClientOrTx
): Promise<ActiveBindingRef[]> {
  if (sessionIds.length === 0) return [];
  const db = client ?? (await getDb());
  const rows = await db.examGradeComponentBinding.findMany({
    where: { organizationId, examSessionId: { in: sessionIds }, deletedAt: null },
    select: { id: true, examSessionId: true, assessmentComponentId: true },
  });
  return rows.map((r) => ({
    examSessionId: r.examSessionId,
    bindingId: r.id,
    assessmentComponentId: r.assessmentComponentId,
  }));
}
